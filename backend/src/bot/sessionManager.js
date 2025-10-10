import { logger } from "../utils/logger.js";

/**
 * Centralized session manager for all bot flows
 * Prevents session conflicts and provides proper cleanup
 */
class SessionManager {
  constructor() {
    // Store sessions by telegramId: { flowType, step, data, timestamp, timeoutId }
    this.sessions = new Map();
    this.SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Create or update a session
   * @param {number} telegramId - User's Telegram ID
   * @param {string} flowType - Type of flow (long/short/close/withdraw/chart)
   * @param {string} step - Current step in the flow
   * @param {Object} data - Session data
   */
  setSession(telegramId, flowType, step, data = {}) {
    // Clear any existing timeout
    const existing = this.sessions.get(telegramId);
    if (existing?.timeoutId) {
      clearTimeout(existing.timeoutId);
    }

    // Set timeout for auto-cleanup
    const timeoutId = setTimeout(() => {
      this.clearSession(telegramId);
      logger.info("Session auto-expired", { telegramId, flowType });
    }, this.SESSION_TIMEOUT);

    this.sessions.set(telegramId, {
      flowType,
      step,
      data,
      timestamp: Date.now(),
      timeoutId,
    });

    logger.debug("Session set", { telegramId, flowType, step });
  }

  /**
   * Get a session
   * @param {number} telegramId - User's Telegram ID
   * @param {string} [flowType] - Optional: only return if matches this flow type
   * @returns {Object|null} Session object or null
   */
  getSession(telegramId, flowType = null) {
    const session = this.sessions.get(telegramId);
    
    if (!session) {
      return null;
    }

    // If flowType specified, only return if it matches
    if (flowType && session.flowType !== flowType) {
      return null;
    }

    return session;
  }

  /**
   * Check if user has an active session
   * @param {number} telegramId - User's Telegram ID
   * @param {string} [flowType] - Optional: check for specific flow type
   * @returns {boolean}
   */
  hasSession(telegramId, flowType = null) {
    const session = this.sessions.get(telegramId);
    
    if (!session) {
      return false;
    }

    if (flowType) {
      return session.flowType === flowType;
    }

    return true;
  }

  /**
   * Update session data without changing step
   * @param {number} telegramId - User's Telegram ID
   * @param {Object} newData - New data to merge
   */
  updateSessionData(telegramId, newData) {
    const session = this.sessions.get(telegramId);
    if (session) {
      session.data = { ...session.data, ...newData };
      session.timestamp = Date.now();
      logger.debug("Session data updated", { telegramId, flowType: session.flowType });
    }
  }

  /**
   * Update session step
   * @param {number} telegramId - User's Telegram ID
   * @param {string} newStep - New step
   */
  updateSessionStep(telegramId, newStep) {
    const session = this.sessions.get(telegramId);
    if (session) {
      session.step = newStep;
      session.timestamp = Date.now();
      logger.debug("Session step updated", { telegramId, step: newStep });
    }
  }

  /**
   * Clear a session
   * @param {number} telegramId - User's Telegram ID
   */
  clearSession(telegramId) {
    const session = this.sessions.get(telegramId);
    if (session) {
      // Clear timeout
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
      this.sessions.delete(telegramId);
      logger.debug("Session cleared", { telegramId, flowType: session.flowType });
    }
  }

  /**
   * Clear all sessions (for testing or maintenance)
   */
  clearAllSessions() {
    for (const [telegramId, session] of this.sessions.entries()) {
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
    }
    this.sessions.clear();
    logger.info("All sessions cleared");
  }

  /**
   * Get session count for monitoring
   * @returns {number}
   */
  getSessionCount() {
    return this.sessions.size;
  }

  /**
   * Get all active sessions (for debugging)
   * @returns {Array}
   */
  getAllSessions() {
    const sessions = [];
    for (const [telegramId, session] of this.sessions.entries()) {
      sessions.push({
        telegramId,
        flowType: session.flowType,
        step: session.step,
        age: Date.now() - session.timestamp,
      });
    }
    return sessions;
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

