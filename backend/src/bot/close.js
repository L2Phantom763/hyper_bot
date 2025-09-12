// handlers/close.js
import { Markup } from "telegraf";
import { logger } from "../utils/logger.js";
import { closePosition } from "../services/closePosition.js";

const sessions = {}; // { [telegramId]: { step: 'ticker'|'percent', data: { ticker } } }

export default function registerCloseHandler(bot) {
  bot.command("close", async (ctx) => {
    const telegramId = ctx.from.id;
    const parts = ctx.message.text.trim().split(/\s+/);

    // ---- FAST MODE ----
    // /close BTC
    // /close BTC 50%
    if (parts.length >= 2) {
      const ticker = parts[1].toUpperCase();
      let percent = 100;

      if (parts[2]) {
        const m = parts[2].match(/^(\d+(?:\.\d+)?)%?$/i);
        if (!m) return ctx.reply("❗️Invalid percent. Example: /close BTC 50%");
        percent = Number(m[1]);
      }

      try {
        await ctx.reply(
          `🔐 Closing *${percent}%* of your *${ticker}* position...`,
          { parse_mode: "Markdown" }
        );
        await closePosition(telegramId, ticker, percent);
        return ctx.reply(`✅ Close order confirmed !`);
      } catch (err) {
        logger.error("Close fast mode failed", err);
        return ctx.reply(`❌ Failed to close: ${err.message}`);
      }
    }

    // ---- INTERACTIVE FLOW ----
    sessions[telegramId] = { step: "ticker", data: {} };
    await ctx.reply("✏️ Type the *ticker* to close (e.g. BTC, ETH, SOL)", {
      parse_mode: "Markdown",
    });
  });

  bot.on("text", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const session = sessions[telegramId];
    if (!session) return next();

    try {
      if (session.step === "ticker") {
        const ticker = ctx.message.text.trim().toUpperCase();
        session.data.ticker = ticker;
        session.step = "percent";

        return ctx.reply(`📉 How much to close on *${ticker}* ?`, {
          parse_mode: "Markdown",
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback("25%", "CLOSE_25"),
              Markup.button.callback("50%", "CLOSE_50"),
            ],
            [
              Markup.button.callback("75%", "CLOSE_75"),
              Markup.button.callback("100%", "CLOSE_100"),
            ],
          ]),
        });
      }
    } catch (err) {
      logger.error("Close flow (text) error", err);
      delete sessions[telegramId];
      await ctx.reply("❌ Something went wrong.");
    }
  });

  bot.on("callback_query", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const session = sessions[telegramId];
    if (!session) return next();

    try {
      if (data.startsWith("CLOSE_") && session.step === "percent") {
        const percent = Number(data.replace("CLOSE_", ""));
        const { ticker } = session.data;

        await ctx.answerCbQuery();
        await ctx.reply(
          `🔐 Closing *${percent}%* of your *${ticker}* position...`,
          { parse_mode: "Markdown" }
        );

        try {
          await closePosition(telegramId, ticker, percent);
          await ctx.reply(`✅ Close order confirmed !`);
        } catch (err) {
          logger.error("Close position failed", err);
          await ctx.reply(`❌ Failed to close: ${err.message}`);
        }

        delete sessions[telegramId];
      }
    } catch (err) {
      logger.error("Close flow (cb) error", err);
      delete sessions[telegramId];
      await ctx.reply("❌ Something went wrong.");
    }
  });
}
