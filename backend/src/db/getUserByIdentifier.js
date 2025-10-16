import sql from "./db.js";
import { logger } from "../utils/logger.js";

/**
 * Get user by username or telegram ID
 * @param {string} identifier - Username (with or without @) or telegram_id
 * @returns {Promise<Object|null>} User object or null if not found
 */
export async function getUserByIdentifier(identifier) {
  try {
    // Remove @ if present
    const cleanIdentifier = identifier.replace(/^@/, "");
    
    // Try to parse as telegram_id (number)
    const telegramId = parseInt(cleanIdentifier, 10);
    
    let user;
    
    if (!isNaN(telegramId) && cleanIdentifier === String(telegramId)) {
      // It's a valid telegram_id
      [user] = await sql`
        SELECT 
          id_user,
          telegram_id,
          username,
          hl_address,
          hl_privkey,
          created_at,
          last_active
        FROM users 
        WHERE telegram_id = ${telegramId}
      `;
    } else {
      // It's a username
      [user] = await sql`
        SELECT 
          id_user,
          telegram_id,
          username,
          hl_address,
          hl_privkey,
          created_at,
          last_active
        FROM users 
        WHERE LOWER(username) = LOWER(${cleanIdentifier})
      `;
    }
    
    return user || null;
  } catch (error) {
    logger.error("Error getting user by identifier", { identifier, error });
    throw error;
  }
}

/**
 * Get user display name
 * @param {Object} user - User object
 * @returns {string} Display name
 */
export function getUserDisplayName(user) {
  if (!user) return "Unknown";
  return user.username ? `@${user.username}` : `User_${user.telegram_id}`;
}

