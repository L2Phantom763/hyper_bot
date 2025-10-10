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

    // Set up bot commands menu
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot and view your wallet' },
      { command: 'long', description: 'Open long position' },
      { command: 'short', description: 'Open short position' },
      { command: 'close', description: 'Close a position' },
      { command: 'markets', description: 'View available trading markets' },
      { command: 'positions', description: 'Check your open positions' },
      { command: 'balance', description: 'Check your account balance' },
      { command: 'wallet', description: 'View your wallet address' },
      { command: 'withdraw', description: 'Withdraw funds to external address' },
      { command: 'referral', description: 'View referral program and earnings' },
      { command: 'chart', description: 'Generate cryptocurrency chart' },
      { command: 'help', description: 'Show all available commands' }
    ]);
    
    logger.info("Bot commands menu configured successfully");

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
