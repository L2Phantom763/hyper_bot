import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";
import { logger } from "../utils/logger.js";

export async function handleRefreshBalance(ctx) {
    try {
      const telegramId = ctx.from.id;
      const userInfo = await getUserInfo(telegramId);
      const userBalance = await getBalance(userInfo.hl_address);
  
      const message = `Welcome back to HyperBot\n\nPlease deposit usdc to this address: ${userInfo.hl_address}\n\nYour balance is: ${userBalance} USDC`;
  
      const buttons = [
        [{ text: "🔄 Refresh balance", callback_data: "refresh_balance" }],
      ];
      if (Number(userBalance) > 0) {
        buttons[0].push({ text: "💸 Withdraw", callback_data: "withdraw_start" });
      }
      const refreshKeyboard = {
        reply_markup: {
          inline_keyboard: buttons,
        },
      };
  
      await ctx.editMessageText(message.trim(), {
        parse_mode: "Markdown",
        ...refreshKeyboard,
      });
      await ctx.answerCbQuery("Balance refreshed ✅");
    } catch (error) {
      // If the error is "message is not modified", do not log it as an error (it's not a real error)
      if (
        typeof error?.message === "string" &&
        error.message.includes("message is not modified")
      ) {
        // Do nothing, this is not a real error
      } else {
        logger.error("Error in handleRefreshBalance", error);
      }
      try {
        await ctx.answerCbQuery("Your balance has not changed.");
      } catch (_) {
        // ignore
      }
    }
  }