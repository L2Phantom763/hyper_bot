import { Telegraf } from "telegraf";
import { config, validateConfig } from "./config.js";
import { registerHandlers } from "./bot/handlers.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    logger.info("Validating configuration...");
    validateConfig();

    logger.info("Creating Telegram bot instance...");
    const bot = new Telegraf(config.telegram.token);

    bot.catch((err, ctx) => {
      logger.error("Bot error occurred", {
        error: err,
        updateType: ctx.updateType,
        userId: ctx.from?.id,
      });

      try {
        ctx.reply(
          "❌ An unexpected error occurred. Please try again or contact support."
        );
      } catch (replyError) {
        logger.error("Failed to send error message to user", replyError);
      }
    });

    registerHandlers(bot);

    // Enable graceful shutdown
    process.once("SIGINT", () => {
      logger.info("Received SIGINT, stopping bot gracefully...");
      bot.stop("SIGINT");
    });

    process.once("SIGTERM", () => {
      logger.info("Received SIGTERM, stopping bot gracefully...");
      bot.stop("SIGTERM");
    });

    // Launch the bot
    logger.info("Launching bot...");
    await bot.launch();
    
  } catch (error) {
    console.error("Error starting bot:", error);
    process.exit(1);
  }
}

main();
