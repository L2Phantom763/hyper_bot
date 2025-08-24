import { infoClient } from "../utils/client.js";
import db from "../db/db.js";

export default function registerPositionHandler(bot) {
  bot.command("position", async (ctx) => {
    try {
      const telegramId = ctx.from.id;

      // Récupération de l’utilisateur
      const user = await db.query(
        "SELECT hl_address FROM Users WHERE telegram_id = $1",
        [telegramId]
      );

      if (!user.rows.length) {
        return ctx.reply("❌ Aucun compte lié à ton profil. Fais /start pour commencer.");
      }

      const hlAddress = user.rows[0].hl_address;

      // Récupère les positions
      const positions = await infoClient.activeAssetData({ user: hlAddress });

      if (!positions || !positions.assetPositions?.length) {
        return ctx.reply("📭 Tu n’as actuellement aucune position ouverte.");
      }

      // Récupère les prix de marché pour calculer le PnL
      const mids = await infoClient.allMids();

      // Formatter le message
      let message = "📊 **Tes positions actuelles :**\n\n";

      for (const pos of positions.assetPositions) {
        const ticker = pos.position.ticker;
        const size = parseFloat(pos.position.szi);
        const entry = parseFloat(pos.position.entryPx);
        const leverage = pos.position.leverage;

        const side = size > 0 ? "🟢 LONG" : "🔴 SHORT";

        // Prix actuel du marché
        const mark = mids[ticker] ? parseFloat(mids[ticker]) : null;

        // Calcul du PnL latent
        let pnl = 0;
        if (mark !== null) {
          pnl = (mark - entry) * size;
        }

        const pnlEmoji = pnl >= 0 ? "✅" : "❌";
        const pnlStr = pnl.toFixed(2);

        message += `• ${ticker} | ${side}\n`;
        message += `   Taille : ${Math.abs(size)}\n`;
        message += `   Entrée : $${entry}\n`;
        message += `   Marché : $${mark ?? "?"}\n`;
        message += `   Levier : x${leverage}\n`;
        message += `   PnL latent : ${pnlEmoji} $${pnlStr}\n\n`;
      }

      ctx.reply(message, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("Erreur /position:", err);
      ctx.reply("⚠️ Impossible de récupérer tes positions pour le moment.");
    }
  });
}
