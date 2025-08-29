import sql from "../db/db.js";
import { infoClient } from "../utils/client.js";

function formatNum(value, decimals = 4) {
  if (value == null) return "?";
  return parseFloat(Number(value).toFixed(decimals));
}
export async function handlePositions(ctx) {
  try {
    const telegramId = ctx.from.id;

    const rows = await sql`SELECT id_user FROM users WHERE telegram_id = ${telegramId}`;
    if (!rows.length) {
      return ctx.reply("❌ User not registered. Use /start to begin.");
    }
    const userId = rows[0].id_user;


    const trades = await sql`
      SELECT ticker, side, leverage, margin, size, entry_price
      FROM trades
      WHERE user_id = ${userId}
    `;

    if (!trades.length) {
      return ctx.reply("❌ You currently have no open positions.");
    }

    const mids = await infoClient.allMids();

    let message = "📊 *Your current positions:*\n\n";
    for (const t of trades) {
      const { ticker, side, leverage, margin, size, entry_price } = t;

      const mark = mids[ticker] ? Number(mids[ticker]) : null;
      const pnl = (mark != null) ? (mark - entry_price) * (side === "long" ? size : -size) : null;

      const pnlEmoji = pnl == null ? "❔" : (pnl >= 0 ? "✅" : "❌");
      const pnlStr = pnl == null ? "?" : pnl.toFixed(2);

      message += `• ${ticker} | ${side.toUpperCase()}\n`;
      message += `   Size : ${formatNum(Math.abs(size), 3)}\n`;
      message += `   Entry : $${formatNum(entry_price, 2)}\n`;
      message += `   Market : $${formatNum(mark, 2)}\n`;
      message += `   Leverage : x${leverage}\n`;
      message += `   Unrealized PnL : ${pnlEmoji} $${pnlStr}\n\n`;
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error /positions:", err);
    await ctx.reply("⚠️ Unable to fetch your positions at the moment.");
  }
}