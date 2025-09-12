// --- Helpers
function trimTrailingZeros(str) {
  return str.includes(".") ? str.replace(/\.?0+$/, "") : str;
}
export function toFixedNoExp(num, decimals) {
  return trimTrailingZeros(Number(num).toFixed(decimals));
}
export function quantizeDown(num, decimals) {
  const f = 10 ** decimals;
  return Math.floor(Number(num) * f) / f;
}

function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

export function parsePerpBalances(state) {
  const accountValue = Number(state?.marginSummary?.accountValue ?? 0);
  const totalMarginUsed = Number(state?.marginSummary?.totalMarginUsed ?? 0);
  const withdrawable = Number(
    state?.withdrawable ?? accountValue - totalMarginUsed
  );
  return { accountValue, totalMarginUsed, withdrawable };
}

/**
 * Prix perps Hyperliquid:
 * - max 5 chiffres significatifs (sauf entier, toujours OK)
 * - max décimales = 6 - szDecimals
 * Renvoie une string sans zéros traînants.
 */
export function roundPricePerp(p, szDecimals /*, isBuy */) {
  const MAX_DECIMALS_PERP = 6;
  const allowedDecimals = Math.max(0, MAX_DECIMALS_PERP - szDecimals);

  const absP = Math.abs(p);
  const intDigits = Math.max(1, Math.floor(absP).toString().length);

  // 5 chiffres significatifs max
  let decimals = Math.max(0, 5 - intDigits);
  decimals = Math.min(decimals, allowedDecimals);

  // Arrondi à 'decimals' décimales
  const factor = 10 ** decimals;
  let rounded = Math.round(p * factor) / factor;

  // Si la partie entière a ≥ 6 chiffres, on force l'entier (toujours valide)
  const finalIntDigits = Math.max(
    1,
    Math.floor(Math.abs(rounded)).toString().length
  );
  if (finalIntDigits >= 6) {
    rounded = Math.round(rounded);
    decimals = 0;
  }

  // String propre (pas d'exponentiel, pas de zéros inutiles)
  const out =
    decimals > 0 ? rounded.toFixed(decimals) : Math.round(rounded).toString();
  return trimTrailingZeros(out);
}

/**
 * Compute the minimum leverage required to reach the notional minimum
 * considering size quantization (szDecimals) and price rounding.
 */
function computeMinLeverageWithQuantization(
  minNtl,
  p,
  pWithSlip,
  margin,
  szDecimals
) {
  const q = 10 ** -szDecimals; // size step, e.g. 0.01
  // We want s_quant >= ceil(minNtl / (p * q)) * q
  const steps = Math.ceil(minNtl / (p * q));
  const requiredSize = steps * q;
  const requiredNotional = requiredSize * p;
  // rawSz = (margin * L) / pWithSlip => L >= requiredSize * pWithSlip / margin
  const requiredML = requiredSize * pWithSlip;
  const Lmin = Math.max(1, Math.ceil(requiredML / Math.max(margin, 1e-12)));
  return { Lmin, requiredSize, requiredNotional, requiredML };
}

/**
 * Resolve asset meta (perp or spot)
 */
export async function resolveAssetMeta(infoClient, ticker) {
  const meta = await infoClient.meta(); // perps
  const perpIndex = meta.universe.findIndex((c) => c.name === ticker);
  if (perpIndex >= 0) {
    const a = perpIndex;
    const pxDecimals = meta.universe[a].pxDecimals ?? 2;
    const szDecimals = meta.universe[a].szDecimals ?? 3;
    return { a, isPerp: true, pxDecimals, szDecimals, quote: "USD" };
  }
  // spot fallback
  const spot = await infoClient.spotMeta();
  const spotIndex = spot.universe.findIndex((c) => c.name === `${ticker}/USDC`);
  if (spotIndex < 0) {
    throw new Error(`Asset ${ticker} not found in perp or spot markets.`);
  }
  const a = 10000 + spotIndex; // HL rule for spot
  const pxDecimals = spot.universe[spotIndex].pxDecimals ?? 4;
  const szDecimals = spot.universe[spotIndex].szDecimals ?? 6;
  const quote = spot.universe[spotIndex].name.split("/")[1] || "USDC";
  return { a, isPerp: false, pxDecimals, szDecimals, quote };
}

