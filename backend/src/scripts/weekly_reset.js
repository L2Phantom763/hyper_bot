#!/usr/bin/env node

/**
 * Script cron pour le reset hebdomadaire et la distribution des rewards
 * À exécuter chaque lundi à minuit
 * 
 * Crontab: 0 0 * * 1 cd /path/to/backend && node src/scripts/weekly_reset.js
 */

import airdropService from '../services/airdropService.js';
import { logger } from '../utils/logger.js';

async function runWeeklyReset() {
  try {
    logger.info('=== Starting weekly reset ===');
    
    const result = await airdropService.weeklyReset();
    
    logger.info('✅ Weekly reset completed:');
    logger.info(`   - Week completed: ${result.weekCompleted}`);
    logger.info(`   - Users ranked: ${result.usersRanked}`);
    logger.info(`   - Points distributed: ${result.totalPointsDistributed}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during weekly reset:', error);
    process.exit(1);
  }
}

// Exécuter le script
runWeeklyReset();

