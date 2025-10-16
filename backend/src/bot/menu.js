import { Markup } from "telegraf";
import { logger } from "../utils/logger.js";
import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";
import { formatUSDC } from "./navigation.js";

/**
 * Show the main menu to the user
 * @param {Object} ctx - Telegram context
 */
export async function showMainMenu(ctx) {
  try {
    const telegramId = ctx.from.id;
    const userInfo = await getUserInfo(telegramId);

    if (!userInfo) {
      await ctx.reply(
        "❌ You are not registered yet. Please use /start to begin."
      );
      return;
    }

    const userBalance = await getBalance(userInfo.hl_address);
    const balanceFormatted = formatUSDC(userBalance, 2);

    const message = `🏠 *Main Menu*\n\n` +
      `👤 Welcome back!\n` +
      `💰 Balance: *${balanceFormatted} USDC*\n\n` +
      `What would you like to do?`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          // Trading row
          [
            { text: "📈 Open Long", callback_data: "trade_long" },
            { text: "📉 Open Short", callback_data: "trade_short" },
          ],
          // Positions row
          [
            { text: "📊 My Positions", callback_data: "menu_positions" },
            { text: "🔒 Close Position", callback_data: "trade_close" },
          ],
          // Markets and Charts row
          [
            { text: "📋 Markets", callback_data: "menu_markets" },
            { text: "📊 Chart", callback_data: "menu_chart_select" },
          ],
          // Account row
          [
            { text: "💰 Balance", callback_data: "menu_balance" },
            { text: "🪪 Wallet", callback_data: "menu_wallet" },
          ],
          // Actions row
          [
            { text: "💸 Withdraw", callback_data: "menu_withdraw" },
            { text: "🎁 Referrals", callback_data: "menu_referral" },
          ],
          // Airdrop row
          [
            { text: "🏆 Leaderboard", callback_data: "menu_leaderboard" },
          ],
          // Help row
          [
            { text: "❓ Help", callback_data: "menu_help" },
            { text: "🔄 Refresh", callback_data: "menu_refresh" },
          ],
        ],
      },
    };

    // Check if this is a callback query (edit) or regular message (send)
    if (ctx.update?.callback_query) {
      try {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        await ctx.answerCbQuery("Main menu");
      } catch (error) {
        // If edit fails, send new message
        if (error.message?.includes("message is not modified")) {
          await ctx.answerCbQuery("Already on main menu");
        } else {
          await ctx.reply(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        }
      }
    } else {
      await ctx.reply(message, {
        parse_mode: "Markdown",
        ...keyboard,
      });
    }

    logger.info("Main menu displayed", { telegramId });
  } catch (error) {
    logger.error("Error showing main menu", error);
    await ctx.reply(
      "❌ An error occurred while loading the menu. Please try again."
    );
  }
}

/**
 * Show chart symbol selection menu
 * @param {Object} ctx - Telegram context
 */
export async function showChartSymbolMenu(ctx) {
  try {
    const popularCoins = [
      { symbol: "BTC", name: "Bitcoin" },
      { symbol: "ETH", name: "Ethereum" },
      { symbol: "SOL", name: "Solana" },
      { symbol: "ARB", name: "Arbitrum" },
      { symbol: "AVAX", name: "Avalanche" },
      { symbol: "MATIC", name: "Polygon" },
    ];

    const message = `📊 *Select Cryptocurrency*\n\n` +
      `Choose a coin to view its chart, or use:\n` +
      `\`/chart [symbol] [timeframe]\`\n\n` +
      `Example: \`/chart btc 1h\``;

    const buttons = [];
    for (let i = 0; i < popularCoins.length; i += 2) {
      const row = [];
      row.push({
        text: `${popularCoins[i].name}`,
        callback_data: `chart_${popularCoins[i].symbol.toLowerCase()}_1d`,
      });
      if (i + 1 < popularCoins.length) {
        row.push({
          text: `${popularCoins[i + 1].name}`,
          callback_data: `chart_${popularCoins[i + 1].symbol.toLowerCase()}_1d`,
        });
      }
      buttons.push(row);
    }

    buttons.push([
      Markup.button.callback("🏠 Back to Menu", "menu_main"),
    ]);

    const keyboard = {
      reply_markup: {
        inline_keyboard: buttons,
      },
    };

    if (ctx.update?.callback_query) {
      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      await ctx.answerCbQuery();
    } else {
      await ctx.reply(message, {
        parse_mode: "Markdown",
        ...keyboard,
      });
    }
  } catch (error) {
    logger.error("Error showing chart symbol menu", error);
    await ctx.reply("❌ An error occurred. Please try again.");
  }
}

/**
 * Register menu-related handlers
 * @param {Object} bot - Telegraf bot instance
 */
export function registerMenuHandlers(bot) {
  // Main menu
  bot.action("menu_main", showMainMenu);
  bot.action("menu_refresh", showMainMenu);

  // Chart symbol selection
  bot.action("menu_chart_select", showChartSymbolMenu);

  // These handlers are registered in the respective command files
  // We just need to ensure the button callback_data matches what those handlers expect

  // Menu navigation actions - these will be imported by other handlers
  bot.action("menu_positions", async (ctx) => {
    await ctx.answerCbQuery();
    const { handlePositions } = await import("./position.js");
    await handlePositions(ctx);
  });

  bot.action("menu_markets", async (ctx) => {
    await ctx.answerCbQuery();
    const { handleMarkets } = await import("./markets.js");
    await handleMarkets(ctx, 0);
  });

  bot.action("menu_balance", async (ctx) => {
    await ctx.answerCbQuery();
    const { handleBalance } = await import("./balance.js");
    await handleBalance(ctx);
  });

  bot.action("menu_wallet", async (ctx) => {
    await ctx.answerCbQuery();
    const { handleWallet } = await import("./wallet.js");
    await handleWallet(ctx);
  });

  bot.action("menu_withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    const { handleWithdraw } = await import("./withdraw.js");
    await handleWithdraw(ctx);
  });

  bot.action("menu_referral", async (ctx) => {
    await ctx.answerCbQuery();
    const { handleReferral } = await import("./referral.js");
    await handleReferral(ctx);
  });

  bot.action("menu_help", async (ctx) => {
    await ctx.answerCbQuery();
    const { handleHelp } = await import("./help.js");
    await handleHelp(ctx);
  });

  bot.action("menu_leaderboard", async (ctx) => {
    await ctx.answerCbQuery();
    const { handleLeaderboard } = await import("./leaderboard.js");
    await handleLeaderboard(ctx);
  });

  logger.info("Menu handlers registered successfully");
}

