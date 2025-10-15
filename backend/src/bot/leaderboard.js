import airdropService from '../services/airdropService.js';
import { logger } from '../utils/logger.js';

/**
 * Affiche le leaderboard de la semaine en cours
 */
export async function handleLeaderboard(ctx) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  try {
    const { week, leaderboard } = await airdropService.getCurrentLeaderboard(20);

    if (leaderboard.length === 0) {
      await ctx.reply('📊 No activity this week. Be the first to trade!');
      return;
    }

    const startDate = new Date(week.start_date).toLocaleDateString('en-US');
    const endDate = new Date(week.end_date).toLocaleDateString('en-US');

    let message = `🏆 *AIRDROP LEADERBOARD*\n`;
    message += `📅 Week ${week.week_number} (${startDate} - ${endDate})\n`;
    message += `💰 Pool: 1,000,000 points\n\n`;

    leaderboard.forEach((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const username = user.username || `User_${user.telegram_id}`;
      const points = parseFloat(user.weekly_points).toLocaleString('en-US', { maximumFractionDigits: 0 });
      const volume = parseFloat(user.total_volume).toLocaleString('en-US', { maximumFractionDigits: 2 });
      
      message += `${medal} *${username}*\n`;
      message += `   💎 ${points} pts | 📊 $${volume}\n\n`;
    });

    message += `\n_Points are updated daily at midnight_\n`;
    message += `_Use /mystats to see your position_`;

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    logger.error('Error displaying leaderboard:', error);
    await ctx.reply('❌ Error retrieving leaderboard.');
  }
}

/**
 * Affiche les stats de l'utilisateur pour la semaine en cours
 */
export async function handleMyStats(ctx) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  const telegramId = ctx.from.id;
  try {
    const userStats = await airdropService.getUserWeeklyStats(telegramId);

    if (!userStats) {
      await ctx.reply(
        '📊 You don\'t have any points this week yet.\n\n' +
        'Start trading to accumulate points and climb the leaderboard!'
      );
      return;
    }

    const { week, stats } = userStats;
    const startDate = new Date(week.start_date).toLocaleDateString('en-US');
    const endDate = new Date(week.end_date).toLocaleDateString('en-US');

    const points = parseFloat(stats.weekly_points).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const volume = parseFloat(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const rank = stats.rank;
    const totalParticipants = stats.total_participants;
    
    // Calcul de la part estimée (1M points au total)
    const estimatedShare = parseFloat(stats.weekly_points) > 0 
      ? ((parseFloat(stats.weekly_points) / 1000000) * 100).toFixed(4)
      : '0';

    let message = `📊 *YOUR AIRDROP STATS*\n\n`;
    message += `📅 Week ${week.week_number} (${startDate} - ${endDate})\n\n`;
    message += `🏅 Rank: *#${rank}* / ${totalParticipants}\n`;
    message += `💎 Points: *${points}*\n`;
    message += `📊 Volume traded: $${volume}\n`;
    message += `📈 Estimated share: ~${estimatedShare}%\n\n`;

    // Encouragements selon le classement
    if (rank === 1) {
      message += `🥇 You're in the LEAD! Keep it up!\n`;
    } else if (rank <= 3) {
      message += `🔥 Top 3! You're on the podium!\n`;
    } else if (rank <= 10) {
      message += `💪 Top 10! Push harder for the podium!\n`;
    } else {
      message += `📈 Trade more to climb the leaderboard!\n`;
    }

    message += `\n_Last update: ${stats.last_daily_update || 'Today'}_\n`;
    message += `_Use /leaderboard to see the full ranking_`;

    await ctx.replyWithMarkdown(message);
  } catch (error) {
    logger.error('Error displaying user stats:', error);
    await ctx.reply('❌ Error retrieving your stats.');
  }
}

/**
 * Affiche les règles de l'airdrop
 */
export async function handleRules(ctx) {
  const message = `🎮 *AIRDROP RULES*\n\n` +
    `*Objective:*\n` +
    `Accumulate the most points each week to win your share of the 1,000,000 point pool!\n\n` +
    `*How to earn points:*\n` +
    `• 📊 Trading volume (margin × leverage)\n` +
    `• 💰 +100 points per profitable trade\n` +
    `• 📈 +10 points per $ of positive PnL\n\n` +
    `*Schedule:*\n` +
    `• 📅 New week every Monday\n` +
    `• 🔄 Daily update at midnight\n` +
    `• 🏆 Rewards distribution on Sunday night\n\n` +
    `*Distribution:*\n` +
    `The 1M points are distributed proportionally to your earned points.\n` +
    `The more you trade, the bigger your share!\n\n` +
    `*Commands:*\n` +
    `/leaderboard - View rankings\n` +
    `/mystats - View your stats\n` +
    `/rules - Review these rules`;

  await ctx.replyWithMarkdown(message);
}

