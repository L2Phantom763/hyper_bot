import { Markup } from "telegraf";
import { logger } from "../utils/logger.js";
import { getUserInfo } from "../db/getUserInfo.js";
import { getUserByIdentifier, getUserDisplayName } from "../db/getUserByIdentifier.js";
import { getBalance } from "../utils/balances.js";
import { ethers } from "ethers";
import { decryptAES } from "../utils/aes.js";
import { coreWithdraw } from "../utils/withdraw.js";
import { sessionManager } from "./sessionManager.js";
import {
  cancelButton,
  backToMenuButton,
  successMessage,
  errorMessage,
  infoMessage,
  formatUSDC,
} from "./navigation.js";

const FLOW_TYPE = "send";
const MIN_SEND_AMOUNT = 5; // Minimum 5 USDC

/**
 * Handle /send command
 * Usage: /send @username 10
 *        /send username 10
 *        /send 123456789 10
 */
export async function handleSend(ctx) {
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

    // Parse command
    const text = ctx.message?.text || "";
    const parts = text.trim().split(/\s+/);
    
    // Check if fast mode: /send @user amount
    if (parts.length === 3) {
      const recipient = parts[1];
      const amount = parseFloat(parts[2]);
      
      if (!isFinite(amount) || amount <= 0) {
        await ctx.reply(
          errorMessage("Invalid amount. Please use: `/send @username 10`"),
          { parse_mode: "Markdown", ...Markup.inlineKeyboard([[backToMenuButton()]]) }
        );
        return;
      }
      
      // Start the flow with pre-filled data
      await startSendFlow(ctx, recipient, amount);
    } else {
      // Interactive mode
      sessionManager.setSession(telegramId, FLOW_TYPE, "awaiting_recipient", {});
      
      await ctx.reply(
        "💸 *Send USDC to Another User*\n\n" +
        "Please enter the recipient's username or Telegram ID:\n\n" +
        "Examples:\n" +
        "• `@john`\n" +
        "• `john`\n" +
        "• `123456789`",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]]),
        }
      );
    }
  } catch (error) {
    logger.error("Error in /send command", error);
    sessionManager.clearSession(ctx.from.id);
    await ctx.reply(
      errorMessage("Failed to start send. Please try again."),
      Markup.inlineKeyboard([[backToMenuButton()]])
    );
  }
}

/**
 * Start the send flow with recipient and amount
 */
async function startSendFlow(ctx, recipientIdentifier, amount) {
  const telegramId = ctx.from.id;
  
  try {
    // Validate amount
    if (amount < MIN_SEND_AMOUNT) {
      await ctx.reply(
        errorMessage(`Minimum send amount is ${MIN_SEND_AMOUNT} USDC.`),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
      return;
    }
    
    // Check sender's balance
    const senderInfo = await getUserInfo(telegramId);
    if (!senderInfo) {
      await ctx.reply(
        errorMessage("You are not registered. Please use /start first."),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
      return;
    }
    
    const senderBalance = await getBalance(senderInfo.hl_address);
    const balanceNum = Number(senderBalance);
    
    if (amount > balanceNum) {
      await ctx.reply(
        errorMessage(
          `Insufficient balance.\n\n` +
          `Your balance: ${formatUSDC(balanceNum, 2)} USDC\n` +
          `Required: ${formatUSDC(amount, 2)} USDC`
        ),
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [{ text: "💰 Check Balance", callback_data: "menu_balance" }],
            [backToMenuButton()],
          ]),
        }
      );
      return;
    }
    
    // Find recipient
    const recipient = await getUserByIdentifier(recipientIdentifier);
    
    if (!recipient) {
      await ctx.reply(
        errorMessage(
          `Recipient not found: \`${recipientIdentifier}\`\n\n` +
          `Make sure they are registered on this bot.`
        ),
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[backToMenuButton()]]),
        }
      );
      return;
    }
    
    // Check if trying to send to self
    if (recipient.telegram_id === telegramId) {
      await ctx.reply(
        errorMessage("You cannot send USDC to yourself! 😅"),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
      return;
    }
    
    // Show confirmation
    const recipientDisplay = getUserDisplayName(recipient);
    const recipientWallet = `${recipient.hl_address.slice(0, 6)}...${recipient.hl_address.slice(-4)}`;
    
    sessionManager.setSession(telegramId, FLOW_TYPE, "awaiting_confirmation", {
      recipientId: recipient.id_user,
      recipientTelegramId: recipient.telegram_id,
      recipientAddress: recipient.hl_address,
      recipientDisplay: recipientDisplay,
      amount: amount,
    });
    
    const confirmMessage =
      "💸 *Send USDC - Confirmation*\n\n" +
      `To: ${recipientDisplay}\n` +
      `Telegram ID: \`${recipient.telegram_id}\`\n` +
      `Wallet: \`${recipientWallet}\`\n\n` +
      `Amount: *${formatUSDC(amount, 2)} USDC*\n\n` +
      `Your balance: ${formatUSDC(balanceNum, 2)} USDC\n` +
      `After send: ${formatUSDC(balanceNum - amount, 2)} USDC\n\n` +
      `⚠️ *Double-check the recipient before confirming!*`;
    
    await ctx.reply(
      confirmMessage,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [{ text: "✅ Confirm Send", callback_data: "send_confirm" }],
          [cancelButton(FLOW_TYPE), backToMenuButton()],
        ]),
      }
    );
  } catch (error) {
    logger.error("Error in startSendFlow", error);
    sessionManager.clearSession(telegramId);
    await ctx.reply(
      errorMessage("An error occurred. Please try again."),
      Markup.inlineKeyboard([[backToMenuButton()]])
    );
  }
}

