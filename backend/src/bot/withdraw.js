import { logger } from "../utils/logger.js";
import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";
import { ethers } from "ethers";
import { decryptAES } from "../utils/aes.js";
import { coreWithdraw, arbitrumWithdraw } from "../utils/withdraw.js";
import { sessionManager } from "./sessionManager.js";
import {
  cancelButton,
  backToMenuButton,
  successMessage,
  errorMessage,
  infoMessage,
  formatUSDC,
} from "./navigation.js";
import { Markup } from "telegraf";

const FLOW_TYPE = "withdraw";

export async function handleWithdraw(ctx) {
  try {
    const telegramId = ctx.from.id;

    // Check for existing session
    if (sessionManager.hasSession(telegramId)) {
      const existingSession = sessionManager.getSession(telegramId);
      await ctx.reply(
        infoMessage(
          `You have an active ${existingSession.flowType} flow. Please complete or cancel it first.`
        ),
        Markup.inlineKeyboard([
          [cancelButton(existingSession.flowType), backToMenuButton()],
        ])
      );
      return;
    }

    sessionManager.setSession(telegramId, FLOW_TYPE, "awaiting_network", {});
    
    const networkKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔷 HyperCore", callback_data: "withdraw_net_core" },
            { text: "🔵 Arbitrum", callback_data: "withdraw_net_arbitrum" },
          ],
          [cancelButton(FLOW_TYPE), backToMenuButton()],
        ],
      },
    };
    await ctx.reply("💸 Choose the network for withdrawal:", networkKeyboard);
  } catch (error) {
    logger.error("Error in /withdraw command", error);
    sessionManager.clearSession(ctx.from.id);
    await ctx.reply(errorMessage("Failed to start withdraw. Please try again later."));
  }
}

