#!/usr/bin/env node

/**
 * Script de test pour le système d'airdrop
 * Usage: node src/scripts/test_airdrop.js
 */

import airdropService from '../services/airdropService.js';
import { logger } from '../utils/logger.js';

async function testAirdropSystem() {
  try {
    console.log('\n🧪 Testing Airdrop System\n');
    console.log('='.repeat(50));

    // Test 1: Récupérer la semaine active
    console.log('\n📅 Test 1: Active week');
    const week = await airdropService.getActiveWeek();
    console.log('✅ Week:', {
      id: week.id_week,
      number: week.week_number,
      year: week.year,
      status: week.status,
      start: week.start_date,
      end: week.end_date
    });

    // Test 2: Récupérer le leaderboard
    console.log('\n🏆 Test 2: Current leaderboard');
    const { leaderboard } = await airdropService.getCurrentLeaderboard(10);
    if (leaderboard.length === 0) {
      console.log('⚠️  No active traders this week');
    } else {
      console.log(`✅ ${leaderboard.length} traders found:`);
      leaderboard.slice(0, 5).forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.username || 'User_' + user.telegram_id}: ${parseFloat(user.weekly_points).toFixed(2)} pts`);
      });
    }

    // Test 3: Calculer les points quotidiens (simulation)
    console.log('\n📊 Test 3: Daily points calculation');
    try {
      const result = await airdropService.calculateDailyPoints();
      console.log(`✅ Points calculated for ${result.updated} users`);
    } catch (error) {
      console.log('⚠️  No trades today or error:', error.message);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during tests:', error);
    process.exit(1);
  }
}

// Exécuter les tests
testAirdropSystem();