/**
 * Register send-related handlers
 */
export default function registerSendHandler(bot) {
  // Command handler
  bot.command("send", handleSend);
  
  // Cancel button
  bot.action(`cancel_${FLOW_TYPE}`, async (ctx) => {
    await ctx.answerCbQuery("Cancelled");
    sessionManager.clearSession(ctx.from.id);
    await ctx.reply(infoMessage("Send cancelled."));
    
    const { showMainMenu } = await import("./menu.js");
    await showMainMenu(ctx);
  });
  
  // Confirm send button
  bot.action("send_confirm", async (ctx) => {
    const telegramId = ctx.from.id;
    
    try {
      await ctx.answerCbQuery("Processing...");
      
      const session = sessionManager.getSession(telegramId, FLOW_TYPE);
      
      if (!session || session.step !== "awaiting_confirmation") {
        await ctx.reply(errorMessage("Invalid session. Please try again."));
        return;
      }
      
      const { recipientAddress, recipientDisplay, recipientTelegramId, amount } = session.data;
      
      // Get sender info
      const senderInfo = await getUserInfo(telegramId);
      const wallet = new ethers.Wallet(decryptAES(senderInfo.hl_privkey));
      
      // Double-check balance
      const balance = await getBalance(senderInfo.hl_address);
      const balanceNum = Number(balance);
      
      if (amount > balanceNum) {
        sessionManager.clearSession(telegramId);
        await ctx.reply(
          errorMessage("Insufficient balance. Transaction cancelled."),
          Markup.inlineKeyboard([[backToMenuButton()]])
        );
        return;
      }
      
      // Execute transfer
      await ctx.editMessageText("⏳ Processing transfer...");
      
      const result = await coreWithdraw(wallet, recipientAddress, String(amount));
      
      logger.info("Send transfer completed", {
        from: telegramId,
        to: recipientTelegramId,
        amount,
        result,
      });
      
      sessionManager.clearSession(telegramId);
      
      // Notify sender
      await ctx.reply(
        successMessage(
          `Transfer successful! 🎉\n\n` +
          `Sent *${formatUSDC(amount, 2)} USDC* to ${recipientDisplay}\n` +
          `Transaction completed on HyperCore`
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
      
      // Notify recipient
      try {
        const senderDisplay = senderInfo.username 
          ? `@${senderInfo.username}` 
          : `User_${telegramId}`;
        
        await bot.telegram.sendMessage(
          recipientTelegramId,
          successMessage(
            `You received USDC! 🎁\n\n` +
            `From: ${senderDisplay}\n` +
            `Amount: *${formatUSDC(amount, 2)} USDC*\n\n` +
            `The funds are now in your wallet.`
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
      } catch (notifyError) {
        logger.warn("Failed to notify recipient", { 
          recipientTelegramId, 
          error: notifyError.message 
        });
      }
      
    } catch (error) {
      logger.error("Error confirming send", error);
      sessionManager.clearSession(telegramId);
      await ctx.reply(
        errorMessage(`Transfer failed: ${error.message}`),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
    }
  });
  
  // Text handler for interactive mode
  bot.on("text", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const session = sessionManager.getSession(telegramId, FLOW_TYPE);
    
    if (!session) {
      return next();
    }
    
    try {
      const text = (ctx.message?.text || "").trim();
      
      // Step 1: Awaiting recipient
      if (session.step === "awaiting_recipient") {
        const recipient = await getUserByIdentifier(text);
        
        if (!recipient) {
          await ctx.reply(
            errorMessage(
              `Recipient not found: \`${text}\`\n\n` +
              `Make sure they are registered on this bot.\n\n` +
              `Please try again or cancel:`
            ),
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]]),
            }
          );
          return;
        }
        
        if (recipient.telegram_id === telegramId) {
          await ctx.reply(
            errorMessage("You cannot send USDC to yourself! 😅\n\nPlease enter another recipient:"),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
          return;
        }
        
        // Save recipient and ask for amount
        sessionManager.updateSessionData(telegramId, {
          recipientId: recipient.id_user,
          recipientTelegramId: recipient.telegram_id,
          recipientAddress: recipient.hl_address,
          recipientDisplay: getUserDisplayName(recipient),
        });
        sessionManager.updateSessionStep(telegramId, "awaiting_amount");
        
        const senderInfo = await getUserInfo(telegramId);
        const balance = await getBalance(senderInfo.hl_address);
        
        await ctx.reply(
          `✅ Recipient: ${getUserDisplayName(recipient)}\n` +
          `Telegram ID: \`${recipient.telegram_id}\`\n\n` +
          `💰 Your balance: *${formatUSDC(balance, 2)} USDC*\n\n` +
          `Please enter the amount to send (min ${MIN_SEND_AMOUNT} USDC):`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]]),
          }
        );
        return;
      }
      
      // Step 2: Awaiting amount
      if (session.step === "awaiting_amount") {
        const amount = parseFloat(text);
        
        if (!isFinite(amount) || amount <= 0) {
          await ctx.reply(
            errorMessage("Invalid amount. Please enter a positive number:"),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
          return;
        }
        
        if (amount < MIN_SEND_AMOUNT) {
          await ctx.reply(
            errorMessage(`Minimum send amount is ${MIN_SEND_AMOUNT} USDC. Please enter a valid amount:`),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
          return;
        }
        
        // Check balance
        const senderInfo = await getUserInfo(telegramId);
        const balance = await getBalance(senderInfo.hl_address);
        const balanceNum = Number(balance);
        
        if (amount > balanceNum) {
          await ctx.reply(
            errorMessage(
              `Insufficient balance.\n\n` +
              `Your balance: ${formatUSDC(balanceNum, 2)} USDC\n` +
              `Required: ${formatUSDC(amount, 2)} USDC\n\n` +
              `Please enter a smaller amount:`
            ),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
          return;
        }
        
        // Show confirmation
        sessionManager.updateSessionData(telegramId, { amount });
        sessionManager.updateSessionStep(telegramId, "awaiting_confirmation");
        
        const { recipientDisplay, recipientTelegramId, recipientAddress } = session.data;
        const recipientWallet = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;
        
        const confirmMessage =
          "💸 *Send USDC - Confirmation*\n\n" +
          `To: ${recipientDisplay}\n` +
          `Telegram ID: \`${recipientTelegramId}\`\n` +
          `Wallet: \`${recipientWallet}\`\n\n` +
          `Amount: *${formatUSDC(amount, 2)} USDC*\n\n` +
          `Your balance: ${formatUSDC(balanceNum, 2)} USDC\n` +
          `After send: ${formatUSDC(balanceNum - amount, 2)} USDC\n\n` +
          `⚠️ *Double-check the recipient before confirming!*`;
        
        await ctx.reply(
          confirmMessage,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [{ text: "✅ Confirm Send", callback_data: "send_confirm" }],
              [cancelButton(FLOW_TYPE), backToMenuButton()],
            ]),
          }
        );
        return;
      }
    } catch (error) {
      logger.error("Error in send text handler", error);
      sessionManager.clearSession(telegramId);
      await ctx.reply(
        errorMessage("An error occurred. Send flow has been cancelled."),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
    }
  });
  
  logger.info("Send handler registered successfully");
}

