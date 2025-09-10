import { logger } from "../utils/logger.js";
import { registerUser, isUserRegistered } from "../db/registerUser.js";
import { handleMarkets } from "./markets.js";
import registerLongHandler from "./long.js";
import registerShortHandler from "./short.js";
import { generateWallet } from "../utils/generateKeys.js";
import { encryptAES, decryptAES } from "../utils/aes.js";
import { approveAgent } from "../utils/approveAgent.js";
import { getBalance } from "../utils/balances.js";
import { getUserInfo } from "../db/getUserInfo.js";
import { ethers } from "ethers";
import { coreWithdraw, arbitrumWithdraw } from "../utils/withdraw.js";
import { handlePositions } from "./position.js";
import { handleBalance } from "./balance.js";
import { handleWallet } from "./wallet.js";
import registerCloseHandler from "./close.js";
import { handleHelp } from "./help.js";
import { handleRefreshBalance } from "./refresh.js";
import registerWithdrawHandler, { handleWithdraw } from "./withdraw.js";

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

    const welcomeMessage = `👋 Welcome to HyperBot

    Please deposit USDC to this address:
    ${userInfo.hl_address}
    
    Your balance is: ${Number(userBalance).toFixed(2)} USDC
    
    ❓ Need help? Type /help to see all available commands.`;

    const alreadyRegisteredMessage = `👋 Welcome back to HyperBot
    
    Please deposit USDC to this address:
    ${userInfo.hl_address}
    
    Your balance is: ${Number(userBalance).toFixed(2)} USDC
    
    ❓ Need help? Type /help to see all available commands.`;

    const buttons = [
      [{ text: "🔄 Refresh balance", callback_data: "refresh_balance" }],
    ];
    if (Number(userBalance) > 0) {
      buttons[0].push({ text: "💸 Withdraw", callback_data: "withdraw_start" });
    }
    const refreshKeyboard = {
      reply_markup: {
        inline_keyboard: buttons,
      },
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

/* export async function handleApproveAgent(ctx) {
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
} */


/**
 * Register all handlers for the bot
 * @param {Object} bot - Telegraf bot instance
 */
export function registerHandlers(bot) {
  bot.command("start", handleStart);
  bot.command("markets", (ctx) => handleMarkets(ctx, 0));
  bot.command("positions", handlePositions);
  bot.command("balance", handleBalance);
  bot.command("wallet", handleWallet);
  bot.command("help", handleHelp);
  bot.command("withdraw", handleWithdraw);
  bot.action(/^NEXT_(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await handleMarkets(ctx, page);
  });

  bot.action(/^PREVIOUS_(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await handleMarkets(ctx, page);
  });
  bot.action("refresh_balance", handleRefreshBalance);
  registerWithdrawHandler(bot);
  registerLongHandler(bot);
  registerShortHandler(bot);
  registerCloseHandler(bot);
  logger.info("Bot handlers registered successfully");
}
