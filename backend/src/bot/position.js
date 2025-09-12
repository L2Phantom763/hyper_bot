// src/bot/positions.js
import { ethers } from "ethers";
import sql from "../db/db.js";
import { decryptAES } from "../utils/aes.js";
import { infoClient } from "../utils/client.js";

function fmt(n, d = 4) {
  if (n == null || isNaN(n)) return "?";
  return Number(n).toFixed(d);
}
function sideFromSize(szi) {
  const sz = Number(szi);
  if (!isFinite(sz) || sz === 0) return "FLAT";
  return sz > 0 ? "LONG" : "SHORT";
}

export async function handlePositions(ctx) {
  try {
    const telegramId = ctx.from.id;

    // 1) Récup user + wallet address
    const rows =
      await sql`SELECT hl_privkey FROM users WHERE telegram_id = ${telegramId}`;
    if (!rows.length || !rows[0].hl_privkey) {
      return ctx.reply("❌ User not registered. Use /start to begin.");
    }
    const privKey = decryptAES(rows[0].hl_privkey);
    const wallet = new ethers.Wallet(privKey);
    const address = wallet.address;

    // 2) Lire l’état perp: clearinghouseState
    const state = await infoClient.clearinghouseState({
      user: address,
      dex: "",
    });

    // structure attendue: state.assetPositions = [{ position: {...}, type: "oneWay" }, ...]
    const positions = Array.isArray(state?.assetPositions)
      ? state.assetPositions
      : [];

    if (!positions.length) {
      return ctx.reply("ℹ️ You have no open perpetual positions.");
    }

    // 3) (Optionnel) mark prices pour affichage / PnL
    const mids = (await infoClient.allMids?.()) ?? {};

    // 4) Construire le message
    let msg = "📊 *Your perpetual positions:*\n\n";
    for (const ap of positions) {
      const p = ap.position;
      if (!p) continue;

      const coin = p.coin; // ex: "SOL"
      const szi = Number(p.szi); // signed size
      const side = sideFromSize(szi);
      const sizeAbs = Math.abs(szi);

      const entry = Number(p.entryPx); // entry price
      const mark = mids[coin] ? Number(mids[coin]) : null;
      const liq = p.liquidationPx ? Number(p.liquidationPx) : null;

      // unrealizedPnl peut être fourni par HL ; sinon on peut approx:
      const uPnL =
        typeof p.unrealizedPnl === "string"
          ? Number(p.unrealizedPnl)
          : mark != null
          ? (mark - entry) * (szi > 0 ? sizeAbs : -sizeAbs)
          : null;

      const levType = p.leverage?.type ?? "isolated";
      const levVal = p.leverage?.value ?? null;

      const roe = p.returnOnEquity ? Number(p.returnOnEquity) : null; // ratio
      const roePct = roe != null ? roe * 100 : null;

      msg += `• ${coin} | *${side}*\n`;
      msg += `   Size: ${fmt(sizeAbs, 3)}\n`;
      msg += `   Entry: $${fmt(entry, 2)}\n`;
      msg += `   Mark: $${mark != null ? fmt(mark, 2) : "?"}\n`;
      if (liq != null) msg += `   Liq: $${fmt(liq, 2)}\n`;
      if (levVal != null) msg += `   Leverage: ${levType} x${levVal}\n`;
      if (uPnL != null) {
        const emo = uPnL >= 0 ? "✅" : "❌";
        msg += `   Unrealized PnL: ${emo} $${fmt(uPnL, 2)}\n`;
      }
      if (roePct != null && isFinite(roePct)) {
        const emo = roePct >= 0 ? "📈" : "📉";
        msg += `   ROE: ${emo} ${fmt(roePct, 2)}%\n`;
      }
      msg += "\n";
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error /positions:", err);
    await ctx.reply("⚠️ Unable to fetch your positions right now.");
  }
}
