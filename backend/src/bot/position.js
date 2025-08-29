import sql from "../db/db.js";
import { infoClient } from "../utils/client.js";

export async function handlePositions(ctx) {
  try {
    const telegramId = ctx.from.id;

    // 1) Récup user
    const rows = await sql`SELECT hl_address FROM users WHERE telegram_id = ${telegramId}`;
    if (!rows.length) {
      return ctx.reply("❌ No account linked to your profile. Use /start to begin.");
    }
    const hlAddress = rows[0].hl_address;

    // 2) Récup positions (PAS openOrders)
    const state = await infoClient.portfolio({ user: hlAddress });
    const positions = state?.assetPositions || [];

    // Filtrer celles avec taille non nulle
    const live = positions.filter(p => Number(p.position?.szi || 0) !== 0);
    if (!live.length) {
      return ctx.reply("📭 You currently have no open positions.");
    }

    // 3) Prix de marché pour PnL
    const mids = await infoClient.allMids();

    // 4) Formatage
    let message = "📊 *Your current positions:*\n\n";
    for (const pos of live) {
      const ticker = pos.position.ticker;               // ex: "SOL"
      const size = Number(pos.position.szi);            // >0 long, <0 short
      const entry = Number(pos.position.entryPx);
      const side = size > 0 ? "🟢 LONG" : "🔴 SHORT";

      const mark = mids[ticker] ? Number(mids[ticker]) : null;

      // PnL non réalisé (fonctionne aussi si size < 0)
      const pnl = (mark != null) ? (mark - entry) * size : null;

      const pnlEmoji = pnl == null ? "❔" : (pnl >= 0 ? "✅" : "❌");
      const pnlStr = pnl == null ? "?" : pnl.toFixed(2);

      // Leverage: pas toujours fourni; essaye sinon mets "?"
      const lev = pos.position.leverage ?? "?";

      message += `• ${ticker} | ${side}\n`;
      message += `   Size : ${Math.abs(size)}\n`;
      message += `   Entry : $${entry}\n`;
      message += `   Market : $${mark ?? "?"}\n`;
      message += `   Leverage : x${lev}\n`;
      message += `   Unrealized PnL : ${pnlEmoji} $${pnlStr}\n\n`;
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error /positions:", err);
    await ctx.reply("⚠️ Unable to fetch your positions at the moment.");
  }
}
