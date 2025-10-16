#!/usr/bin/env node

/**
 * Script cron pour la mise à jour quotidienne des points
 * À exécuter chaque jour à minuit
 * 
 * Crontab: 0 0 * * * cd /path/to/backend && node src/scripts/daily_points_update.js
 */

import '../config.js'; // Charge les variables d'environnement
import airdropService from '../services/airdropService.js';
import { logger } from '../utils/logger.js';

async function runDailyUpdate() {
  try {
    logger.info('=== Starting daily points distribution ===');
    
    const result = await airdropService.calculateDailyPoints();
    
    logger.info(`✅ Distribution completed: ${result.updated} users, ${result.distributed.toFixed(2)} points distributed for ${result.date}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during daily distribution:', error);
    process.exit(1);
  }
}

// Exécuter le script
runDailyUpdate();

