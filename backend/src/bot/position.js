// src/bot/positions.js
import { ethers } from "ethers";
import sql from "../db/db.js";
import { decryptAES } from "../utils/aes.js";
import { infoClient } from "../utils/client.js";
import { Markup } from "telegraf";
import {
  backToMenuButton,
  errorMessage,
  infoMessage,
  formatPnL,
  formatSide,
  formatUSDC,
} from "./navigation.js";
import { logger } from "../utils/logger.js";

function fmt(n, d = 4) {
  if (n == null || isNaN(n)) return "?";
  return Number(n).toFixed(d);
}
function sideFromSize(szi) {
  const sz = Number(szi);
  if (!isFinite(sz) || sz === 0) return "FLAT";
  return sz > 0 ? "LONG" : "SHORT";
}

export async function handlePositions(ctx) {
  try {
    const telegramId = ctx.from.id;

    // 1) Get user + wallet address
    const rows =
      await sql`SELECT hl_privkey FROM users WHERE telegram_id = ${telegramId}`;
    if (!rows.length || !rows[0].hl_privkey) {
      return ctx.reply(
        errorMessage("User not registered. Use /start to begin."),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
    }
    const privKey = decryptAES(rows[0].hl_privkey);
    const wallet = new ethers.Wallet(privKey);
    const address = wallet.address;

    // 2) Read clearinghouse state
    const state = await infoClient.clearinghouseState({
      user: address,
      dex: "",
    });

    const positions = Array.isArray(state?.assetPositions)
      ? state.assetPositions
      : [];

    if (!positions.length) {
      const message = infoMessage("You have no open perpetual positions.");
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📈 Open Long", callback_data: "trade_long" },
              { text: "📉 Open Short", callback_data: "trade_short" },
            ],
            [
              { text: "📋 View Markets", callback_data: "menu_markets" },
            ],
            [backToMenuButton()],
          ],
        },
      };

      // Check if this is a callback query (edit) or regular message (send)
      if (ctx.update?.callback_query) {
        try {
          await ctx.editMessageText(message, keyboard);
          await ctx.answerCbQuery("No positions");
        } catch (error) {
          await ctx.reply(message, keyboard);
        }
      } else {
        await ctx.reply(message, keyboard);
      }
      return;
    }

    // 3) Get mark prices for PnL calculation
    const mids = (await infoClient.allMids?.()) ?? {};

    // 4) Build message with better formatting
    let msg = "📊 *Your Perpetual Positions*\n\n";
    const buttons = [];
    
    for (const ap of positions) {
      const p = ap.position;
      if (!p) continue;

      const coin = p.coin;
      const szi = Number(p.szi);
      const side = sideFromSize(szi);
      const sizeAbs = Math.abs(szi);

      const entry = Number(p.entryPx);
      const mark = mids[coin] ? Number(mids[coin]) : null;
      const liq = p.liquidationPx ? Number(p.liquidationPx) : null;

      // Calculate unrealized PnL
      const uPnL =
        typeof p.unrealizedPnl === "string"
          ? Number(p.unrealizedPnl)
          : mark != null
          ? (mark - entry) * (szi > 0 ? sizeAbs : -sizeAbs)
          : null;

      const levType = p.leverage?.type ?? "isolated";
      const levVal = p.leverage?.value ?? null;

      const roe = p.returnOnEquity ? Number(p.returnOnEquity) : null;
      const roePct = roe != null ? roe * 100 : null;

      // Format position info
      msg += `*${coin}* | ${formatSide(side)}\n`;
      msg += `├ Size: ${fmt(sizeAbs, 3)}\n`;
      msg += `├ Entry: $${fmt(entry, 2)}\n`;
      msg += `├ Mark: $${mark != null ? fmt(mark, 2) : "?"}\n`;
      if (liq != null) msg += `├ Liquidation: $${fmt(liq, 2)}\n`;
      if (levVal != null) msg += `├ Leverage: ${levType} ${levVal}x\n`;
      if (uPnL != null) {
        msg += `└ PnL: ${formatPnL(uPnL)}`;
        if (roePct != null && isFinite(roePct)) {
          msg += ` (${fmt(roePct, 2)}%)`;
        }
        msg += `\n`;
      }
      msg += "\n";

      // Add close button for this position
      buttons.push([
        { text: `🔒 Close ${coin}`, callback_data: `quick_close_${coin}` },
      ]);
    }

    // Add navigation buttons
    buttons.push([
      { text: "🔄 Refresh", callback_data: "menu_positions" },
      { text: "💰 Balance", callback_data: "menu_balance" },
    ]);
    buttons.push([backToMenuButton()]);

    const keyboard = {
      reply_markup: {
        inline_keyboard: buttons,
      },
    };

    // Check if this is a callback query (edit) or regular message (send)
    if (ctx.update?.callback_query) {
      try {
        await ctx.editMessageText(msg, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        await ctx.answerCbQuery("Positions updated");
      } catch (error) {
        if (!error.message?.includes("message is not modified")) {
          await ctx.reply(msg, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } else {
          await ctx.answerCbQuery("Positions unchanged");
        }
      }
    } else {
      await ctx.reply(msg, {
        parse_mode: "Markdown",
        ...keyboard,
      });
    }
  } catch (err) {
    logger.error("Error in /positions:", err);
    await ctx.reply(
      errorMessage("Unable to fetch your positions right now."),
      Markup.inlineKeyboard([[backToMenuButton()]])
    );
  }
}

// Export function to register quick close handlers
export function registerPositionHandlers(bot) {
  // Handle quick close buttons
  bot.action(/^quick_close_(\w+)$/, async (ctx) => {
    try {
      const ticker = ctx.match[1].toUpperCase();
      await ctx.answerCbQuery(`Closing ${ticker} position`);

      // Trigger the close command flow
      const { closePosition } = await import("../services/closePosition.js");
      const telegramId = ctx.from.id;

      await ctx.reply(`🔐 Closing your *${ticker}* position...`, {
        parse_mode: "Markdown",
      });

      try {
        await closePosition(telegramId, ticker, 100);
        await ctx.reply(
          `✅ ${ticker} position closed successfully!`,
          Markup.inlineKeyboard([
            [
              { text: "📊 View Positions", callback_data: "menu_positions" },
              { text: "🏠 Menu", callback_data: "menu_main" },
            ],
          ])
        );
      } catch (err) {
        logger.error("Quick close failed", err);
        await ctx.reply(
          errorMessage(`Failed to close ${ticker}: ${err.message}`),
          Markup.inlineKeyboard([[backToMenuButton()]])
        );
      }
    } catch (error) {
      logger.error("Error in quick_close handler", error);
      await ctx.answerCbQuery("❌ Error occurred");
    }
  });

  logger.info("Position handlers registered successfully");
}
