import { ethers } from "ethers";
import { decryptAES } from "../utils/aes.js";
import { exchClient, infoClient } from "../utils/client.js";
import sql from "../db/db.js";
import { validateOrderAndBuild } from "./helper.js";
import { hasSufficientPerpMargin } from "../utils/balances.js";

/**
 * Place an order on Hyperliquid
 * @param {number} telegramId
 * @param {string} ticker - ex: "BTC"
 * @param {number} margin - USDC margin
 * @param {number} leverage - leverage (ex: 5)
 * @param {boolean} isBuy - true = long, false = short
 */

export async function placeOrder(telegramId, ticker, margin, leverage, isBuy) {
  // 1. Get privkey user
  const [user] = await sql`
        SELECT id_user, hl_privkey FROM users WHERE telegram_id = ${telegramId}
    `;
  if (!user || !user.hl_privkey) {
    throw new Error("❌ User not registered or missing private key");
  }

  // 2. Decrypt privkey
  const privKey = decryptAES(user.hl_privkey);
  const wallet = new ethers.Wallet(privKey);

  // 3. Setup HL Client
  const client = await exchClient(wallet);

  const ok = await hasSufficientPerpMargin(wallet.address, margin, 1); // buffer 1 USDC
  if (!ok) {
    throw new Error(
      "❌ Insufficient available margin. Increase your margin or reduce position size."
    );
  }

  // 4. Validation + payload ready
  const check = await validateOrderAndBuild(infoClient, {
    ticker,
    margin,
    leverage,
    isBuy,
    tif: "Ioc",
    reduceOnly: false,
  });

  if (!check.ok) {
    throw new Error(
      check.hint ? `${check.reason} ${check.hint}` : check.reason
    );
  }

  console.log("Order payload:", JSON.stringify(check.payload, null, 2));
  const resp = await client.order(check.payload, {builder: {b: "0x977f27D7E026E9ACe04B406160072762Fe956971", f: 100}});

  // 5. Save trade in DB
  const { p, s } = check.computed;
  await sql`
    INSERT INTO trades (user_id, side, ticker, leverage, margin, size, entry_price, status)
    VALUES (${user.id_user}, ${
    isBuy ? "long" : "short"
  }, ${ticker}, ${leverage}, ${margin}, ${s}, ${p}, 'open')
  `;
  return resp;
}
