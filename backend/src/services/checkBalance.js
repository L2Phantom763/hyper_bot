import sql from '../db/db.js';

export async function hasSufficientBalance(telegramId, margin) {
  const [userRow] = await sql`
    SELECT id_user FROM users WHERE telegram_id = ${telegramId}
  `;
  if (!userRow) return false;

  const [bal] = await sql`
    SELECT amount FROM balances
    WHERE user_id = ${userRow.id_user} AND asset = 'USDC'
  `;

  const balance = bal ? parseFloat(bal.amount) : 0;
  return balance >= margin;
}
