import { logger } from "../utils/logger.js";
import { registerUser, isUserRegistered } from "../db/registerUser.js";
import { handleMarkets } from "./markets.js";
import registerLongHandler from "./long.js";
import registerShortHandler from "./short.js";
import { generateWallet } from "../utils/generateKeys.js";
import { encryptAES, decryptAES } from "../utils/aes.js";
import { getBalance } from "../utils/balances.js";
import { getUserInfo } from "../db/getUserInfo.js";
import { ethers } from "ethers";
import { coreWithdraw, arbitrumWithdraw } from "../utils/withdraw.js";
import { handlePositions, registerPositionHandlers } from "./position.js";
import { handleBalance } from "./balance.js";
import { handleWallet } from "./wallet.js";
import registerCloseHandler from "./close.js";
import { handleHelp } from "./help.js";
import { handleRefreshBalance } from "./refresh.js";
import registerWithdrawHandler, { handleWithdraw } from "./withdraw.js";
import { registerChartHandler } from "./chart.js";
import { approveBuilderFee } from "../utils/approveBuilderFee.js";
import registerReferralHandler from "./referral.js";
import { registerMenuHandlers, showMainMenu } from "./menu.js";
import { sessionManager } from "./sessionManager.js";
import {
  cancelButton,
  backToMenuButton,
  infoMessage,
} from "./navigation.js";
import { Markup } from "telegraf";
import { handleLeaderboard, handleMyStats, handleRules } from "./leaderboard.js";

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
      // Extract referral code from start parameter (format: /start ref_CODE)
      let referredByUserId = null;
      const startPayload = ctx.startPayload || ctx.message?.text?.split(' ')[1];
      
      if (startPayload && startPayload.startsWith('ref_')) {
        const referralCode = startPayload.substring(4); // Remove 'ref_' prefix
        logger.info("Referral code detected", { referralCode });
        
        // Import here to avoid circular dependency
        const { getUserByReferralCode } = await import("../services/referralService.js");
        const referrer = await getUserByReferralCode(referralCode);
        
        if (referrer) {
          referredByUserId = referrer.id_user;
          logger.info("Valid referrer found", { 
            referredByUserId, 
            referrerTelegramId: referrer.telegram_id 
          });
        } else {
          logger.warn("Invalid referral code", { referralCode });
        }
      }

      const wallet = await generateWallet();
      const agentWallet = await generateWallet();

      const user = await registerUser(
        telegramId,
        username,
        wallet.address,
        encryptAES(wallet.privateKey),
        agentWallet.address,
        encryptAES(agentWallet.privateKey),
        referredByUserId
      );
      logger.info("User registered", { user, referredByUserId });
    }

    const userInfo = await getUserInfo(telegramId);
    const userBalance = await getBalance(userInfo.hl_address);

    if (!isRegistered) {
      // New user welcome message
      const welcomeMessage = 
        `👋 *Welcome to HyperBot!*\n\n` +
        `Your trading account has been created successfully.\n\n` +
        `📬 *Deposit Address:*\n\`${userInfo.hl_address}\`\n\n` +
        `💰 Current Balance: *${Number(userBalance).toFixed(2)} USDC*\n\n` +
        `🚀 *Quick Start:*\n` +
        `1. Deposit USDC to your address\n` +
        `2. View available markets\n` +
        `3. Open your first position\n\n` +
        `Use the menu below to get started!`;

      await ctx.replyWithMarkdown(welcomeMessage);
    } else {
      // Returning user message
      const welcomeBackMessage = 
        `👋 *Welcome back to HyperBot!*\n\n` +
        `💰 Balance: *${Number(userBalance).toFixed(2)} USDC*`;

      await ctx.replyWithMarkdown(welcomeBackMessage);
    }

    // Show main menu for all users
    await showMainMenu(ctx);
  } catch (error) {
    logger.error("Error in handleStart", error);
    await ctx.reply("❌ An error occurred. Please try again later.");
  }
}


/**
 * Register all handlers for the bot
 * @param {Object} bot - Telegraf bot instance
 */
export function registerHandlers(bot) {
  // Core commands
  bot.command("start", handleStart);
  bot.command("menu", showMainMenu);
  bot.command("markets", (ctx) => handleMarkets(ctx, 0));
  bot.command("positions", handlePositions);
  bot.command("balance", handleBalance);
  bot.command("wallet", handleWallet);
  bot.command("help", handleHelp);
  bot.command("withdraw", handleWithdraw);
  
  // Airdrop commands
  bot.command("leaderboard", handleLeaderboard);
  bot.command("mystats", handleMyStats);
  bot.command("rules", handleRules);

  // Market pagination
  bot.action(/^NEXT_(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await handleMarkets(ctx, page);
  });

  bot.action(/^PREVIOUS_(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await handleMarkets(ctx, page);
  });

  // Legacy refresh balance
  bot.action("refresh_balance", handleRefreshBalance);

  // Trade action handlers from menu
  bot.action("trade_long", async (ctx) => {
    try {
      await ctx.answerCbQuery();
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

      // Start long flow
      sessionManager.setSession(telegramId, "long", "chooseTicker", {});
      await ctx.reply(
        "✏️ Please type the *ticker* (e.g. BTC, ETH, SOL)",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[cancelButton("long"), backToMenuButton()]]),
        }
      );
    } catch (error) {
      logger.error("Error in trade_long action", error);
      await ctx.reply("❌ An error occurred. Please try again.");
    }
  });

  bot.action("trade_short", async (ctx) => {
    try {
      await ctx.answerCbQuery();
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

      // Start short flow
      sessionManager.setSession(telegramId, "short", "chooseTicker", {});
      await ctx.reply(
        "✏️ Please type the *ticker* (e.g. BTC, ETH, SOL)",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[cancelButton("short"), backToMenuButton()]]),
        }
      );
    } catch (error) {
      logger.error("Error in trade_short action", error);
      await ctx.reply("❌ An error occurred. Please try again.");
    }
  });

  bot.action("trade_close", async (ctx) => {
    try {
      await ctx.answerCbQuery();
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

      // Start close flow
      sessionManager.setSession(telegramId, "close", "ticker", {});
      await ctx.reply(
        "✏️ Type the *ticker* to close (e.g. BTC, ETH, SOL)",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[cancelButton("close"), backToMenuButton()]]),
        }
      );
    } catch (error) {
      logger.error("Error in trade_close action", error);
      await ctx.reply("❌ An error occurred. Please try again.");
    }
  });

  // Register specialized handlers
  registerMenuHandlers(bot);
  registerPositionHandlers(bot);
  registerWithdrawHandler(bot);
  registerLongHandler(bot);
  registerShortHandler(bot);
  registerCloseHandler(bot);
  registerChartHandler(bot);
  registerReferralHandler(bot);
  
  logger.info("Bot handlers registered successfully");
}
