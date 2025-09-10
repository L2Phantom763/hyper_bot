import axios from 'axios';
import { Markup } from 'telegraf';
import sql from '../db/db.js';
import { logger } from '../utils/logger.js';

// In-memory map for close actions
const closeSessions = {};

// Handler registration
export default function registerCloseHandler(bot) {
  // /close command
  bot.command('close', async (ctx) => {
    const telegramId = ctx.from.id;

    try {
      // 1) Get user's HL address from DB
      const [userRow] = await sql`
        SELECT hl_address FROM users WHERE telegram_id = ${telegramId}
      `;
      if (!userRow) {
        return ctx.reply('❌ User not registered.');
      }

      // 2) Call Hyperliquid -> get open positions
      const res = await axios.post('https://api.hyperliquid.xyz/info', {
        type: 'positions',
        user: userRow.hl_address
      });

      const positions = res.data.positions || [];
      if (positions.length === 0) {
        return ctx.reply('🔎 No open positions to close.');
      }

      // Build buttons
      const buttons = positions.map((p) =>
        Markup.button.callback(`Close ${p.ticker}`, `CLOSE_${p.ticker}`)
      );

      closeSessions[telegramId] = positions; // store list for callback reference

      await ctx.reply(
        'Select a position to close:',
        Markup.inlineKeyboard(
          buttons.map((btn) => [btn]) // one per row
        )
      );
    } catch (error) {
      logger.error('Error in /close', error);
      ctx.reply('❌ Failed to fetch positions.');
    }
  });

  // Callback handler for closing a selected position
  bot.on('callback_query', async (ctx, next) => {
    const telegramId = ctx.from.id;
    const data = ctx.callbackQuery.data;

    if (!data.startsWith('CLOSE_')) return next();

    const ticker = data.replace('CLOSE_', '');
    const positions = closeSessions[telegramId];
    if (!positions) return;

    // Find the selected position
    const position = positions.find((p) => p.ticker === ticker);
    if (!position) {
      await ctx.answerCbQuery('Position not found');
      return;
    }

    await ctx.answerCbQuery();

    // TODO: send "close position" order to Hyperliquid API here
    // For now we just simulate:
    await ctx.reply(`✅ Closing ${ticker} position... (not implemented yet)`);

    // Remove our stored list
    delete closeSessions[telegramId];
  });
}