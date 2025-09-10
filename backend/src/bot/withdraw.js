import { logger } from "../utils/logger.js";
import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";
import { ethers } from "ethers";
import { decryptAES } from "../utils/aes.js";
import { coreWithdraw, arbitrumWithdraw } from "../utils/withdraw.js";

// Export withdrawState to be imported by handlers.js
export const withdrawState = new Map();

export async function handleWithdraw(ctx) {
  try {
    const telegramId = ctx.from.id;
    withdrawState.set(telegramId, { step: "awaiting_network" });
    const networkKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "HyperCore", callback_data: "withdraw_net_core" },
            { text: "Arbitrum", callback_data: "withdraw_net_arbitrum" },
          ],
        ],
      },
    };
    await ctx.reply("Choose the network for withdrawal:", networkKeyboard);
  } catch (error) {
    logger.error("Error in /withdraw command", error);
    await ctx.reply("❌ Failed to start withdraw. Please try again later.");
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

  // Handle network selection
  bot.action("withdraw_net_core", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const telegramId = ctx.from.id;
      const network = "core";
      const prev = withdrawState.get(telegramId) || {};
      withdrawState.set(telegramId, {
        ...prev,
        step: "awaiting_address",
        network,
      });
      const prompt ="Please send the destination address (EVM) to withdraw to:"
      await ctx.reply(prompt);
    } catch (error) {
      logger.error("Error in handleWithdrawNetworkSelect", error);
    }
  });

  bot.action("withdraw_net_arbitrum", async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const telegramId = ctx.from.id;
      const network = "arbitrum";
      const prev = withdrawState.get(telegramId) || {};
      withdrawState.set(telegramId, {
        ...prev,
        step: "awaiting_address",
        network,
      });
      const prompt ="Please send the destination address (EVM) to withdraw to:\n\nNote: Withdrawals on Arbitrum incur a 1 USDC fee."
      await ctx.reply(prompt);
    } catch (error) {
      logger.error("Error in handleWithdrawNetworkSelect", error);
    }
  });

  // Handle text input for withdraw flow
  bot.on("text", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const state = withdrawState.get(telegramId);
    if (!state) {
      return next(); // not in a withdraw flow; pass to next handler
    }
    try {
      const text = (ctx.message?.text || "").trim();
      if (state.step === "awaiting_address") {
        if (!ethers.isAddress(text)) {
          await ctx.reply("❌ Invalid address. Please send a valid EVM address:");
          return;
        }
        withdrawState.set(telegramId, {
          ...state,
          step: "awaiting_amount",
          address: text,
        });
        const userInfo = await getUserInfo(telegramId);
        const balance = await getBalance(userInfo.hl_address);
        const balanceNum = Number(balance);
        const feeNote =
          state.network === "arbitrum"
            ? "\nNote: Withdrawals on Arbitrum incur a 1 USDC fee."
            : "";
        await ctx.reply(
          `Address saved. Your available balance is ${balanceNum.toFixed(
            4
          )} USDC.${feeNote}\n\nPlease send the amount to withdraw (e.g. 12.5):`
        );
        return;
      }
      if (state.step === "awaiting_amount") {
        const userInfo = await getUserInfo(telegramId);
        const balance = await getBalance(userInfo.hl_address);
        const balanceNum = Number(balance);
        const amountNum = Number(text);
        if (!isFinite(amountNum) || amountNum <= 0) {
          await ctx.reply("❌ Invalid amount. Please send a positive number:");
          return;
        }
        if (amountNum > balanceNum) {
          await ctx.reply(
            `❌ Amount exceeds your balance (${balanceNum.toFixed(
              4
            )} USDC). Please send a smaller amount:`
          );
          return;
        }

        const amountStr = String(amountNum);
        const wallet = new ethers.Wallet(decryptAES(userInfo.hl_privkey));
        const destination = state.address;

        try {
          const result =
            state.network === "arbitrum"
              ? await arbitrumWithdraw(wallet, destination, amountStr)
              : await coreWithdraw(wallet, destination, amountStr);
          logger.info("Withdraw result", { telegramId, result });
          const feeLine = state.network === "arbitrum" ? "\n- Fee: 1 USDC" : "";
          await ctx.reply(
            `✅ Withdraw requested on ${
              state.network === "arbitrum" ? "Arbitrum" : "HyperCore"
            }:\n- To: ${destination}\n- Amount: ${amountStr} USDC${feeLine}`
          );
        } catch (err) {
          logger.error("Withdraw execution error", err);
          await ctx.reply(
            "❌ Failed to request withdrawal. Please try again later."
          );
        } finally {
          withdrawState.delete(telegramId);
        }
        return;
      }
  } catch (error) {
      logger.error("Error in handleWithdrawTextInput", error);
      withdrawState.delete(telegramId);
      await ctx.reply("❌ An error occurred. Withdraw flow has been cancelled.");
    }
  });
}