#!/usr/bin/env node

/**
 * Script cron pour la mise à jour quotidienne des points
 * À exécuter chaque jour à minuit
 * 
 * Crontab: 0 0 * * * cd /path/to/backend && node src/scripts/daily_points_update.js
 */

import airdropService from '../services/airdropService.js';
import { logger } from '../utils/logger.js';

async function runDailyUpdate() {
  try {
    logger.info('=== Starting daily points update ===');
    
    const result = await airdropService.calculateDailyPoints();
    
    logger.info(`✅ Update completed: ${result.updated} users updated for ${result.date}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during daily update:', error);
    process.exit(1);
  }
}

// Exécuter le script
runDailyUpdate();

