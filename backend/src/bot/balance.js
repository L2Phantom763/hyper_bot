import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";
import { logger } from "../utils/logger.js";

export async function handleBalance(ctx) {
  try {
    const telegramId = ctx.from.id;
    const userInfo = await getUserInfo(telegramId);

    if (!userInfo) {
      await ctx.reply(
        "❌ You are not registered yet. Please type /start to create your wallet."
      );
      return;
    }

    const userBalance = await getBalance(userInfo.hl_address);

    const message =
      `💰 *Your Balance*\n\n` +
      `- Balance: *${Number(userBalance).toFixed(2)} USDC*`;

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    logger.error("Error in handleBalance", error);
    await ctx.reply("❌ Unable to fetch your balance. Please try again later.");
  }
}
