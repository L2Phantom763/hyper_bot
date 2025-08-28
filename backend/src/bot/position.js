import sql from "../db/db.js";
import { infoClient } from "../utils/client.js";

export async function handlePositions(ctx) {
  try {
    const telegramId = ctx.from.id;

    // Retrieve the user
    const user = await sql`
      SELECT hl_address FROM Users WHERE telegram_id = ${telegramId}
    `;

    if (!user.length) {
      return ctx.reply("❌ No account linked to your profile. Use /start to begin.");
    }

    const hlAddress = user[0].hl_address;

    // Fetch positions
    const positions = await infoClient.openOrders({ user: hlAddress });

    if (!positions || !positions.assetPositions?.length) {
      return ctx.reply("📭 You currently have no open positions.");
    }

    // Fetch market prices to calculate PnL
    const mids = await infoClient.allMids();

    // Format the message
    let message = "📊 **Your current positions :**\n\n";

    for (const pos of positions.assetPositions) {
      const ticker = pos.position.ticker;
      const size = parseFloat(pos.position.szi);
      const entry = parseFloat(pos.position.entryPx);
      const leverage = pos.position.leverage;

      const side = size > 0 ? "🟢 LONG" : "🔴 SHORT";

      // Current market price
      const mark = mids[ticker] ? parseFloat(mids[ticker]) : null;

      // Calculate unrealized PnL
      let pnl = 0;
      if (mark !== null) {
        pnl = (mark - entry) * size;
      }

      const pnlEmoji = pnl >= 0 ? "✅" : "❌";
      const pnlStr = pnl.toFixed(2);

      message += `• ${ticker} | ${side}\n`;
      message += `   Size : ${Math.abs(size)}\n`;
      message += `   Entry : $${entry}\n`;
      message += `   Market : $${mark ?? "?"}\n`;
      message += `   Leverage : x${leverage}\n`;
      message += `   Unrealized PnL : ${pnlEmoji} $${pnlStr}\n\n`;
    }

    ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Error /position:", err);
    ctx.reply("⚠️ Unable to fetch your positions at the moment.");
  }
}
