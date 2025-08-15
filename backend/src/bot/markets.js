import { Markup } from 'telegraf';
import axios from 'axios';
import { logger } from "../utils/logger.js";

export async function handleMarkets(ctx, page = 0) {
  try {
    const metaRes = await axios.post(process.env.HYPERLIQUID_API_URL, { type: 'meta' });
    const tickers = metaRes.data.universe;

    const midsRes = await axios.post(process.env.HYPERLIQUID_API_URL, { type: 'allMids' });
    const prices = midsRes.data;

    const itemsPerPage = 10;
    const totalPages = Math.ceil(tickers.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedTickers = tickers.slice(start, end);

    let message = '📈 *Available markets*\n\n';
    const rows = [];

    paginatedTickers.forEach((ticker) => {
      const price = prices[ticker];
      message += `*${ticker}* - ${price} USDC\n`;

      rows.push([
        Markup.button.callback(`Long ${ticker}`, `LONG_${ticker}`),
        Markup.button.callback(`Short ${ticker}`, `SHORT_${ticker}`)
      ]);
    });

    const navigationButtons = [];

    if (page > 0) {
      navigationButtons.push(Markup.button.callback('Previous', `PREVIOUS_${page - 1}`));
    }

    if (page < totalPages - 1) {
      navigationButtons.push(Markup.button.callback('Next', `NEXT_${page + 1}`));
    }

    if (navigationButtons.length > 0) {
      rows.push(navigationButtons);
    }

    await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(rows));
  } catch (error) {
        logger.error("Error in handleMarkets", error);
        await ctx.reply("❌ An unexpected error occurred. Please try again or contact support.");
  }
}

export function setupPagination(bot) {
  bot.action(/PAGE_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await ctx.deleteMessage();
    await handleMarkets(ctx, page);
  });
}