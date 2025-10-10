import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";
import { logger } from "../utils/logger.js";
import { Markup } from "telegraf";
import {
  backToMenuButton,
  errorMessage,
  formatUSDC,
} from "./navigation.js";

export async function handleBalance(ctx) {
  try {
    const telegramId = ctx.from.id;
    const userInfo = await getUserInfo(telegramId);

    if (!userInfo) {
      await ctx.reply(
        errorMessage("You are not registered yet. Please use /start to create your wallet."),
        Markup.inlineKeyboard([[backToMenuButton()]])
      );
      return;
    }

    const userBalance = await getBalance(userInfo.hl_address);

    const message =
      `💰 *Your Balance*\n\n` +
      `💵 Available Balance: *${formatUSDC(userBalance, 2)} USDC*\n\n` +
      `_This balance is available for trading and withdrawals_`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Refresh", callback_data: "menu_balance" },
            { text: "📊 Positions", callback_data: "menu_positions" },
          ],
          [
            { text: "💸 Withdraw", callback_data: "menu_withdraw" },
            { text: "🪪 Wallet Info", callback_data: "menu_wallet" },
          ],
          [backToMenuButton()],
        ],
      },
    };

    // Check if this is a callback query (edit) or regular message (send)
    if (ctx.update?.callback_query) {
      try {
        await ctx.editMessageText(message, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        await ctx.answerCbQuery("Balance updated");
      } catch (error) {
        if (!error.message?.includes("message is not modified")) {
          await ctx.reply(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } else {
          await ctx.answerCbQuery("Balance unchanged");
        }
      }
    } else {
      await ctx.reply(message, {
        parse_mode: "Markdown",
        ...keyboard,
      });
    }
  } catch (error) {
    logger.error("Error in handleBalance", error);
    await ctx.reply(
      errorMessage("Unable to fetch your balance. Please try again later."),
      Markup.inlineKeyboard([[backToMenuButton()]])
    );
  }
}
