import { Markup } from "telegraf";
import { logger } from "../utils/logger.js";
import { placeOrder } from "../services/placeOrder.js";

// In-memory session store
const sessions = {};

const leverageOptions = [1, 2, 5, 10, 20];

export default function registerShortHandler(bot) {
  bot.command("short", async (ctx) => {
    const telegramId = ctx.from.id;
    const parts = ctx.message.text.trim().split(/\s+/);

    // ------ FAST MODE -------
    if (parts.length === 4) {
      const rawTicker = parts[1];
      const rawLeverage = parts[2];
      const margin = parseFloat(parts[3]);

      const ticker = rawTicker.toUpperCase();
      const leverage = parseInt(rawLeverage.toLowerCase().replace("x", ""), 10);

      return await confirmOrder(ctx, telegramId, {
        side: "short",
        ticker,
        leverage,
        margin,
      });
    }

    // ------ INTERACTIF FLOW ------
    sessions[telegramId] = { action: "short", step: "chooseTicker", data: {} };
    await ctx.reply("✏️ Please type the *ticker* (e.g. BTC, ETH, SOL)", {
      parse_mode: "Markdown",
    });
  });

  // TEXT input from user (ticker or margin)
  bot.on("text", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const session = sessions[telegramId];
    if (!session) return next();

    try {
      if (session.step === "chooseTicker") {
        const ticker = ctx.message.text.trim().toUpperCase();
        session.data.ticker = ticker;
        session.step = "chooseLeverage";

        const buttons = leverageOptions.map((lv) =>
          Markup.button.callback(`${lv}x`, `LEV_${lv}`)
        );
        return ctx.reply(`Leverage for *${ticker}* ?`, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [buttons] },
        });
      }

      if (session.step === "chooseMargin") {
        const margin = parseFloat(ctx.message.text.trim());
        if (isNaN(margin) || margin <= 0) {
          return ctx.reply("❗️Please enter a valid number for margin.");
        }

        session.data.margin = margin;
        await confirmOrder(ctx, telegramId, { side: "short", ...session.data });
      }
    } catch (error) {
      logger.error("Error in short flow (text)", error);
      delete sessions[telegramId];
      await ctx.reply("❌ Something went wrong.");
    }
  });

  // CALLBACKS (leverage + confirm/cancel)
  bot.on("callback_query", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const session = sessions[telegramId];

    if (!session || session.action !== "short") return next();

    try {
      // Leverage
      if (data.startsWith("LEV_") && session.step === "chooseLeverage") {
        const leverage = parseInt(data.replace("LEV_", ""), 10);
        session.data.leverage = leverage;
        session.step = "chooseMargin";

        await ctx.answerCbQuery();
        return ctx.reply(
          `💰 Enter the *margin* in USDC for ${session.data.ticker} (ex: 50)`,
          { parse_mode: "Markdown" }
        );
      }

      if (data === "CONFIRM_SHORT") {
        await ctx.answerCbQuery("Order confirmed ✅");

        try {
          const resp = await placeOrder(
            telegramId,
            session.data.ticker,
            session.data.margin,
            session.data.leverage,
            false // <-- false = SHORT
          );

          await ctx.reply(`✅ Short order sent! Good luck!`);
        } catch (err) {
          logger.error("Error placing short order", err);
          await ctx.reply(`❌ Failed to place order: ${err.message}`);
        }
        delete sessions[telegramId];
      }

      if (data === "CANCEL_SHORT") {
        await ctx.answerCbQuery("Cancelled");
        await ctx.reply("❌ Order cancelled.");
        delete sessions[telegramId];
      }
    } catch (error) {
      logger.error("Error in short flow (cb)", error);
      delete sessions[telegramId];
      await ctx.reply("❌ Something went wrong.");
    }
  });
}

// -----------------------------------------------------------
async function confirmOrder(
  ctx,
  telegramId,
  { side, ticker, leverage, margin }
) {
  const size = margin * leverage;

  // (Optionnel mais utile) même garde-fou que le /long
  if (size < 10) {
    return ctx.reply(
      `❗️ Minimum notional size for ${ticker} is 10 USDC. Please try again.`
    );
  }

  const message = `*Confirm ${side.toUpperCase()} order*
Ticker: ${ticker}
Leverage: ${leverage}x
Margin: ${margin} USDC
➡️ Notional size: *${size}* USDC

✅ Confirm / ❌ Cancel`;

  // ✅ Conserver les données pour le callback
  sessions[telegramId] = {
    action: side,
    step: "confirm",
    data: { ticker, leverage, margin },
  };

  const confirmCb = side === "short" ? "CONFIRM_SHORT" : "CONFIRM_LONG";
  const cancelCb = side === "short" ? "CANCEL_SHORT" : "CANCEL_LONG";

  await ctx.replyWithMarkdown(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Confirm", confirmCb)],
      [Markup.button.callback("❌ Cancel", cancelCb)],
    ])
  );
}
