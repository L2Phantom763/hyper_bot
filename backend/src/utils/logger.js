/**
 * Simple logging utility for the application
 * Provides different log levels: debug, info, warn, error
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  constructor(logLevel = "info") {
    this.currentLevel = LOG_LEVELS[logLevel] || LOG_LEVELS.info;
  }

  /**
   * Format log message with timestamp and level
   * @param {string} level - Log level
   * @param {string} message - Message to log
   * @param {Object} meta - Additional metadata
   * @returns {string} Formatted log message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaString =
      Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : "";

    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (this.currentLevel <= LOG_LEVELS.debug) {
      console.log(this.formatMessage("debug", message, meta));
    }
  }

  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (this.currentLevel <= LOG_LEVELS.info) {
      console.log(this.formatMessage("info", message, meta));
    }
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    if (this.currentLevel <= LOG_LEVELS.warn) {
      console.warn(this.formatMessage("warn", message, meta));
    }
  }

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Object|Error} meta - Additional metadata or error object
   */
  error(message, meta = {}) {
    if (this.currentLevel <= LOG_LEVELS.error) {
      const errorMeta =
        meta instanceof Error
          ? { error: meta.message, stack: meta.stack }
          : meta;

      console.error(this.formatMessage("error", message, errorMeta));
    }
  }

  /**
   * Set the current log level
   * @param {string} level - New log level
   */
  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.currentLevel = LOG_LEVELS[level];
    }
  }
}

// Create and export singleton logger instance
export const logger = new Logger("info");
