import sql from "../db.js";
import { generateReferralCode } from "../../services/referralService.js";
import { logger } from "../../utils/logger.js";

/**
 * Generate referral codes for existing users who don't have one
 * Run this script after the database migration to populate codes for existing users
 */
async function generateExistingReferralCodes() {
  try {
    logger.info("Starting referral code generation for existing users...");

    // Get all users without referral codes
    const usersWithoutCodes = await sql`
      SELECT id_user, telegram_id, username 
      FROM users 
      WHERE referral_code IS NULL
    `;

    if (usersWithoutCodes.length === 0) {
      logger.info("All users already have referral codes!");
      process.exit(0);
    }

    logger.info(`Found ${usersWithoutCodes.length} users without referral codes`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutCodes) {
      try {
        const referralCode = await generateReferralCode();
        
        await sql`
          UPDATE users 
          SET referral_code = ${referralCode}
          WHERE id_user = ${user.id_user}
        `;

        logger.info(`Generated code for user ${user.username || user.telegram_id}: ${referralCode}`);
        successCount++;
      } catch (error) {
        logger.error(`Error generating code for user ${user.id_user}:`, error);
        errorCount++;
      }
    }

    logger.info(`
      Referral code generation complete!
      ✅ Success: ${successCount}
      ❌ Errors: ${errorCount}
    `);

    process.exit(0);
  } catch (error) {
    logger.error("Fatal error in generateExistingReferralCodes:", error);
    process.exit(1);
  }
}

// Run the script
generateExistingReferralCodes();

