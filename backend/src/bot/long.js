import { Markup } from "telegraf";
import { logger } from "../utils/logger.js";
import { placeOrder } from "../services/placeOrder.js";
import { sessionManager } from "./sessionManager.js";
import {
  cancelButton,
  backToMenuButton,
  successMessage,
  errorMessage,
  infoMessage,
} from "./navigation.js";

// Leverage options
const leverageOptions = [1, 2, 5, 10, 20];
const FLOW_TYPE = "long";

/**
 * /long command handler
 */
export default function registerLongHandler(bot) {
  bot.command("long", async (ctx) => {
    const telegramId = ctx.from.id;
    const parts = ctx.message.text.trim().split(/\s+/);

    try {
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

      // FAST MODE => /long BTC 20x 50
      if (parts.length === 4) {
        const rawTicker = parts[1];
        const rawLeverage = parts[2];
        const margin = parseFloat(parts[3]);

        const ticker = rawTicker.toUpperCase();
        const leverage = parseInt(rawLeverage.toLowerCase().replace("x", ""), 10);

        // Validate inputs
        if (isNaN(margin) || margin <= 0) {
          await ctx.reply(errorMessage("Invalid margin amount. Please try again."));
          return;
        }

        if (isNaN(leverage) || !leverageOptions.includes(leverage)) {
          await ctx.reply(
            errorMessage(
              `Invalid leverage. Available options: ${leverageOptions.join(", ")}x`
            )
          );
          return;
        }

        return await confirmOrder(ctx, telegramId, {
          side: "long",
          ticker,
          leverage,
          margin,
        });
      }

      // INTERACTIVE MODE (step 1 = ask ticker)
      sessionManager.setSession(telegramId, FLOW_TYPE, "chooseTicker", {});
      await ctx.reply(
        "✏️ Please type the *ticker* (e.g. BTC, ETH, SOL)",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]]),
        }
      );
    } catch (error) {
      logger.error("Error in /long command", error);
      sessionManager.clearSession(telegramId);
      await ctx.reply(errorMessage("Something went wrong. Please try again."));
    }
  });

  // Handle user's reply (ticker or margin depending on step)
  bot.on("text", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const session = sessionManager.getSession(telegramId, FLOW_TYPE);
    
    if (!session) return next(); // not in a long flow - pass to next handler

    try {
      // STEP 1: TICKER
      if (session.step === "chooseTicker") {
        const ticker = ctx.message.text.trim().toUpperCase();
        sessionManager.updateSessionData(telegramId, { ticker });
        sessionManager.updateSessionStep(telegramId, "chooseLeverage");

        // Ask leverage
        const buttons = leverageOptions.map((lv) =>
          Markup.button.callback(`${lv}x`, `LEV_${lv}`)
        );
        await ctx.reply(`💹 Leverage for *${ticker}*?`, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              buttons,
              [cancelButton(FLOW_TYPE), backToMenuButton()],
            ],
          },
        });
        return;
      }

      // STEP 2: MARGIN
      if (session.step === "chooseMargin") {
        const margin = parseFloat(ctx.message.text.trim());
        if (isNaN(margin) || margin <= 0) {
          return ctx.reply(
            errorMessage("Please enter a valid positive number for margin."),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
        }

        sessionManager.updateSessionData(telegramId, { margin });

        // Get current session data
        const currentSession = sessionManager.getSession(telegramId, FLOW_TYPE);
        
        // Confirm order
        await confirmOrder(ctx, telegramId, {
          side: "long",
          ...currentSession.data,
        });
      }
    } catch (error) {
      logger.error("Error in long flow (text)", error);
      await ctx.reply(errorMessage("Something went wrong."));
      sessionManager.clearSession(telegramId);
    }
  });

  // Handle inline callbacks (leverage + confirmation)
  bot.on("callback_query", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const session = sessionManager.getSession(telegramId, FLOW_TYPE);

    // Handle cancel button
    if (data === `cancel_${FLOW_TYPE}`) {
      await ctx.answerCbQuery("Cancelled");
      sessionManager.clearSession(telegramId);
      await ctx.reply(infoMessage("Long order cancelled."));
      
      // Show menu
      const { showMainMenu } = await import("./menu.js");
      await showMainMenu(ctx);
      return;
    }

    // Catch only long flow callbacks
    if (!session) return next();

    try {
      // LEVERAGE SELECTED
      if (data.startsWith("LEV_") && session.step === "chooseLeverage") {
        const leverage = parseInt(data.replace("LEV_", ""), 10);
        sessionManager.updateSessionData(telegramId, { leverage });
        sessionManager.updateSessionStep(telegramId, "chooseMargin");

        await ctx.answerCbQuery();
        return ctx.reply(
          `💰 Enter the *margin* in USDC for ${session.data.ticker} (e.g., 50)`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]]),
          }
        );
      }

      // CONFIRM
      if (data === "CONFIRM_LONG") {
        await ctx.answerCbQuery("Processing order...");
        const { ticker, leverage, margin } = session.data;

        try {
          await placeOrder(telegramId, ticker, margin, leverage, true);
          sessionManager.clearSession(telegramId);
          
          await ctx.reply(
            successMessage(
              `Long order placed!\n\n` +
              `📊 ${ticker}\n` +
              `💹 Leverage: ${leverage}x\n` +
              `💰 Margin: ${margin} USDC\n\n` +
              `Good luck! 🚀`
            ),
            Markup.inlineKeyboard([
              [
                { text: "📊 View Positions", callback_data: "menu_positions" },
                { text: "🏠 Menu", callback_data: "menu_main" },
              ],
            ])
          );
        } catch (err) {
          logger.error("Place order failed", err);
          sessionManager.clearSession(telegramId);
          await ctx.reply(
            errorMessage(`Failed to place order: ${err.message}`),
            Markup.inlineKeyboard([[backToMenuButton()]])
          );
        }
      }

      // CANCEL
      if (data === "CANCEL_LONG") {
        await ctx.answerCbQuery("Cancelled");
        sessionManager.clearSession(telegramId);
        await ctx.reply(
          infoMessage("Long order cancelled."),
          Markup.inlineKeyboard([[backToMenuButton()]])
        );
      }
    } catch (error) {
      logger.error("Error in long flow (cb)", error);
      await ctx.reply(errorMessage("Something went wrong."));
      sessionManager.clearSession(telegramId);
    }
  });
}

// Helper → confirmation message
async function confirmOrder(
  ctx,
  telegramId,
  { side, ticker, leverage, margin }
) {
  const size = margin * leverage;
  if (size < 10) {
    return ctx.reply(
      errorMessage(`Minimum notional size for ${ticker} is 10 USDC. Please try again.`),
      Markup.inlineKeyboard([[backToMenuButton()]])
    );
  }
  
  const message = `📋 *Confirm ${side.toUpperCase()} Order*\n\n` +
    `📊 Ticker: *${ticker}*\n` +
    `💹 Leverage: *${leverage}x*\n` +
    `💰 Margin: *${margin} USDC*\n` +
    `📈 Notional Size: *${size} USDC*\n\n` +
    `Please confirm your order:`;

  sessionManager.setSession(telegramId, FLOW_TYPE, "confirm", {
    ticker,
    leverage,
    margin,
  });

  await ctx.replyWithMarkdown(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Confirm", "CONFIRM_LONG")],
      [Markup.button.callback("❌ Cancel", "CANCEL_LONG")],
      [backToMenuButton()],
    ])
  );
}
