import { Markup } from "telegraf";
import { logger } from "../utils/logger.js";

/**
 * Handle the /start command
 * @param {Object} ctx - Telegram context
 */
export async function handleStart(ctx) {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || "User";

    logger.info("User started bot", { userId, username });

    const welcomeMessage = `Welcome to HyperBot`;

    await ctx.replyWithMarkdown(welcomeMessage.trim());
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
  bot.command("start", handleStart);

  logger.info("Bot handlers registered successfully");
}
