import { chartService } from "../services/chartService.js";
import { logger } from "../utils/logger.js";

/**
 * Parse chart command arguments
 * @param {string} commandText - Full command text (e.g., "/chart btc 1h")
 * @returns {Object} - { symbol, interval }
 */
function parseChartCommand(commandText) {
  const args = commandText.split(' ').filter(arg => arg.length > 0);
  
  // Remove the command itself (/chart)
  const params = args.slice(1);
  
  let symbol = 'btc';
  let interval = '1d';
  
  if (params.length === 1) {
    // Could be either symbol or interval
    const param = params[0].toLowerCase();
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    
    if (timeframes.includes(param)) {
      // It's a timeframe, keep default symbol (BTC)
      interval = param;
    } else {
      // It's a symbol
      symbol = param;
    }
  } else if (params.length >= 2) {
    // Both symbol and interval provided
    symbol = params[0].toLowerCase();
    interval = params[1].toLowerCase();
  }
  
  return { symbol, interval };
}

/**
 * Get supported symbols for validation
 */
function getSupportedSymbols() {
  return [
    'btc', 'eth', 'bnb', 'ada', 'sol', 'dot', 'avax', 'matic', 'link', 'uni',
    'ltc', 'bch', 'etc', 'xlm', 'xrp', 'doge', 'shib', 'atom', 'near', 'ftm',
    'algo', 'vet', 'mana', 'sand', 'gala', 'chz', 'enj', 'bat', 'zec', 'dash'
  ];
}

/**
 * Handle the /chart command - generates and sends cryptocurrency candlestick chart
 * @param {Object} ctx - Telegram context
 */
export async function handleChart(ctx) {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || "User";
    const commandText = ctx.message.text || "/chart";

    // Parse command arguments
    const { symbol, interval } = parseChartCommand(commandText);
    
    logger.info("User requested chart", { telegramId, username, symbol, interval });

    // Validate symbol
    const supportedSymbols = getSupportedSymbols();
    if (!supportedSymbols.includes(symbol)) {
      return await ctx.reply(
        `❌ Unsupported cryptocurrency: ${symbol.toUpperCase()}\n\n` +
        `Supported symbols: ${supportedSymbols.slice(0, 20).join(', ').toUpperCase()}...`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "📊 BTC Chart", callback_data: "chart_btc_1d" },
              { text: "📊 ETH Chart", callback_data: "chart_eth_1d" }
            ]]
          }
        }
      );
    }

    // Validate timeframe
    const supportedTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    if (!supportedTimeframes.includes(interval)) {
      return await ctx.reply(
        `❌ Unsupported timeframe: ${interval}\n\n` +
        `Supported timeframes: ${supportedTimeframes.join(', ')}\n\n` +
        `Example: \`/chart ${symbol} 1h\``,
        { parse_mode: "Markdown" }
      );
    }

    // Send initial message to indicate chart generation is in progress
    const displaySymbol = symbol.toUpperCase();
    const loadingMessage = await ctx.reply(`📊 Generating ${displaySymbol}/USD ${interval} chart...`);

    try {
      // Generate the chart
      const chartBuffer = await chartService.generateChart(symbol, interval);

      // Delete the loading message
      await ctx.deleteMessage(loadingMessage.message_id);

      // Get timeframe display name
      const timeframeNames = {
        '1m': '1 Minute',
        '5m': '5 Minute', 
        '15m': '15 Minute',
        '30m': '30 Minute',
        '1h': '1 Hour',
        '4h': '4 Hour', 
        '1d': 'Daily',
        '1w': 'Weekly'
      };

      // Send the chart image with timeframe and trading buttons
      await ctx.replyWithPhoto(
        { source: chartBuffer },
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              // Timeframe buttons row
              [
                { text: interval === '15m' ? '• 15m •' : '15m', callback_data: `chart_${symbol}_15m` },
                { text: interval === '1h' ? '• 1h •' : '1h', callback_data: `chart_${symbol}_1h` },
                { text: interval === '4h' ? '• 4h •' : '4h', callback_data: `chart_${symbol}_4h` },
                { text: interval === '1d' ? '• 1d •' : '1d', callback_data: `chart_${symbol}_1d` }
              ],
              // Trading buttons row
              [
                { text: "📉 Short " + displaySymbol, callback_data: `short_${symbol}` },
                { text: "📈 Long " + displaySymbol, callback_data: `long_${symbol}` }
              ]
            ]
          }
        }
      );

      logger.info("Chart sent successfully", { telegramId, username, symbol, interval });

    } catch (chartError) {
      logger.error("Error generating chart", { error: chartError, telegramId, symbol, interval });
      
      // Delete the loading message
      await ctx.deleteMessage(loadingMessage.message_id);
      
      // Send error message
      const errorMsg = chartError.message.includes('Invalid symbol') 
        ? `❌ ${chartError.message}`
        : "❌ Unable to generate chart at the moment. Please try again later.";
        
      await ctx.reply(errorMsg, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔄 Try Again", callback_data: `chart_${symbol}_${interval}` }
            ],
            [
              { text: "📊 BTC Chart", callback_data: "chart_btc_1d" },
              { text: "📊 ETH Chart", callback_data: "chart_eth_1d" }
            ]
          ]
        }
      });
    }

  } catch (error) {
    logger.error("Error in handleChart", { error, telegramId: ctx.from?.id });
    await ctx.reply("❌ An error occurred. Please try again later.");
  }
}

