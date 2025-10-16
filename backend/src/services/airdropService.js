import sql from '../db/db.js';
import { logger } from '../utils/logger.js';

/**
 * Service pour gérer le système d'airdrop
 */

class AirdropService {
  /**
   * Obtient la semaine active actuelle ou en crée une nouvelle
   */
  async getActiveWeek() {
    try {
      let week = await sql`
        SELECT * FROM AirdropWeeks WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
      `;

      if (week.length === 0) {
        // Créer une nouvelle semaine
        const weekNumber = this.getWeekNumber(new Date());
        const year = new Date().getFullYear();
        const startDate = this.getStartOfWeek(new Date());
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);

        week = await sql`
          INSERT INTO AirdropWeeks (week_number, year, start_date, end_date, status)
          VALUES (${weekNumber}, ${year}, ${startDate}, ${endDate}, 'active')
          RETURNING *
        `;
      }

      return week[0];
    } catch (error) {
      logger.error('Error fetching active week:', error);
      throw error;
    }
  }

  /**
   * Calcule les points quotidiens pour tous les utilisateurs et distribue le pool quotidien
   */
  async calculateDailyPoints() {
    try {
      const activeWeek = await this.getActiveWeek();
      const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
      const dailyPool = process.env.DAILY_POOL; // 1M / 7 jours = 142,857 points par jour

      logger.info(`Calculating daily points for ${today}`);

      // Récupérer tous les utilisateurs qui ont tradé aujourd'hui
      const users = await sql`
        SELECT DISTINCT user_id FROM Trades 
        WHERE DATE(opened_at) = ${today} OR DATE(closed_at) = ${today}
      `;

      if (users.length === 0) {
        logger.info('No trades today, skipping distribution');
        return { updated: 0, date: today, distributed: 0 };
      }

      // Calculer l'activité de chaque utilisateur (shares)
      const userActivities = [];
      let totalActivity = 0;

      for (const user of users) {
        const activity = await this.calculateUserDailyActivity(user.user_id, activeWeek.id_week, today);
        if (activity.activityScore > 0) {
          userActivities.push({
            userId: user.user_id,
            activityScore: activity.activityScore,
            volumeTraded: activity.volumeTraded,
            tradesCount: activity.tradesCount,
            profitableTrades: activity.profitableTrades,
            totalPnl: activity.totalPnl
          });
          totalActivity += activity.activityScore;
        }
      }

      if (totalActivity === 0) {
        logger.info('No valid activity today, skipping distribution');
        return { updated: 0, date: today, distributed: 0 };
      }

      // Distribuer les points proportionnellement
      let totalDistributed = 0;
      
      for (const userActivity of userActivities) {
        const userShare = (userActivity.activityScore / totalActivity) * dailyPool;
        
        // Enregistrer dans DailyPoints
        await sql`
          INSERT INTO DailyPoints (
            user_id, week_id, date, volume_traded, trades_count, 
            profitable_trades, total_pnl, points_earned, points_distributed
          )
          VALUES (
            ${userActivity.userId}, ${activeWeek.id_week}, ${today},
            ${userActivity.volumeTraded}, ${userActivity.tradesCount},
            ${userActivity.profitableTrades}, ${userActivity.totalPnl},
            ${userActivity.activityScore}, ${userShare}
          )
          ON CONFLICT (user_id, week_id, date) 
          DO UPDATE SET 
            volume_traded = ${userActivity.volumeTraded},
            trades_count = ${userActivity.tradesCount},
            profitable_trades = ${userActivity.profitableTrades},
            total_pnl = ${userActivity.totalPnl},
            points_earned = ${userActivity.activityScore},
            points_distributed = ${userShare}
        `;

        // Ajouter directement les points au total de l'utilisateur
        await sql`
          UPDATE Points 
          SET points = points + ${userShare}
          WHERE user_id = ${userActivity.userId}
        `;

        // Mettre à jour les stats hebdomadaires
        const weeklyStats = await sql`
          SELECT 
            SUM(points_earned) as total_activity,
            SUM(volume_traded) as total_volume,
            SUM(points_distributed) as total_points_received
          FROM DailyPoints
          WHERE user_id = ${userActivity.userId} AND week_id = ${activeWeek.id_week}
        `;

        const stats = weeklyStats[0];
        await sql`
          INSERT INTO Points (user_id, weekly_points, current_week_id, total_volume, last_daily_update, updated_at)
          VALUES (${userActivity.userId}, ${stats.total_points_received || 0}, ${activeWeek.id_week}, ${stats.total_volume || 0}, ${today}, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            weekly_points = ${stats.total_points_received || 0},
            current_week_id = ${activeWeek.id_week},
            total_volume = ${stats.total_volume || 0},
            last_daily_update = ${today},
            updated_at = CURRENT_TIMESTAMP
        `;

        totalDistributed += userShare;
      }

      logger.info(`Daily distribution completed: ${userActivities.length} users, ${totalDistributed.toFixed(2)} points distributed`);
      return { 
        updated: userActivities.length, 
        date: today,
        distributed: totalDistributed
      };
    } catch (error) {
      logger.error('Error calculating daily points:', error);
      throw error;
    }
  }

  /**
   * Calcule l'activité d'un utilisateur pour une journée (sans distribution)
   */
  async calculateUserDailyActivity(userId, weekId, date) {
    try {
      // Récupérer les trades de la journée
      const trades = await sql`
        SELECT 
          side, ticker, leverage, margin, size, 
          entry_price, exit_price, pnl, status,
          opened_at, closed_at
        FROM Trades
        WHERE user_id = ${userId} 
          AND (DATE(opened_at) = ${date} OR DATE(closed_at) = ${date})
      `;

      let volumeTraded = 0;
      let tradesCount = 0;
      let profitableTrades = 0;
      let totalPnl = 0;

      for (const trade of trades) {
        // Volume = margin × leverage
        const volume = parseFloat(trade.margin) * parseFloat(trade.leverage);
        volumeTraded += volume;
        tradesCount++;

        if (trade.status === 'closed' && parseFloat(trade.pnl) > 0) {
          profitableTrades++;
          totalPnl += parseFloat(trade.pnl);
        } else if (trade.status === 'closed') {
          totalPnl += parseFloat(trade.pnl);
        }
      }

      // Formule de calcul de l'activité (shares) :
      // Activity Score = Volume tradé + (Bonus profitable trades × 100) + (PnL positif × 10)
      let activityScore = volumeTraded;
      activityScore += profitableTrades * 100; // Bonus de 100 points par trade profitable
      if (totalPnl > 0) {
        activityScore += totalPnl * 10; // Bonus basé sur le PnL
      }

      return { 
        activityScore, 
        volumeTraded, 
        tradesCount,
        profitableTrades,
        totalPnl
      };
    } catch (error) {
      logger.error(`Error calculating points for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Réinitialise la semaine et archive les résultats
   * Note: Les points sont déjà distribués quotidiennement, on archive juste ici
   */
  async weeklyReset() {
    try {
      const activeWeek = await this.getActiveWeek();
      
      if (!activeWeek) {
        logger.warn('No active week found for reset');
        return;
      }

      logger.info(`Weekly reset for week ${activeWeek.week_number} of ${activeWeek.year}`);

      // Créer le leaderboard final (basé sur les points déjà distribués)
      const leaderboard = await sql`
        SELECT 
          p.user_id,
          p.weekly_points as points_received,
          p.total_volume,
          COUNT(dp.id_daily_point) as total_trades,
          COALESCE(SUM(dp.total_pnl), 0) as total_pnl,
          COALESCE(SUM(dp.points_distributed), 0) as total_distributed
        FROM Points p
        LEFT JOIN DailyPoints dp ON dp.user_id = p.user_id AND dp.week_id = ${activeWeek.id_week}
        WHERE p.current_week_id = ${activeWeek.id_week} AND p.weekly_points > 0
        GROUP BY p.user_id, p.weekly_points, p.total_volume
        ORDER BY p.weekly_points DESC
      `;

      // Archiver dans WeeklyLeaderboard
      let rank = 1;
      let totalDistributed = 0;
      
      for (const user of leaderboard) {
        const pointsReceived = parseFloat(user.points_received);
        
        await sql`
          INSERT INTO WeeklyLeaderboard 
            (week_id, user_id, rank, total_volume, total_trades, total_pnl, points_earned, reward_amount)
          VALUES (${activeWeek.id_week}, ${user.user_id}, ${rank}, ${user.total_volume}, ${user.total_trades}, ${user.total_pnl}, ${user.points_received}, ${pointsReceived})
        `;

        totalDistributed += pointsReceived;
        rank++;
      }

      // Marquer la semaine comme complétée
      await sql`
        UPDATE AirdropWeeks 
        SET status = 'completed' 
        WHERE id_week = ${activeWeek.id_week}
      `;

      // Créer la nouvelle semaine
      const newWeekNumber = this.getWeekNumber(new Date());
      const newYear = new Date().getFullYear();
      const newStartDate = this.getStartOfWeek(new Date());
      const newEndDate = new Date(newStartDate);
      newEndDate.setDate(newEndDate.getDate() + 7);

      await sql`
        INSERT INTO AirdropWeeks (week_number, year, start_date, end_date, status)
        VALUES (${newWeekNumber}, ${newYear}, ${newStartDate}, ${newEndDate}, 'active')
      `;

      // Réinitialiser les compteurs hebdomadaires pour tous les utilisateurs
      await sql`
        UPDATE Points 
        SET weekly_points = 0, 
            total_volume = 0,
            current_week_id = (SELECT id_week FROM AirdropWeeks WHERE status = 'active' LIMIT 1)
      `;

      logger.info(`Weekly reset completed. ${leaderboard.length} users ranked. Total distributed this week: ${totalDistributed.toFixed(2)} points.`);
      return { 
        weekCompleted: activeWeek.week_number,
        usersRanked: leaderboard.length,
        totalPointsDistributed: totalDistributed
      };
    } catch (error) {
      logger.error('Error during weekly reset:', error);
      throw error;
    }
  }

  /**
   * Obtient le leaderboard de la semaine en cours
   */
  async getCurrentLeaderboard(limit = 50) {
    try {
      const activeWeek = await this.getActiveWeek();

      const leaderboard = await sql`
        SELECT 
          p.user_id,
          u.telegram_id,
          u.username,
          p.weekly_points,
          p.total_volume,
          RANK() OVER (ORDER BY p.weekly_points DESC) as rank
        FROM Points p
        JOIN Users u ON u.id_user = p.user_id
        WHERE p.current_week_id = ${activeWeek.id_week} AND p.weekly_points > 0
        ORDER BY p.weekly_points DESC
        LIMIT ${limit}
      `;

      return {
        week: activeWeek,
        leaderboard: leaderboard
      };
    } catch (error) {
      logger.error('Error fetching leaderboard:', error);
      throw error;
    }
  }

  /**
   * Obtient les stats d'un utilisateur pour la semaine en cours
   */
  async getUserWeeklyStats(telegramId) {
    try {
      const activeWeek = await this.getActiveWeek();

      const userStats = await sql`
        SELECT 
          p.weekly_points,
          p.total_volume,
          p.last_daily_update,
          RANK() OVER (ORDER BY p.weekly_points DESC) as rank,
          (SELECT COUNT(DISTINCT user_id) FROM Points WHERE current_week_id = ${activeWeek.id_week} AND weekly_points > 0) as total_participants
        FROM Points p
        JOIN Users u ON u.id_user = p.user_id
        WHERE u.telegram_id = ${telegramId} AND p.current_week_id = ${activeWeek.id_week}
      `;

      if (userStats.length === 0) {
        return null;
      }

      return {
        week: activeWeek,
        stats: userStats[0]
      };
    } catch (error) {
      logger.error('Error fetching user stats:', error);
      throw error;
    }
  }

  /**
   * Utilitaires pour les dates
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lundi
    return new Date(d.setDate(diff));
  }
}

export default new AirdropService();

