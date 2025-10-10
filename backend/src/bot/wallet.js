import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";
import { logger } from "../utils/logger.js";
import { Markup } from "telegraf";
import {
  backToMenuButton,
  errorMessage,
  formatUSDC,
  truncateAddress,
} from "./navigation.js";

export async function handleWallet(ctx) {
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
      `🪪 *Your Wallet*\n\n` +
      `📬 Address:\n\`${userInfo.hl_address}\`\n\n` +
      `💰 Balance: *${formatUSDC(userBalance, 2)} USDC*\n\n` +
      `_Tap the address to copy it_\n\n` +
      `💡 *How to deposit:*\n` +
      `1. Send USDC to this address\n` +
      `2. Use HyperCore or Arbitrum network\n` +
      `3. Your balance will update automatically`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Refresh Balance", callback_data: "menu_refresh" },
          ],
          [
            { text: "💸 Withdraw", callback_data: "menu_withdraw" },
            { text: "📊 View Positions", callback_data: "menu_positions" },
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
        await ctx.answerCbQuery();
      } catch (error) {
        if (!error.message?.includes("message is not modified")) {
          await ctx.reply(message, {
            parse_mode: "Markdown",
            ...keyboard,
          });
        } else {
          await ctx.answerCbQuery("Wallet info");
        }
      }
    } else {
      await ctx.reply(message, {
        parse_mode: "Markdown",
        ...keyboard,
      });
    }
  } catch (error) {
    logger.error("Error in handleWallet", error);
    await ctx.reply(
      errorMessage("Unable to fetch your wallet. Please try again later."),
      Markup.inlineKeyboard([[backToMenuButton()]])
    );
  }
}
