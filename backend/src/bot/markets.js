import { Markup } from 'telegraf';
import { logger } from "../utils/logger.js";
import { infoClient } from "../utils/client.js";
import { backToMenuButton } from "./navigation.js";

export async function handleMarkets(ctx, page = 0) {
  try {
    const meta = await infoClient.meta();
    const tickers = meta.universe;

    const prices = await infoClient.allMids();

    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil(tickers.length / itemsPerPage));
    const clampedPage = Math.min(Math.max(0, page), totalPages - 1);

    const start = clampedPage * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedTickers = tickers.slice(start, end);

    let message = '📈 *Available markets*\n\n';
    const rows = [];

    paginatedTickers.forEach((ticker) => {
      const tickerName = ticker.name;
      const price = prices[tickerName];
      message += `*${tickerName}* - ${price ?? 'N/A'} USDC\n`;
    });

    message += `\nPage ${clampedPage + 1} of ${totalPages}`;

    const navigationRow = [];

    if (clampedPage > 0) {
      navigationRow.push(Markup.button.callback('⬅️ Previous', `PREVIOUS_${page - 1}`));
    }

    if (clampedPage < totalPages - 1) {
      navigationRow.push(Markup.button.callback('Next ➡️', `NEXT_${page + 1}`));
    }

    const keyboardButtons = [];
    if (navigationRow.length) {
      keyboardButtons.push(navigationRow);
    }
    
    // Add quick trade buttons
    keyboardButtons.push([
      { text: "📈 Open Long", callback_data: "trade_long" },
      { text: "📉 Open Short", callback_data: "trade_short" },
    ]);
    
    // Add navigation
    keyboardButtons.push([backToMenuButton()]);

    const keyboard = { reply_markup: { inline_keyboard: keyboardButtons } };

    if (ctx.update?.callback_query) {
      await ctx.answerCbQuery().catch(() => {});
      await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
    } else {
      await ctx.replyWithMarkdown(message, keyboard);
    }
  } catch (error) {
        logger.error("Error in handleMarkets", error);
        if (ctx.update?.callback_query) {
          try {await ctx.answerCbQuery('Erreur'); } catch {}
        }
        await ctx.reply("❌ An unexpected error occurred. Please try again or contact support.");
  }
}