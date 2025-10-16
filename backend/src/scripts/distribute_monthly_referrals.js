// Import config.js FIRST to load .env before any other imports
import "../config.js";

import { ethers } from "ethers";
import { exchClient } from "../utils/client.js";
import { logger } from "../utils/logger.js";
import {
  getPendingEarningsForDistribution,
  markEarningsAsPaid,
} from "../services/referralService.js";
import readline from "readline";

// Configuration
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
const HYPERLIQUID_CHAIN = process.env.HYPERLIQUID_CHAIN || "Testnet"; // "Mainnet" or "Testnet"
const MIN_PAYOUT_AMOUNT = 0; // Minimum amount to process payout (set to 0 for no minimum)

/**
 * Prompt user for confirmation
 */
function promptConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Generate batch ID for this distribution (YYYY-MM format)
 */
function generateBatchId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Send USDC using Hyperliquid's usdSend
 * @param {Object} client - Hyperliquid exchange client
 * @param {string} destination - Recipient wallet address
 * @param {string} amount - Amount to send as string
 * @returns {Promise<Object>} Response from Hyperliquid
 */
async function sendUSDC(client, destination, amount) {
  try {
    const response = await client.usdSend({
      destination,
      amount,
      hyperliquidChain: HYPERLIQUID_CHAIN,
    });

    logger.info("USDC sent successfully", { destination, amount, response });
    return { success: true, response };
  } catch (error) {
    logger.error("Error sending USDC", { destination, amount, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Main distribution function
 */
async function distributeMonthlyReferrals(dryRun = true) {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🎁 MONTHLY REFERRAL DISTRIBUTION SCRIPT");
    console.log("=".repeat(60));
    console.log(`Mode: ${dryRun ? "DRY RUN (No actual transfers)" : "LIVE (Real transfers)"}`);
    console.log(`Chain: ${HYPERLIQUID_CHAIN}`);
    console.log(`Minimum Payout: $${MIN_PAYOUT_AMOUNT} USDC`);
    console.log("=".repeat(60) + "\n");

    // Validate treasury private key
    if (!TREASURY_PRIVATE_KEY) {
      throw new Error("TREASURY_PRIVATE_KEY not found in .env file");
    }

    // Initialize treasury wallet
    const treasuryWallet = new ethers.Wallet(TREASURY_PRIVATE_KEY);
    console.log(`📊 Treasury Wallet: ${treasuryWallet.address}\n`);

    // Get pending earnings
    console.log("📋 Fetching pending earnings...\n");
    const pendingEarnings = await getPendingEarningsForDistribution();

    if (pendingEarnings.length === 0) {
      console.log("✅ No pending earnings to distribute!\n");
      return;
    }

    // Filter by minimum amount
    const eligibleEarnings = pendingEarnings.filter(
      (e) => e.totalPending >= MIN_PAYOUT_AMOUNT
    );

    if (eligibleEarnings.length === 0) {
      console.log(
        `⚠️  ${pendingEarnings.length} user(s) with earnings below minimum ($${MIN_PAYOUT_AMOUNT})\n`
      );
      return;
    }

    // Display summary
    const totalAmount = eligibleEarnings.reduce((sum, e) => sum + e.totalPending, 0);
    console.log(`Found ${eligibleEarnings.length} user(s) eligible for payout:\n`);
    console.log("─".repeat(80));
    console.log(
      `${"Username".padEnd(20)} | ${"Wallet".padEnd(42)} | ${"Amount".padStart(12)}`
    );
    console.log("─".repeat(80));

    eligibleEarnings.forEach((earning) => {
      const username = (earning.username || `User_${earning.telegramId}`).padEnd(20);
      const wallet = earning.walletAddress.padEnd(42);
      const amount = `$${earning.totalPending.toFixed(2)}`.padStart(12);
      console.log(`${username} | ${wallet} | ${amount}`);
    });

    console.log("─".repeat(80));
    console.log(`${"TOTAL".padEnd(64)} | ${"$" + totalAmount.toFixed(2).padStart(12)}`);
    console.log("─".repeat(80) + "\n");

    // Confirmation prompt
    if (!dryRun) {
      console.log("⚠️  WARNING: This will perform REAL transfers!");
      const confirmed = await promptConfirmation(
        "\nDo you want to proceed with the distribution? (y/n): "
      );

      if (!confirmed) {
        console.log("\n❌ Distribution cancelled by user.\n");
        return;
      }
    } else {
      console.log("ℹ️  DRY RUN MODE: No actual transfers will be made.\n");
    }

    // Initialize Hyperliquid client
    const client = dryRun ? null : await exchClient(treasuryWallet);

    // Process distributions
    const batchId = generateBatchId();
    console.log(`\n📦 Batch ID: ${batchId}`);
    console.log("─".repeat(60) + "\n");

    const results = {
      successful: [],
      failed: [],
      total: eligibleEarnings.length,
    };

    for (const earning of eligibleEarnings) {
      const username = earning.username || `User_${earning.telegramId}`;
      const amount = earning.totalPending.toFixed(6);

      console.log(`Processing: ${username} ($${amount})...`);

      if (dryRun) {
        console.log(`  ✓ [DRY RUN] Would send $${amount} to ${earning.walletAddress}`);
        results.successful.push(earning);
      } else {
        // Perform actual transfer
        const result = await sendUSDC(client, earning.walletAddress, amount);

        if (result.success) {
          console.log(`  ✅ Sent $${amount} to ${earning.walletAddress}`);

          // Mark earnings as paid
          const markedCount = await markEarningsAsPaid(earning.earningIds, batchId);
          console.log(`  ✓ Marked ${markedCount} earning(s) as paid`);

          results.successful.push({
            ...earning,
            transactionResponse: result.response,
          });
        } else {
          console.log(`  ❌ Failed: ${result.error}`);
          results.failed.push({
            ...earning,
            error: result.error,
          });
        }
      }

      console.log();
    }

    // Final summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 DISTRIBUTION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Users: ${results.total}`);
    console.log(`✅ Successful: ${results.successful.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`💰 Total Amount: $${totalAmount.toFixed(2)} USDC`);

    if (results.successful.length > 0) {
      const successAmount = results.successful.reduce(
        (sum, e) => sum + e.totalPending,
        0
      );
      console.log(`✅ Successfully Distributed: $${successAmount.toFixed(2)} USDC`);
    }

    if (results.failed.length > 0) {
      const failedAmount = results.failed.reduce((sum, e) => sum + e.totalPending, 0);
      console.log(`❌ Failed to Distribute: $${failedAmount.toFixed(2)} USDC`);
      console.log("\nFailed Transfers:");
      results.failed.forEach((f) => {
        console.log(`  - ${f.username || f.telegramId}: ${f.error}`);
      });
    }

    console.log("=".repeat(60) + "\n");

    if (dryRun) {
      console.log("ℹ️  This was a DRY RUN. No actual transfers were made.");
      console.log("ℹ️  To perform real distribution, run: node distribute_monthly_referrals.js --live\n");
    } else {
      console.log("✅ Distribution complete!\n");
    }
  } catch (error) {
    console.error("\n❌ Fatal error during distribution:", error);
    logger.error("Fatal error in distributeMonthlyReferrals", error);
    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);
const isLiveMode = args.includes("--live");
const isDryRun = !isLiveMode;

if (isLiveMode) {
  console.log("\n⚠️  LIVE MODE ENABLED - Real transfers will be made!\n");
}

distributeMonthlyReferrals(isDryRun)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

