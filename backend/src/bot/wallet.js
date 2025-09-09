import { getUserInfo } from "../db/getUserInfo.js";
import { getBalance } from "../utils/balances.js";

export async function handleWallet(ctx) {
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
      `🪪 *Your Wallet*\n\n` +
      `- Address: \`${userInfo.hl_address}\`\n` +
      `- Balance: *${Number(userBalance).toFixed(2)} USDC*`;

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    logger.error("Error in handleWallet", error);
    await ctx.reply("❌ Unable to fetch your wallet. Please try again later.");
  }
}
