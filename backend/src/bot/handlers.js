import { Telegraf } from "telegraf";
import { logger } from "../utils/logger.js";
import { registerUser, isUserRegistered } from "../db/registerUser.js";
import { handleMarkets } from "./markets.js";
import registerLongHandler from "./long.js";
import registerShortHandler from "./short.js";

/**
 * Handle the /start command
 * @param {Object} ctx - Telegram context
 */
export async function handleStart(ctx) {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || "User";
    const hlAddress = "0x00000000000000000000000000000000000000000";
    const hlPrivkey = "0x00000000000000000000000000000000000000000";
    const hlAgentPk = "0x00000000000000000000000000000000000000000";

    const welcomeMessage = `Welcome to HyperBot\n\nSuccessfully registered`;
    const alreadyRegisteredMessage = `Welcome back to HyperBot\n\nAlready registered`;


    logger.info("User started bot", { telegramId, username });


    const isRegistered = await isUserRegistered(telegramId);
    logger.info("User registered", { isRegistered });

    if (!isRegistered) {
      const user = await registerUser(
        telegramId,
        username,
        hlAddress,
        hlPrivkey,
        hlAgentPk
      );
      logger.info("User registered", { user });
    }

    await ctx.replyWithMarkdown(isRegistered ? alreadyRegisteredMessage.trim() : welcomeMessage.trim());
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

  bot.command("markets", (ctx) => handleMarkets(ctx, 0));

  bot.action(/^NEXT_(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await handleMarkets(ctx, page);
  });

  bot.action(/^PREVIOUS_(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await handleMarkets(ctx, page);
  });
  

  registerLongHandler(bot);
  
  registerShortHandler(bot);
  logger.info("Bot handlers registered successfully");
}
