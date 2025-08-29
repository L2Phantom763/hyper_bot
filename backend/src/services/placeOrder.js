import { ethers } from "ethers";
import { decryptAES } from "../utils/aes.js";
import { exchClient, infoClient } from "../utils/client.js";
import sql from "../db/db.js";

/**
 * Place an order on Hyperliquid
 * @param {number} telegramId
 * @param {string} ticker - ex: "BTC"
 * @param {number} margin - USDC margin
 * @param {number} leverage - leverage (ex: 5)
 * @param {boolean} isBuy - true = long, false = short
 */

// Helpers formats Hyperliquid
function trimTrailingZeros(str) {
  // "123.4500" -> "123.45", "123.000" -> "123"
  return str.includes('.') ? str.replace(/\.?0+$/, '') : str;
}
function toFixedNoExp(num, decimals) {
  // évite notations exponentielles et coupe proprement
  return trimTrailingZeros(Number(num).toFixed(decimals));
}

export async function placeOrder(telegramId, ticker, margin, leverage, isBuy)
{
    // 1. Get privkey user
    const [user] = await sql`
        SELECT id_user, hl_privkey FROM users WHERE telegram_id = ${telegramId}
    `;
    if (!user || !user.hl_privkey) {
        throw new Error('User not registered or missing private key');
    }

    // 2. Decrypt privkey
    const privKey = decryptAES(user.hl_privkey);
    const wallet = new ethers.Wallet(privKey);

    // 3. Setup HL Client
    const client = await exchClient(wallet);

      // ---- 1) Meta pour décimales + asset id
  const meta = await infoClient.meta(); // contient universe (perps)
  const perpIndex = meta.universe.findIndex(c => c.name === ticker); // ex "SOL"
  const isPerp = perpIndex >= 0;
  let a, pxDecimals, szDecimals;

  if (isPerp) {
    a = perpIndex;
    pxDecimals = meta.universe[a].pxDecimals ?? 2;   // valeurs typiques; lis dans meta
    szDecimals = meta.universe[a].szDecimals ?? 3;
  } else {
    // Essai spot
    const spot = await infoClient.spotMeta();
    const spotIndex = spot.universe.findIndex(c => c.name === `${ticker}/USDC`);
    if (spotIndex < 0) throw new Error(`Asset ${ticker} introuvable (perp & spot)`);
    a = 10000 + spotIndex; // règle spot
    // Décimales spot (si dispo dans spotMeta)
    pxDecimals = spot.universe[spotIndex].pxDecimals ?? 4;
    szDecimals = spot.universe[spotIndex].szDecimals ?? 6;
  }

  // ---- 2) BBO (ou fallback mid) pour price d’exé
  const book = await infoClient.l2Book({ coin: ticker }); // [bids[], asks[]]
  let bestBid, bestAsk;
  if (Array.isArray(book) && book.length >= 2 && book[0].length && book[1].length) {
    bestBid = Number(book[0][0].px);
    bestAsk = Number(book[1][0].px);
  } else {
    const mids = await infoClient.allMids();
    const mid = Number(mids[ticker]);
    if (!mid) throw new Error(`Pas de carnet ni mid pour ${ticker}`);
    const spread = mid * 0.001;
    bestBid = mid - spread / 2;
    bestAsk = mid + spread / 2;
  }

  // ---- 3) Prix & taille au bon format
  const slippage = 0.003;
  const execPx = isBuy ? bestAsk : bestBid;
  const rawP = isBuy ? execPx * (1 + slippage) : execPx * (1 - slippage);
  const rawSz = ( (margin * leverage) / execPx );

  // Quantification aux décimales autorisées
  const p = toFixedNoExp(rawP, pxDecimals);
  const s = toFixedNoExp(rawSz, szDecimals);

  // ---- 4) Construire l’ordre limit-IOC conforme au schéma
  const orderPayload = {
    orders: [{
      a,
      b: isBuy,
      p,            // String, décimales respectées
      s,            // String, décimales respectées
      r: false,
      t: { limit: { tif: "Ioc" } }
    }],
    grouping: "na"
  };

  // Logs utiles de debug
  console.log("Order payload:", JSON.stringify(orderPayload, null, 2));

  // ---- 5) Envoyer
  const resp = await client.order(orderPayload);

  // ---- 6) Enregistrer
  await sql`
    INSERT INTO trades (user_id, side, ticker, leverage, margin, size, entry_price, status)
    VALUES (${user.id_user}, ${isBuy ? "long" : "short"}, ${ticker}, ${leverage},
            ${margin}, ${s}, ${p}, 'open')
  `;
  return resp;
}