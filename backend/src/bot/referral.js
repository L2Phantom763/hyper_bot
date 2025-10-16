import { logger } from "../utils/logger.js";
import { getUserInfo } from "../db/getUserInfo.js";
import {
  getReferralStats,
  getReferralLink,
  getRecentEarnings,
} from "../services/referralService.js";

/**
 * Handle the /referral command - Main menu
 * @param {Object} ctx - Telegram context
 */
export async function handleReferral(ctx) {
  try {
    const telegramId = ctx.from.id;
    logger.info("Referral command triggered", { telegramId });

    const userInfo = await getUserInfo(telegramId);
    if (!userInfo || !userInfo.referral_code) {
      await ctx.reply("❌ User not found or referral code not generated.");
      return;
    }

    const stats = await getReferralStats(userInfo.id_user);

    const lastDistribution = stats.lastDistributionDate 
      ? new Date(stats.lastDistributionDate).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        })
      : 'Never';

    const message = `🎁 *Referral Program*\n\n` +
      `Invite friends and earn 30% of their trading fees!\n` +
      `💸 Payouts are distributed monthly.\n\n` +
      `📊 *Your Stats:*\n` +
      `👥 Referred Users: ${stats.totalReferred}\n` +
      `💰 Pending (This Month): $${stats.pendingEarnings.toFixed(2)} USDC\n` +
      `✅ Total Paid: $${stats.paidEarnings.toFixed(2)} USDC\n` +
      `📅 Last Distribution: ${lastDistribution}\n\n` +
      `Choose an option below:`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 My Referral Link", callback_data: "referral_link" }],
          [
            { text: `👥 My Referrals (${stats.totalReferred})`, callback_data: "referral_list" },
          ],
          [
            { text: `💰 Earnings History`, callback_data: "referral_earnings" },
          ],
        ],
      },
    };

    await ctx.replyWithMarkdown(message, keyboard);
  } catch (error) {
    logger.error("Error in handleReferral", error);
    await ctx.reply("❌ An error occurred. Please try again later.");
  }
}

/**
 * Handle "My Referral Link" button
 * @param {Object} ctx - Telegram context
 */
async function handleReferralLink(ctx) {
  try {
    const telegramId = ctx.from.id;
    const userInfo = await getUserInfo(telegramId);

    if (!userInfo || !userInfo.referral_code) {
      await ctx.answerCbQuery("❌ Referral code not found");
      return;
    }

    // Get bot username
    const botInfo = await ctx.telegram.getMe();
    const referralLink = getReferralLink(userInfo.referral_code, botInfo.username);

    const message = `📋 *Your Referral Link*\n\n` +
      `Share this link with your friends:\n\n` +
      `\`${referralLink}\`\n\n` +
      `Your Referral Code: \`${userInfo.referral_code}\`\n\n` +
      `💡 *How it works:*\n` +
      `• Your friend joins using your link\n` +
      `• You earn 30% of their trading fees\n` +
      `• No limit on referrals!\n`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔗 Share Link",
              url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Join HyperBot and start trading!")}`,
            },
          ],
          [{ text: "« Back to Menu", callback_data: "referral_menu" }],
        ],
      },
    };

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...keyboard,
    });
    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error in handleReferralLink", error);
    await ctx.answerCbQuery("❌ Error loading referral link");
  }
}

/**
 * Handle "My Referrals" list button
 * @param {Object} ctx - Telegram context
 * @param {number} page - Page number for pagination
 */
