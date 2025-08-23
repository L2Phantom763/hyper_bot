import { Telegraf } from "telegraf";
import { logger } from "../utils/logger.js";
import { registerUser, isUserRegistered } from "../db/registerUser.js";
import { generateWallet } from "../utils/generateKeys.js";
import { encryptAES, decryptAES } from "../utils/aes.js";
import { approveAgent } from "../utils/approveAgent.js";
import { getBalance } from "../utils/balances.js";
import { getUserInfo } from "../db/getUserInfo.js";
import { ethers } from "ethers";
import { coreWithdraw, arbitrumWithdraw } from "../utils/withdraw.js";

// In-memory state to handle withdraw conversation per user
const withdrawState = new Map();

/**
 * Handle the /start command
 * @param {Object} ctx - Telegram context
 */
export async function handleStart(ctx) {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || "User";

    logger.info("User started bot", { telegramId, username });

    const isRegistered = await isUserRegistered(telegramId);
    logger.info("User registered", { isRegistered });

    if (!isRegistered) {

      const wallet = await generateWallet();
      const agentWallet = await generateWallet();

      const user = await registerUser(
        telegramId,
        username,
        wallet.address,
        encryptAES(wallet.privateKey),
        agentWallet.address,
        encryptAES(agentWallet.privateKey)
      );
      logger.info("User registered", { user });

    }

    const userInfo = await getUserInfo(telegramId);
    const userBalance = await getBalance(userInfo.hl_address);

    const welcomeMessage = `Welcome to HyperBot\n\n Please deposit usdc to this address: ${userInfo.hl_address}\n\nYour balance is: ${userBalance} USDC`;
    const alreadyRegisteredMessage = `Welcome back to HyperBot\n\nPlease deposit usdc to this address: ${userInfo.hl_address}\n\nYour balance is: ${userBalance} USDC`;

    const buttons = [[{ text: "🔄 Refresh balance", callback_data: "refresh_balance" }]];
    if (Number(userBalance) > 0) {
      buttons[0].push({ text: "💸 Withdraw", callback_data: "withdraw_start" });
    }
    const refreshKeyboard = {
      reply_markup: {
        inline_keyboard: buttons
      }
    };

    await ctx.replyWithMarkdown(
      isRegistered ? alreadyRegisteredMessage.trim() : welcomeMessage.trim(),
      refreshKeyboard
    );
  } catch (error) {
    logger.error("Error in handleStart", error);
    await ctx.reply("❌ An error occurred. Please try again later.");
  }
}

export async function handleApproveAgent(ctx) {
  try {
  const telegramId = ctx.from.id;
  const userInfo = await getUserInfo(telegramId);
  const wallet = await new ethers.Wallet(decryptAES(userInfo.hl_privkey));
  const result = await approveAgent(wallet, userInfo.hl_agent_pubkey);
  logger.info("Approve agent", result);
  await ctx.replyWithMarkdown(`Approve agent: ${result}`);
  } catch (error) {
    logger.error("Error in handleApproveAgent", error);
    await ctx.reply("❌ An error occurred. Please try again later.");
  }
}

async function handleWithdraw(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    withdrawState.set(telegramId, { step: "awaiting_network" });
    const networkKeyboard = {
      reply_markup: {
        inline_keyboard: [[
          { text: "HyperCore", callback_data: "withdraw_net_core" },
          { text: "Arbitrum", callback_data: "withdraw_net_arbitrum" }
        ]]
      }
    };
    await ctx.reply("Choose the network for withdrawal:", networkKeyboard);
  } catch (error) {
    logger.error("Error in handleWithdraw (start)", error);
    try { await ctx.answerCbQuery("Failed to start withdraw ❌"); } catch (_) {}
  }
}

async function handleWithdrawNetworkSelect(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const data = ctx.callbackQuery?.data;
    const network = data === "withdraw_net_arbitrum" ? "arbitrum" : "core";
    const prev = withdrawState.get(telegramId) || {};
    withdrawState.set(telegramId, { ...prev, step: "awaiting_address", network });
    await ctx.reply("Please send the destination address (EVM) to withdraw to:");
  } catch (error) {
    logger.error("Error in handleWithdrawNetworkSelect", error);
  }
}