/**
 * Handle chart callback buttons
 * @param {Object} ctx - Telegram context
 */
export async function handleChartCallback(ctx) {
  try {
    const callbackData = ctx.callbackQuery.data;
    
    if (callbackData.startsWith('chart_')) {
      // Extract symbol and interval from callback data
      const parts = callbackData.split('_');
      const symbol = parts[1];
      const interval = parts[2];
      
      await ctx.answerCbQuery("Updating chart...");
      
      try {
        logger.info("Updating chart via callback", { symbol, interval, userId: ctx.from.id });
        
        // Generate new chart with logo
        const chartBuffer = await chartService.generateChart(symbol, interval);
        
        // Get timeframe display name
        const timeframeNames = {
          '1m': '1 Minute',
          '5m': '5 Minute', 
          '15m': '15 Minute',
          '30m': '30 Minute',
          '1h': '1 Hour',
          '4h': '4 Hour', 
          '1d': 'Daily',
          '1w': 'Weekly'
        };
        
        const displaySymbol = symbol.toUpperCase();
        
        // Update the existing message with new chart
        await ctx.editMessageMedia(
          {
            type: 'photo',
            media: { source: chartBuffer },
            parse_mode: 'Markdown'
          },
          {
            reply_markup: {
              inline_keyboard: [
                // Timeframe buttons row
                [
                  { text: interval === '15m' ? '• 15m •' : '15m', callback_data: `chart_${symbol}_15m` },
                  { text: interval === '1h' ? '• 1h •' : '1h', callback_data: `chart_${symbol}_1h` },
                  { text: interval === '4h' ? '• 4h •' : '4h', callback_data: `chart_${symbol}_4h` },
                  { text: interval === '1d' ? '• 1d •' : '1d', callback_data: `chart_${symbol}_1d` }
                ],
                // Trading buttons row
                [
                  { text: "📉 Short " + displaySymbol, callback_data: `short_${symbol}` },
                  { text: "📈 Long " + displaySymbol, callback_data: `long_${symbol}` }
                ]
              ]
            }
          }
        );
        
        logger.info("Chart updated successfully via callback", { symbol, interval, userId: ctx.from.id });
        
      } catch (error) {
        logger.error("Error updating chart via callback", { error: error.message, symbol, interval });
        
        // If editing fails, send a new message
        try {
          await ctx.reply(
            `❌ Error updating chart. Generating new ${symbol.toUpperCase()}/USD ${interval} chart...`
          );
          
          // Create a mock message object for handleChart as fallback
          const mockCtx = {
            ...ctx,
            message: {
              text: `/chart ${symbol} ${interval}`
            }
          };
          
          await handleChart(mockCtx);
        } catch (fallbackError) {
          logger.error("Fallback chart generation failed", fallbackError);
          await ctx.reply(`❌ Unable to generate ${symbol.toUpperCase()} chart. Please try again.`);
        }
      }
      
    } else if (callbackData.startsWith('long_')) {
      const symbol = callbackData.split('_')[1];
      await ctx.answerCbQuery();
      
      // Prompt user to send the long command themselves
      await ctx.reply(
        `coming soon`
      );
      
    } else if (callbackData.startsWith('short_')) {
      const symbol = callbackData.split('_')[1];
      await ctx.answerCbQuery();
      
      // Prompt user to send the short command themselves
      await ctx.reply(
        `coming soon`
      );
    }
  } catch (error) {
    logger.error("Error in handleChartCallback", error);
    await ctx.answerCbQuery("❌ Error occurred");
  }
}

/**
 * Register chart-related handlers
 * @param {Object} bot - Telegraf bot instance
 */
export function registerChartHandler(bot) {
  bot.command("chart", handleChart);
  
  // Handle chart callback buttons
  bot.action(/^chart_\w+_\w+$/, handleChartCallback);
  bot.action(/^timeframe_\w+$/, handleChartCallback);
  
  // Handle trading callback buttons
  bot.action(/^long_\w+$/, handleChartCallback);
  bot.action(/^short_\w+$/, handleChartCallback);
  
  logger.info("Chart handlers registered successfully");
}
