// handlers/close.js
import { Markup } from "telegraf";
import { logger } from "../utils/logger.js";
import { closePosition } from "../services/closePosition.js";
import { sessionManager } from "./sessionManager.js";
import {
  cancelButton,
  backToMenuButton,
  successMessage,
  errorMessage,
  infoMessage,
} from "./navigation.js";

const FLOW_TYPE = "close";

export default function registerCloseHandler(bot) {
  bot.command("close", async (ctx) => {
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

      // FAST MODE
      // /close BTC
      // /close BTC 50%
      if (parts.length >= 2) {
        const ticker = parts[1].toUpperCase();
        let percent = 100;

        if (parts[2]) {
          const m = parts[2].match(/^(\d+(?:\.\d+)?)%?$/i);
          if (!m) {
            return ctx.reply(
              errorMessage("Invalid percentage format. Example: /close BTC 50%"),
              Markup.inlineKeyboard([[backToMenuButton()]])
            );
          }
          percent = Number(m[1]);
        }

        if (percent <= 0 || percent > 100) {
          return ctx.reply(
            errorMessage("Percentage must be between 0 and 100."),
            Markup.inlineKeyboard([[backToMenuButton()]])
          );
        }

        try {
          await ctx.reply(
            `🔐 Closing *${percent}%* of your *${ticker}* position...`,
            { parse_mode: "Markdown" }
          );
          await closePosition(telegramId, ticker, percent);
          return ctx.reply(
            successMessage(`Position closed successfully!`),
            Markup.inlineKeyboard([
              [
                { text: "📊 View Positions", callback_data: "menu_positions" },
                { text: "🏠 Menu", callback_data: "menu_main" },
              ],
            ])
          );
        } catch (err) {
          logger.error("Close fast mode failed", err);
          return ctx.reply(
            errorMessage(`Failed to close: ${err.message}`),
            Markup.inlineKeyboard([[backToMenuButton()]])
          );
        }
      }

      // INTERACTIVE FLOW
      sessionManager.setSession(telegramId, FLOW_TYPE, "ticker", {});
      await ctx.reply(
        "✏️ Type the *ticker* to close (e.g. BTC, ETH, SOL)",
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]]),
        }
      );
    } catch (error) {
      logger.error("Error in /close command", error);
      sessionManager.clearSession(telegramId);
      await ctx.reply(errorMessage("Something went wrong. Please try again."));
    }
  });

  bot.on("text", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const session = sessionManager.getSession(telegramId, FLOW_TYPE);
    
    if (!session) return next(); // not in a close flow - pass to next handler

    try {
      if (session.step === "ticker") {
        const ticker = ctx.message.text.trim().toUpperCase();
        sessionManager.updateSessionData(telegramId, { ticker });
        sessionManager.updateSessionStep(telegramId, "percent");

        return ctx.reply(`📉 How much of *${ticker}* to close?`, {
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
            [cancelButton(FLOW_TYPE), backToMenuButton()],
          ]),
        });
      }

      // Allow custom percentage input
      if (session.step === "percent") {
        const input = ctx.message.text.trim();
        const match = input.match(/^(\d+(?:\.\d+)?)%?$/i);
        
        if (!match) {
          return ctx.reply(
            errorMessage("Invalid percentage. Please enter a number between 1 and 100."),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
        }

        const percent = Number(match[1]);
        if (percent <= 0 || percent > 100) {
          return ctx.reply(
            errorMessage("Percentage must be between 1 and 100."),
            Markup.inlineKeyboard([[cancelButton(FLOW_TYPE), backToMenuButton()]])
          );
        }

        const { ticker } = session.data;
        
        try {
          await ctx.reply(
            `🔐 Closing *${percent}%* of your *${ticker}* position...`,
            { parse_mode: "Markdown" }
          );
          await closePosition(telegramId, ticker, percent);
          sessionManager.clearSession(telegramId);
          
          await ctx.reply(
            successMessage(`Position closed successfully!`),
            Markup.inlineKeyboard([
              [
                { text: "📊 View Positions", callback_data: "menu_positions" },
                { text: "🏠 Menu", callback_data: "menu_main" },
              ],
            ])
          );
        } catch (err) {
          logger.error("Close position failed", err);
          sessionManager.clearSession(telegramId);
          await ctx.reply(
            errorMessage(`Failed to close: ${err.message}`),
            Markup.inlineKeyboard([[backToMenuButton()]])
          );
        }
      }
    } catch (err) {
      logger.error("Close flow (text) error", err);
      await ctx.reply(errorMessage("Something went wrong."));
      sessionManager.clearSession(telegramId);
    }
  });

  bot.on("callback_query", async (ctx, next) => {
    const telegramId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const session = sessionManager.getSession(telegramId, FLOW_TYPE);

    // Handle cancel button
    if (data === `cancel_${FLOW_TYPE}`) {
      await ctx.answerCbQuery("Cancelled");
      sessionManager.clearSession(telegramId);
      await ctx.reply(infoMessage("Close position cancelled."));
      
      // Show menu
      const { showMainMenu } = await import("./menu.js");
      await showMainMenu(ctx);
      return;
    }

    if (!session) return next();

    try {
      if (data.startsWith("CLOSE_") && session.step === "percent") {
        const percent = Number(data.replace("CLOSE_", ""));
        const { ticker } = session.data;

        await ctx.answerCbQuery("Processing...");
        await ctx.reply(
          `🔐 Closing *${percent}%* of your *${ticker}* position...`,
          { parse_mode: "Markdown" }
        );

        try {
          await closePosition(telegramId, ticker, percent);
          sessionManager.clearSession(telegramId);
          
          await ctx.reply(
            successMessage(`Position closed successfully!`),
            Markup.inlineKeyboard([
              [
                { text: "📊 View Positions", callback_data: "menu_positions" },
                { text: "🏠 Menu", callback_data: "menu_main" },
              ],
            ])
          );
        } catch (err) {
          logger.error("Close position failed", err);
          sessionManager.clearSession(telegramId);
          await ctx.reply(
            errorMessage(`Failed to close: ${err.message}`),
            Markup.inlineKeyboard([[backToMenuButton()]])
          );
        }
      }
    } catch (err) {
      logger.error("Close flow (cb) error", err);
      await ctx.reply(errorMessage("Something went wrong."));
      sessionManager.clearSession(telegramId);
    }
  });
}