async function handleTextInput(ctx) {
  const telegramId = ctx.from.id;
  const state = withdrawState.get(telegramId);
  if (!state) {
    return; // not in a withdraw flow; ignore here and let other handlers work
  }
  try {
    const text = (ctx.message?.text || "").trim();
    if (state.step === "awaiting_address") {
      if (!ethers.isAddress(text)) {
        await ctx.reply("❌ Invalid address. Please send a valid EVM address:");
        return;
      }
      withdrawState.set(telegramId, { ...state, step: "awaiting_amount", address: text });
      const userInfo = await getUserInfo(telegramId);
      const balance = await getBalance(userInfo.hl_address);
      const balanceNum = Number(balance);
      await ctx.reply(
        `Address saved. Your available balance is ${balanceNum.toFixed(4)} USDC.\n\nPlease send the amount to withdraw (e.g. 12.5):`
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
          `❌ Amount exceeds your balance (${balanceNum.toFixed(4)} USDC). Please send a smaller amount:`
        );
        return;
      }

      const amountStr = String(amountNum);
      const wallet = new ethers.Wallet(decryptAES(userInfo.hl_privkey));
      const destination = state.address;

      try {
        const result = state.network === "arbitrum"
          ? await arbitrumWithdraw(wallet, destination, amountStr)
          : await coreWithdraw(wallet, destination, amountStr);
        logger.info("Withdraw result", { telegramId, result });
        await ctx.reply(
          `✅ Withdraw requested on ${state.network === "arbitrum" ? "Arbitrum" : "HyperCore"}:\n- To: ${destination}\n- Amount: ${amountStr} USDC`
        );
      } catch (err) {
        logger.error("Withdraw execution error", err);
        await ctx.reply("❌ Failed to request withdrawal. Please try again later.");
      } finally {
        withdrawState.delete(telegramId);
      }
      return;
    }
  } catch (error) {
    logger.error("Error in handleTextInput (withdraw flow)", error);
    withdrawState.delete(telegramId);
    await ctx.reply("❌ An error occurred. Withdraw flow has been cancelled.");
  }
}

async function handleRefreshBalance(ctx) {
  try {
    const telegramId = ctx.from.id;
    const userInfo = await getUserInfo(telegramId);
    const userBalance = await getBalance(userInfo.hl_address);

    const message = `Welcome back to HyperBot\n\nPlease deposit usdc to this address: ${userInfo.hl_address}\n\nYour balance is: ${userBalance} USDC`;

    const buttons = [[{ text: "🔄 Refresh balance", callback_data: "refresh_balance" }]];
    if (Number(userBalance) > 0) {
      buttons[0].push({ text: "💸 Withdraw", callback_data: "withdraw_start" });
    }
    const refreshKeyboard = {
      reply_markup: {
        inline_keyboard: buttons
      }
    };

    await ctx.editMessageText(message.trim(), { parse_mode: "Markdown", ...refreshKeyboard });
    await ctx.answerCbQuery("Balance refreshed ✅");
  } catch (error) {
    // If the error is "message is not modified", do not log it as an error (it's not a real error)
    if (
      typeof error?.message === "string" &&
      error.message.includes("message is not modified")
    ) {
      // Do nothing, this is not a real error
    } else {
      logger.error("Error in handleRefreshBalance", error);
    }
    try {
      await ctx.answerCbQuery("Your balance has not changed.");
    } catch (_) {
      // ignore
    }
  }
}

/**
 * Register all handlers for the bot
 * @param {Object} bot - Telegraf bot instance
 */
export function registerHandlers(bot) {
  bot.command("start", handleStart);
  bot.command("approveAgent", handleApproveAgent);
  bot.action("refresh_balance", handleRefreshBalance);
  bot.action("withdraw_start", handleWithdraw);
  bot.action("withdraw_net_core", handleWithdrawNetworkSelect);
  bot.action("withdraw_net_arbitrum", handleWithdrawNetworkSelect);
  bot.on("text", handleTextInput);
  logger.info("Bot handlers registered successfully");
}