export default function registerWithdrawHandler(bot) {
  // Handle withdraw button click
  bot.action("withdraw_start", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await handleWithdraw(ctx);
    } catch (error) {
      logger.error("Error in handleWithdraw (start)", error);
      try {
        await ctx.answerCbQuery("Failed to start withdraw ❌");
      } catch (_) {}
    }
  });

  // Handle cancel button
  bot.action(`cancel_${FLOW_TYPE}`, async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    sessionManager.clearSession(ctx.from.id);
    await ctx.reply(infoMessage("Withdrawal cancelled."));
    
    const { showMainMenu } = await import("./menu.js");
    await showMainMenu(ctx);
  });

  // Handle network selection
  bot.action("withdraw_net_core", async (ctx) => {
    try {
      await ctx.answerCbQuery("HyperCore selected");
      const telegramId = ctx.from.id;
      const network = "core";
      
      sessionManager.updateSessionData(telegramId, { network });
      sessionManager.updateSessionStep(telegramId, "awaiting_address");
      
      const prompt = "📬 Please send the destination address (EVM) to withdraw to:";
      await ctx.reply(
        prompt,
        Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
      );
    } catch (error) {
      logger.error("Error in handleWithdrawNetworkSelect", error);
      sessionManager.clearSession(ctx.from.id);
    }
  });

  bot.action("withdraw_net_arbitrum", async (ctx) => {
    try {
      await ctx.answerCbQuery("Arbitrum selected");
      const telegramId = ctx.from.id;
      const network = "arbitrum";
      
      sessionManager.updateSessionData(telegramId, { network });
      sessionManager.updateSessionStep(telegramId, "awaiting_address");
      
      const prompt = "📬 Please send the destination address (EVM) to withdraw to:\n\n⚠️ Note: Withdrawals on Arbitrum incur a 1 USDC fee.";
      await ctx.reply(
        prompt,
        Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
      );
    } catch (error) {
      logger.error("Error in handleWithdrawNetworkSelect", error);
      sessionManager.clearSession(ctx.from.id);
    }
  });

  // Handle text input for withdraw flow
  bot.on("text", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const session = sessionManager.getSession(telegramId, FLOW_TYPE);
    
    if (!session) {
      return next(); // not in a withdraw flow; pass to next handler
    }
    
    try {
      const text = (ctx.message?.text || "").trim();
      
      // STEP 1: ADDRESS
      if (session.step === "awaiting_address") {
        if (!ethers.isAddress(text)) {
          await ctx.reply(
            errorMessage("Invalid address. Please send a valid EVM address:"),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
          return;
        }
        
        sessionManager.updateSessionData(telegramId, { address: text });
        sessionManager.updateSessionStep(telegramId, "awaiting_amount");
        
        const userInfo = await getUserInfo(telegramId);
        const balance = await getBalance(userInfo.hl_address);
        const balanceNum = Number(balance);
        const feeNote =
          session.data.network === "arbitrum"
            ? "\n⚠️ Note: Withdrawals on Arbitrum incur a 1 USDC fee."
            : "";
        
        await ctx.reply(
          `✅ Address saved!\n\n💰 Your available balance: *${formatUSDC(balanceNum, 4)}* USDC${feeNote}\n\n` +
          `Please enter the amount to withdraw (e.g., 12.5):`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [{ text: "💸 Withdraw All", callback_data: "withdraw_all" }],
              [cancelButton(FLOW_TYPE), backToMenuButton()],
            ]),
          }
        );
        return;
      }
      
      // STEP 2: AMOUNT
      if (session.step === "awaiting_amount") {
        const userInfo = await getUserInfo(telegramId);
        const balance = await getBalance(userInfo.hl_address);
        const balanceNum = Number(balance);
        const amountNum = Number(text);
        
        if (!isFinite(amountNum) || amountNum <= 0) {
          await ctx.reply(
            errorMessage("Invalid amount. Please send a positive number:"),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
          return;
        }
        
        if (amountNum > balanceNum) {
          await ctx.reply(
            errorMessage(
              `Amount exceeds your balance (${formatUSDC(balanceNum, 4)} USDC). Please send a smaller amount:`
            ),
            Markup.inlineKeyboard([
              [{ text: "💸 Withdraw All", callback_data: "withdraw_all" }],
              [cancelButton(FLOW_TYPE), backToMenuButton()],
            ])
          );
          return;
        }

        const amountStr = String(amountNum);
        const wallet = new ethers.Wallet(decryptAES(userInfo.hl_privkey));
        const destination = session.data.address;
        const network = session.data.network;

        try {
          await ctx.reply("⏳ Processing withdrawal...");
          
          const result =
            network === "arbitrum"
              ? await arbitrumWithdraw(wallet, destination, amountStr)
              : await coreWithdraw(wallet, destination, amountStr);
              
          logger.info("Withdraw result", { telegramId, result });
          sessionManager.clearSession(telegramId);
          
          const feeLine = network === "arbitrum" ? "\n💵 Fee: 1 USDC" : "";
          const networkName = network === "arbitrum" ? "Arbitrum" : "HyperCore";
          
          await ctx.reply(
            successMessage(
              `Withdrawal requested on ${networkName}!\n\n` +
              `📬 To: \`${destination}\`\n` +
              `💰 Amount: ${amountStr} USDC${feeLine}`
            ),
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [
                  { text: "💰 Check Balance", callback_data: "menu_balance" },
                  { text: "🏠 Menu", callback_data: "menu_main" },
                ],
              ]),
            }
          );
        } catch (err) {
          logger.error("Withdraw execution error", err);
          sessionManager.clearSession(telegramId);
          await ctx.reply(
            errorMessage(`Failed to request withdrawal: ${err.message}`),
            Markup.inlineKeyboard([[backToMenuButton()]])
          );
        }
        return;
      }
    } catch (error) {
      logger.error("Error in handleWithdrawTextInput", error);
      sessionManager.clearSession(telegramId);
      await ctx.reply(
        errorMessage("An error occurred. Withdraw flow has been cancelled."),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
    }
  });

  // Handle "Withdraw All" button
  bot.action("withdraw_all", async (ctx) => {
    try {
      await ctx.answerCbQuery("Withdrawing all available balance");
      const telegramId = ctx.from.id;
      const session = sessionManager.getSession(telegramId, FLOW_TYPE);
      
      if (!session || session.step !== "awaiting_amount") {
        return;
      }

      const userInfo = await getUserInfo(telegramId);
      const balance = await getBalance(userInfo.hl_address);
      const balanceNum = Number(balance);
      
      if (balanceNum <= 0) {
        await ctx.reply(errorMessage("No balance available to withdraw."));
        return;
      }

      // Simulate text input with full balance
      ctx.message = { text: String(balanceNum) };
      // Re-trigger the text handler logic inline
      const wallet = new ethers.Wallet(decryptAES(userInfo.hl_privkey));
      const destination = session.data.address;
      const network = session.data.network;
      const amountStr = String(balanceNum);

      try {
        await ctx.reply("⏳ Processing withdrawal...");
        
        const result =
          network === "arbitrum"
            ? await arbitrumWithdraw(wallet, destination, amountStr)
            : await coreWithdraw(wallet, destination, amountStr);
            
        logger.info("Withdraw all result", { telegramId, result });
        sessionManager.clearSession(telegramId);
        
        const feeLine = network === "arbitrum" ? "\n💵 Fee: 1 USDC" : "";
        const networkName = network === "arbitrum" ? "Arbitrum" : "HyperCore";
        
        await ctx.reply(
          successMessage(
            `Withdrawal requested on ${networkName}!\n\n` +
            `📬 To: \`${destination}\`\n` +
            `💰 Amount: ${amountStr} USDC${feeLine}`
          ),
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                { text: "💰 Check Balance", callback_data: "menu_balance" },
                { text: "🏠 Menu", callback_data: "menu_main" },
              ],
            ]),
          }
        );
      } catch (err) {
        logger.error("Withdraw all execution error", err);
        sessionManager.clearSession(telegramId);
        await ctx.reply(
          errorMessage(`Failed to request withdrawal: ${err.message}`),
          Markup.inlineKeyboard([[backToMenuButton()]])
        );
      }
    } catch (error) {
      logger.error("Error in withdraw_all", error);
      await ctx.answerCbQuery("❌ Error occurred");
    }
  });
}