async function handleReferralList(ctx, page = 0) {
  try {
    const telegramId = ctx.from.id;
    const userInfo = await getUserInfo(telegramId);

    if (!userInfo) {
      await ctx.answerCbQuery("❌ User not found");
      return;
    }

    const stats = await getReferralStats(userInfo.id_user);

    if (stats.totalReferred === 0) {
      const message = `👥 *Your Referrals*\n\n` +
        `You haven't referred anyone yet.\n\n` +
        `Share your referral link to start earning!`;

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Get My Link", callback_data: "referral_link" }],
            [{ text: "« Back to Menu", callback_data: "referral_menu" }],
          ],
        },
      };

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      await ctx.answerCbQuery();
      return;
    }

    // Pagination
    const itemsPerPage = 5;
    const totalPages = Math.ceil(stats.referredUsers.length / itemsPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIdx = currentPage * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageUsers = stats.referredUsers.slice(startIdx, endIdx);

    let message = `👥 *Your Referrals* (${stats.totalReferred} total)\n\n`;

    pageUsers.forEach((user, idx) => {
      const num = startIdx + idx + 1;
      const username = user.username || `User ${user.telegramId}`;
      const contributed = user.totalContributed.toFixed(2);
      const date = new Date(user.joinedAt).toLocaleDateString();
      
      message += `${num}. @${username}\n`;
      message += `   💰 Earned you: $${contributed}\n`;
      message += `   📅 Joined: ${date}\n\n`;
    });

    message += `\nPage ${currentPage + 1}/${totalPages}`;

    // Build keyboard with pagination
    const keyboard = [];
    
    if (totalPages > 1) {
      const navButtons = [];
      if (currentPage > 0) {
        navButtons.push({
          text: "⬅️ Previous",
          callback_data: `referral_list_${currentPage - 1}`,
        });
      }
      if (currentPage < totalPages - 1) {
        navButtons.push({
          text: "Next ➡️",
          callback_data: `referral_list_${currentPage + 1}`,
        });
      }
      keyboard.push(navButtons);
    }

    keyboard.push([{ text: "« Back to Menu", callback_data: "referral_menu" }]);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error in handleReferralList", error);
    await ctx.answerCbQuery("❌ Error loading referrals");
  }
}

/**
 * Handle "Earnings History" button
 * @param {Object} ctx - Telegram context
 */
async function handleReferralEarnings(ctx) {
  try {
    const telegramId = ctx.from.id;
    const userInfo = await getUserInfo(telegramId);

    if (!userInfo) {
      await ctx.answerCbQuery("❌ User not found");
      return;
    }

    const stats = await getReferralStats(userInfo.id_user);
    const recentEarnings = await getRecentEarnings(userInfo.id_user, 10);

    let message = `💰 *Earnings History*\n\n` +
      `💰 Pending: $${stats.pendingEarnings.toFixed(2)} USDC\n` +
      `✅ Total Paid: $${stats.paidEarnings.toFixed(2)} USDC\n` +
      `📊 All Time: $${stats.totalEarnings.toFixed(2)} USDC\n\n`;

    if (recentEarnings.length === 0) {
      message += `No earnings yet. Share your referral link to start earning!`;
    } else {
      message += `*Recent Earnings:*\n\n`;

      recentEarnings.forEach((earning, idx) => {
        const username = earning.referredUsername || `User ${earning.referredTelegramId}`;
        const amount = earning.amount.toFixed(4);
        const statusEmoji = earning.status === 'paid' ? '✅' : '⏳';
        const date = new Date(earning.createdAt).toLocaleDateString();
        const time = new Date(earning.createdAt).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        message += `${idx + 1}. ${statusEmoji} $${amount} from @${username}\n`;
        message += `   📅 ${date} ${time}\n\n`;
      });

      if (recentEarnings.length === 10) {
        message += `\n_Showing last 10 earnings_\n`;
      }
      message += `\n⏳ = Pending  |  ✅ = Paid`;
    }

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "« Back to Menu", callback_data: "referral_menu" }],
        ],
      },
    };

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...keyboard,
    });
    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error in handleReferralEarnings", error);
    await ctx.answerCbQuery("❌ Error loading earnings");
  }
}

/**
 * Handle back to main menu
 * @param {Object} ctx - Telegram context
 */
async function handleReferralMenu(ctx) {
  try {
    // Just re-trigger the main referral handler
    await handleReferral(ctx);
    await ctx.answerCbQuery();
  } catch (error) {
    logger.error("Error in handleReferralMenu", error);
    await ctx.answerCbQuery("❌ Error loading menu");
  }
}

/**
 * Register all referral-related handlers
 * @param {Object} bot - Telegraf bot instance
 */
export default function registerReferralHandler(bot) {
  // Command handler
  bot.command("referral", handleReferral);

  // Callback query handlers
  bot.action("referral_menu", handleReferralMenu);
  bot.action("referral_link", handleReferralLink);
  bot.action("referral_list", (ctx) => handleReferralList(ctx, 0));
  bot.action(/^referral_list_(\d+)$/, (ctx) => {
    const page = Number(ctx.match[1]);
    return handleReferralList(ctx, page);
  });
  bot.action("referral_earnings", handleReferralEarnings);

  logger.info("Referral handlers registered successfully");
}

