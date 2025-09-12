import sql from "./db.js";
import { logger } from "../utils/logger.js";

export async function getUserInfo(telegramId) {
    const user = await sql`SELECT * FROM users WHERE telegram_id = ${telegramId}`;
    return user[0];
}