/**
 * Compute reference execution price (BBO + light slippage)
 */
export async function computeRefPrice(
  infoClient,
  ticker,
  isBuy,
  slippage = 0.003
) {
  const book = await infoClient.l2Book({ coin: ticker });
  let bestBid, bestAsk;
  if (
    Array.isArray(book) &&
    book.length >= 2 &&
    book[0]?.length &&
    book[1]?.length
  ) {
    bestBid = Number(book[0][0].px);
    bestAsk = Number(book[1][0].px);
  } else {
    const mids = await infoClient.allMids();
    const mid = Number(mids[ticker]);
    if (!mid) throw new Error(`No orderbook or mid price for ${ticker}`);
    const spread = mid * 0.001;
    bestBid = mid - spread / 2;
    bestAsk = mid + spread / 2;
  }
  const execPx = isBuy ? bestAsk : bestBid;
  const pWithSlip = isBuy ? execPx * (1 + slippage) : execPx * (1 - slippage);
  return { execPx, pWithSlip };
}

/**
 * Validate & build order payload
 * Returns:
 *  - { ok: true, payload, computed: {...} }
 *  - { ok: false, reason, hint? }
 */
export async function validateOrderAndBuild(
  infoClient,
  { ticker, margin, leverage, isBuy, tif = "Ioc", reduceOnly = false }
) {
  // 0) Basic checks
  if (!ticker || !Number.isFinite(margin) || !Number.isFinite(leverage)) {
    return {
      ok: false,
      reason: "❌ Invalid parameters (ticker/margin/leverage).",
    };
  }
  if (margin <= 0)
    return { ok: false, reason: "❌ Margin must be greater than 0." };
  if (leverage <= 0)
    return { ok: false, reason: "❌ Leverage must be greater than 0." };

  // 1) Meta: asset id + decimals
  const { a, isPerp, pxDecimals, szDecimals, quote } = await resolveAssetMeta(
    infoClient,
    ticker
  );

  // 2) Reference price
  const { pWithSlip } = await computeRefPrice(infoClient, ticker, isBuy);

  // 3) Raw size from margin*leverage
  const rawSz = (margin * leverage) / pWithSlip;

  // 4) Quantization
  // Price: règles différentes perps vs spot
  const p = isPerp
    ? roundPricePerp(pWithSlip, szDecimals /*, isBuy */)
    : toFixedNoExp(pWithSlip, pxDecimals);

  const s = toFixedNoExp(quantizeDown(rawSz, szDecimals), szDecimals);

  if (Number(s) <= 0) {
    return {
      ok: false,
      reason:
        "❌ Order size too small after rounding. Increase margin or leverage.",
    };
  }

  // 5) Real notional after quantization
  const ntl = Number(p) * Number(s);
  const minNtl = 10;

  if (ntl < minNtl) {
    const { Lmin } = computeMinLeverageWithQuantization(
      minNtl,
      Number(p),
      pWithSlip,
      margin,
      szDecimals
    );

    return {
      ok: false,
      reason: `❌ Your order is too small (value ${ntl.toFixed(
        2
      )} USDC < minimum ${minNtl} USDC).`,
      hint: `👉 Try a higher leverage (e.g. ${Lmin}x instead of ${leverage}x) or increase your margin.`,
    };
  }

  // 6) Reduce-only (not handled here, just flag)
  // If reduceOnly=true and the order would increase the position → reject.

  // 7) Build payload
  const payload = {
    orders: [
      {
        a,
        b: !!isBuy,
        p,
        s,
        r: !!reduceOnly,
        t: { limit: { tif } },
      },
    ],
    grouping: "na",
  };

  return {
    ok: true,
    payload,
    computed: { a, isPerp, pxDecimals, szDecimals, p, s, ntl, minNtl, quote },
  };
}
