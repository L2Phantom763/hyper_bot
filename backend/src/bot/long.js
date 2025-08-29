import { Markup } from 'telegraf';
import { logger } from '../utils/logger.js';
import { hasSufficientBalance } from '../services/checkBalance.js';
import { placeOrder } from '../services/placeOrder.js';

// In-memory session store
const sessions = {};

// Leverage options
const leverageOptions = [1, 2, 5, 10, 20];

/**
 * /long command handler
 */
export default function registerLongHandler(bot) {
  bot.command('long', async (ctx) => {
    const telegramId = ctx.from.id;
    const parts = ctx.message.text.trim().split(/\s+/);

    // MODE RAPIDE => /long BTC 20x 50
    if (parts.length === 4) {
      const rawTicker = parts[1];
      const rawLeverage = parts[2];
      const margin = parseFloat(parts[3]);

      const ticker = rawTicker.toUpperCase();
      const leverage = parseInt(rawLeverage.toLowerCase().replace('x', ''), 10);

      const ok = await hasSufficientBalance(telegramId, margin);
      if (!ok) {
        return ctx.reply(`❌ Not enough balance to use ${margin} USDC as margin.`);
      }

      return await confirmOrder(ctx, telegramId, {
        side: 'long',
        ticker,
        leverage,
        margin
      });
    }

    // Sinon => MODE INTERACTIF (step 1 = ask ticker)
    sessions[telegramId] = {
      action: 'long',
      step: 'chooseTicker',
      data: {}
    };
    await ctx.reply('✏️ Please type the *ticker* (e.g. BTC, ETH, SOL)', {
      parse_mode: 'Markdown'
    });
  });

  // Handle user's reply (ticker or margin depending on step)
  bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id;
    const session = sessions[telegramId];
    if (!session) return; // not in a flow

    try {
      // STEP 1 ✅  TICKER
      if (session.step === 'chooseTicker') {
        const ticker = ctx.message.text.trim().toUpperCase();
        session.data.ticker = ticker;
        session.step = 'chooseLeverage';

        // Ask leverage
        const buttons = leverageOptions.map((lv) =>
          Markup.button.callback(`${lv}x`, `LEV_${lv}`)
        );
        await ctx.reply(
          `Leverage for *${ticker}* ?`,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [buttons] } }
        );
        return;
      }

      // STEP 2 ✅  MARGIN
      if (session.step === 'chooseMargin') {
        const margin = parseFloat(ctx.message.text.trim());
        if (isNaN(margin) || margin <= 0) {
          return ctx.reply('❗️Please enter a valid number for margin.');
        }

        //balance check (DB lookup)
        const ok = await hasSufficientBalance(telegramId, margin);
        if (!ok) {
          await ctx.reply(`❌ Not enough balance to use ${margin} USDC as margin.`);
          delete sessions[telegramId];
          return;
        }

        session.data.margin = margin;

        // Confirm order
        await confirmOrder(ctx, telegramId, {
          side: 'long',
          ...session.data
        });
        delete sessions[telegramId];
      }
    } catch (error) {
      logger.error('Error in long flow (text)', error);
      await ctx.reply('❌ Something went wrong.');
      delete sessions[telegramId];
    }
  });

  // Handle inline callbacks (leverage + confirmation)
  bot.on('callback_query', async (ctx) => {
    const telegramId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const session = sessions[telegramId];

    // Catch only long flow callbacks
    if (!session || session.action !== 'long') return;

    try {
      // LEVERAGE SELECTED
      if (data.startsWith('LEV_') && session.step === 'chooseLeverage') {
        const leverage = parseInt(data.replace('LEV_', ''), 10);
        session.data.leverage = leverage;
        session.step = 'chooseMargin';

        await ctx.answerCbQuery();
        return ctx.reply(
          `💰 Enter the *margin* in USDC for ${session.data.ticker} (ex: 50)`,
          { parse_mode: 'Markdown' }
        );
      }

      // CONFIRM
      if (data === 'CONFIRM_LONG') {
        await ctx.answerCbQuery('Order confirmed ✅');
        const { ticker, leverage, margin } = session.data;

          try {
            const resp = await placeOrder(telegramId, ticker, margin, leverage, true);
            await ctx.reply(`✅ Long order sent! Good luck!`);
          } catch (err) {
            logger.error("Place order failed", err);
            await ctx.reply(`❌ Failed to place order: ${err.message}`);
          }

          delete sessions[telegramId];
      }

      // CANCEL
      if (data === 'CANCEL_LONG') {
        await ctx.answerCbQuery('Cancelled');
        await ctx.reply('❌ Order cancelled.');
        delete sessions[telegramId];
      }
    } catch (error) {
      logger.error('Error in long flow (cb)', error);
      await ctx.reply('❌ Something went wrong.');
      delete sessions[telegramId];
    }
  });
}

// Helper → confirmation message
async function confirmOrder(ctx, telegramId, { side, ticker, leverage, margin }) {
  const size = margin * leverage;
  const message = `*Confirm ${side.toUpperCase()} order*
Ticker: ${ticker}
Leverage: ${leverage}x
Margin: ${margin} USDC
➡️ Notional size: *${size}* USDC

✅ Confirm / ❌ Cancel`;

  sessions[telegramId] = { 
    action: side, 
    step: 'confirm',
    data: { ticker, leverage, margin }
  };

  await ctx.replyWithMarkdown(message, Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirm', 'CONFIRM_LONG')],
    [Markup.button.callback('❌ Cancel', 'CANCEL_LONG')]
  ]));
}
