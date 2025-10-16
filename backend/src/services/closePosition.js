// services/closePosition.js
import { ethers } from "ethers";
import { decryptAES } from "../utils/aes.js";
import { exchClient, infoClient } from "../utils/client.js";
import sql from "../db/db.js";
import {
  resolveAssetMeta,
  computeRefPrice,
  toFixedNoExp,
  quantizeDown,
  roundPricePerp,
} from "./helper.js";
import { processFeeAndReferral } from "./referralService.js";

function normalizeTicker(x = "") {
  const u = String(x).toUpperCase().trim();
  return u
    .replace(/^PERP[:\-\/]/, "") // PERP:SOL -> SOL
    .replace(/[-\/]PERP$/, "") // SOL-PERP / SOL/PERP -> SOL
    .replace(/[-\/]USDC$/, "") // SOL/USDC -> SOL
    .replace(/[_\s]+/g, "");
}

/**
 * Récupère la position perp ouverte sur un ticker (si existante)
 * Renvoie { szi, entryPx } où szi > 0 => long, szi < 0 => short
 */
async function getPerpPosition(infoClient, walletAddress, ticker) {
  const T = normalizeTicker(ticker);

  const state = await infoClient.clearinghouseState({
    user: walletAddress,
    dex: "",
  });
  const positions = Array.isArray(state?.assetPositions)
    ? state.assetPositions
    : [];

  for (const ap of positions) {
    const p = ap?.position;
    if (!p) continue;
    const coinRaw = String(p.coin || "");
    const coinNorm = normalizeTicker(coinRaw);

    // match souple
    if (!(coinNorm === T || coinNorm.includes(T))) continue;

    const szi = Number(p.szi ?? p.sz ?? 0);
    if (!Number.isFinite(szi) || Math.abs(szi) < 1e-12) continue;

    const entryPx = Number(p.entryPx ?? p.entry ?? 0);
    return { szi, entryPx, coin: coinRaw };
  }
  return null;
}

/**
 * Construit un payload d'ordre reduceOnly par taille (market-like via limit+IOC)
 */
async function buildReduceOnlyClosePayload(
  infoClient,
  { ticker, isBuy, size }
) {
  const { a, isPerp, pxDecimals, szDecimals } = await resolveAssetMeta(
    infoClient,
    ticker
  );

  // Prix "market-like" = meilleure extrémité ± légère marge (slippage)
  const { pWithSlip } = await computeRefPrice(infoClient, ticker, isBuy);

  // Quantifications
  const sQuant = toFixedNoExp(quantizeDown(size, szDecimals), szDecimals);
  if (Number(sQuant) <= 0) {
    throw new Error("❌ Size to close too small after quantization.");
  }

  const p = isPerp
    ? roundPricePerp(pWithSlip, szDecimals)
    : toFixedNoExp(pWithSlip, pxDecimals);

  return {
    orders: [
      {
        a,
        b: !!isBuy, // buy pour fermer un short, sell pour fermer un long
        p,
        s: sQuant,
        r: true, // reduceOnly
        t: { limit: { tif: "Ioc" } }, // IOC => exécute de suite sinon annule
      },
    ],
    grouping: "na",
  };
}

/**
 * Ferme une position perp sur `ticker` pour un pourcentage donné (0-100)
 * @param {number} telegramId
 * @param {string} ticker
 * @param {number} percent - ex: 100 (par défaut)
 */
export async function closePosition(telegramId, ticker, percent = 100) {
  const T = String(ticker).toUpperCase();
  // 1) Récup user + wallet
  const [user] = await sql`
    SELECT id_user, hl_privkey FROM users WHERE telegram_id = ${telegramId}
  `;
  if (!user || !user.hl_privkey)
    throw new Error("❌ User not registered or missing private key");

  const privKey = decryptAES(user.hl_privkey);
  const wallet = new ethers.Wallet(privKey);

  // 2) Clients HL
  const client = await exchClient(wallet);

  // 3) Position courante
  let pos = await getPerpPosition(infoClient, wallet.address, T);
  if (!pos) {
    // petite attente et 2e lecture
    await new Promise((r) => setTimeout(r, 150));
    pos = await getPerpPosition(infoClient, wallet.address, T);
  }
  if (!pos) {
    throw new Error(
      `❌ No open perp position on ${T}. It may already be closed.`
    );
  }

  const { szi } = pos;
  const isLong = szi > 0;
  const absSz = Math.abs(szi);

  // 4) Portion à fermer
  const clampedPct = Math.min(100, Math.max(0, Number(percent)));
  if (clampedPct <= 0) throw new Error("❌ Close percent must be > 0");
  const sizeToClose = (absSz * clampedPct) / 100;

  // 5) Sens inverse + payload reduceOnly
  const isBuy = !isLong; // si long -> on vend (isBuy=false), si short -> on achète (isBuy=true) ; mais ici on veut l'inverse du sens d’origine
  const payload = await buildReduceOnlyClosePayload(infoClient, {
    ticker: T,
    isBuy,
    size: sizeToClose,
  });

  // 6) Envoi ordre
  const resp = await client.order(payload);

  // Calculate notional value for fee tracking
  const closePx = Number(payload?.orders?.[0]?.p || 0);
  const closeSz = Number(payload?.orders?.[0]?.s || 0);
  const closeNotional = closePx * closeSz;

  // Track fees and referral earnings for close
  if (closeNotional > 0) {
    try {
      const feeResult = await processFeeAndReferral(
        user.id_user,
        null, // No trade_id for closes (could be linked if needed)
        closeNotional
      );
      console.log("Close fee and referral processed:", feeResult);
    } catch (feeError) {
      console.error("Error processing close fee/referral:", feeError);
    }
  }

  // 7) DB : marquer comme "closed" si 100% (sinon "partial_close")
  if (clampedPct >= 99.9) {
    await sql`
    UPDATE trades
    SET status='closed', closed_at = NOW()
    WHERE id_trade = (
      SELECT id_trade FROM trades
      WHERE user_id=${user.id_user}
        AND ticker=${ticker.toUpperCase()}
        AND status='open'
      ORDER BY id_trade DESC
      LIMIT 1
    )
  `;
  } else {
    await sql`
        UPDATE trades
        SET status='partial_close', updated_at = NOW()
        WHERE id_trade = (
          SELECT id_trade FROM trades
          WHERE user_id=${
            user.id_user
          } AND ticker=${ticker.toUpperCase()} AND status IN ('open','partial_close')
          ORDER BY id_trade DESC
          LIMIT 1
        )
      `;
  }

  return resp;
}
