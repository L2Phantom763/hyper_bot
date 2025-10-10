import { Markup } from "telegraf";

/**
 * Navigation utilities for consistent UI/UX across the bot
 */

/**
 * Create a "Back to Menu" button
 * @returns {Object} Inline keyboard button
 */
export function backToMenuButton() {
  return Markup.button.callback("🏠 Back to Menu", "menu_main");
}

/**
 * Create a "Cancel" button
 * @param {string} flowType - The flow type to cancel (long/short/close/withdraw)
 * @returns {Object} Inline keyboard button
 */
export function cancelButton(flowType) {
  return Markup.button.callback("❌ Cancel", `cancel_${flowType}`);
}

/**
 * Create navigation row with back to menu
 * @returns {Array} Array of button objects
 */
export function menuNavigationRow() {
  return [backToMenuButton()];
}

/**
 * Create navigation row with cancel and back to menu
 * @param {string} flowType - The flow type
 * @returns {Array} Array of button objects
 */
export function cancelAndMenuRow(flowType) {
  return [cancelButton(flowType), backToMenuButton()];
}

/**
 * Create a refresh button
 * @param {string} action - The action to trigger on refresh
 * @returns {Object} Inline keyboard button
 */
export function refreshButton(action = "refresh_balance") {
  return Markup.button.callback("🔄 Refresh", action);
}

/**
 * Standard success message format
 * @param {string} message - The success message
 * @returns {string} Formatted message
 */
export function successMessage(message) {
  return `✅ ${message}`;
}

/**
 * Standard error message format
 * @param {string} message - The error message
 * @returns {string} Formatted message
 */
export function errorMessage(message) {
  return `❌ ${message}`;
}

/**
 * Standard info message format
 * @param {string} message - The info message
 * @returns {string} Formatted message
 */
export function infoMessage(message) {
  return `ℹ️ ${message}`;
}

/**
 * Standard warning message format
 * @param {string} message - The warning message
 * @returns {string} Formatted message
 */
export function warningMessage(message) {
  return `⚠️ ${message}`;
}

/**
 * Format a number as USDC with proper decimals
 * @param {number} amount - The amount to format
 * @param {number} decimals - Number of decimal places (default 2)
 * @returns {string} Formatted amount
 */
export function formatUSDC(amount, decimals = 2) {
  const num = Number(amount);
  if (isNaN(num)) return "0.00";
  return num.toFixed(decimals);
}

/**
 * Format a percentage with sign
 * @param {number} percent - The percentage value
 * @returns {string} Formatted percentage with emoji
 */
export function formatPercentage(percent) {
  const num = Number(percent);
  if (isNaN(num)) return "0.00%";
  
  const sign = num >= 0 ? "+" : "";
  const emoji = num >= 0 ? "📈" : "📉";
  
  return `${emoji} ${sign}${num.toFixed(2)}%`;
}

/**
 * Create a loading message
 * @param {string} action - What is being loaded
 * @returns {string} Loading message
 */
export function loadingMessage(action) {
  return `⏳ ${action}...`;
}

/**
 * Create an inline keyboard with consistent styling
 * @param {Array<Array<Object>>} rows - Array of button rows
 * @param {boolean} addMenuButton - Whether to add back to menu button
 * @returns {Object} Telegram keyboard markup
 */
export function createKeyboard(rows, addMenuButton = true) {
  const keyboard = [...rows];
  
  if (addMenuButton) {
    keyboard.push(menuNavigationRow());
  }
  
  return {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  };
}

/**
 * Create confirmation buttons (Confirm/Cancel)
 * @param {string} confirmAction - Callback data for confirm
 * @param {string} cancelAction - Callback data for cancel
 * @returns {Array<Array<Object>>} Button rows
 */
export function confirmationButtons(confirmAction, cancelAction) {
  return [
    [
      Markup.button.callback("✅ Confirm", confirmAction),
      Markup.button.callback("❌ Cancel", cancelAction),
    ],
  ];
}

/**
 * Create pagination buttons
 * @param {number} currentPage - Current page number (0-indexed)
 * @param {number} totalPages - Total number of pages
 * @param {string} actionPrefix - Prefix for callback data (e.g., "markets_page")
 * @returns {Array<Object>} Array of pagination buttons
 */
export function paginationButtons(currentPage, totalPages, actionPrefix) {
  const buttons = [];
  
  if (currentPage > 0) {
    buttons.push(
      Markup.button.callback("⬅️ Previous", `${actionPrefix}_${currentPage - 1}`)
    );
  }
  
  // Page indicator (non-clickable, just shows current page)
  if (totalPages > 1) {
    buttons.push(
      Markup.button.callback(
        `${currentPage + 1}/${totalPages}`,
        `page_info_${currentPage}`
      )
    );
  }
  
  if (currentPage < totalPages - 1) {
    buttons.push(
      Markup.button.callback("Next ➡️", `${actionPrefix}_${currentPage + 1}`)
    );
  }
  
  return buttons;
}

/**
 * Format position side with emoji
 * @param {string} side - "LONG" or "SHORT"
 * @returns {string} Formatted side
 */
export function formatSide(side) {
  const upperSide = String(side).toUpperCase();
  if (upperSide === "LONG") {
    return "📈 LONG";
  } else if (upperSide === "SHORT") {
    return "📉 SHORT";
  }
  return side;
}

/**
 * Format PnL with color indicator
 * @param {number} pnl - Profit/Loss amount
 * @returns {string} Formatted PnL
 */
export function formatPnL(pnl) {
  const num = Number(pnl);
  if (isNaN(num)) return "$0.00";
  
  const emoji = num >= 0 ? "🟢" : "🔴";
  const sign = num >= 0 ? "+" : "";
  
  return `${emoji} ${sign}$${num.toFixed(2)}`;
}

/**
 * Truncate address for display
 * @param {string} address - Ethereum address
 * @returns {string} Truncated address
 */
export function truncateAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Create a deep link for copying text
 * @param {string} text - Text to copy
 * @returns {string} Telegram deep link
 */
export function createCopyLink(text) {
  return `tg://msg?text=${encodeURIComponent(text)}`;
}

