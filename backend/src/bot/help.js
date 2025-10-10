import { Markup } from "telegraf";
import { backToMenuButton } from "./navigation.js";

const tradingCommands = [
  { cmd: "/long [ticker] [leverage] [margin]", desc: "Open long position" },
  { cmd: "/short [ticker] [leverage] [margin]", desc: "Open short position" },
  { cmd: "/close [ticker] [percent]", desc: "Close a position" },
  { cmd: "/positions", desc: "View your open positions" },
  { cmd: "/markets", desc: "Browse available markets" },
  { cmd: "/chart [symbol] [timeframe]", desc: "View price chart" },
];

const accountCommands = [
  { cmd: "/balance", desc: "Check your balance" },
  { cmd: "/wallet", desc: "View wallet address" },
  { cmd: "/withdraw", desc: "Withdraw funds" },
  { cmd: "/referral", desc: "Referral program" },
];

const generalCommands = [
  { cmd: "/start", desc: "Start or restart the bot" },
  { cmd: "/menu", desc: "Show main menu" },
  { cmd: "/help", desc: "Show this help" },
];

export async function handleHelp(ctx) {
  const helpMessage =
    "📖 *Help & Commands*\n\n" +
    "*🔷 Trading Commands:*\n" +
    tradingCommands.map((c) => `\`${c.cmd}\`\n   ${c.desc}`).join("\n\n") +
    "\n\n*💰 Account Commands:*\n" +
    accountCommands.map((c) => `\`${c.cmd}\`\n   ${c.desc}`).join("\n\n") +
    "\n\n*ℹ️ General Commands:*\n" +
    generalCommands.map((c) => `\`${c.cmd}\`\n   ${c.desc}`).join("\n\n") +
    "\n\n*💡 Quick Tips:*\n" +
    "• Use fast mode: `/long BTC 10x 50`\n" +
    "• Or use interactive mode: `/long`\n" +
    "• Navigate with buttons for convenience\n" +
    "• Type `/menu` anytime for main menu";

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📈 Start Trading", callback_data: "trade_long" },
        ],
        [
          { text: "📋 View Markets", callback_data: "menu_markets" },
          { text: "📊 My Positions", callback_data: "menu_positions" },
        ],
        [backToMenuButton()],
      ],
    },
  };

  // Check if this is a callback query (edit) or regular message (send)
  if (ctx.update?.callback_query) {
    try {
      await ctx.editMessageText(helpMessage, {
        parse_mode: "Markdown",
        ...keyboard,
      });
      await ctx.answerCbQuery();
    } catch (error) {
      if (!error.message?.includes("message is not modified")) {
        await ctx.reply(helpMessage, {
          parse_mode: "Markdown",
          ...keyboard,
        });
      } else {
        await ctx.answerCbQuery("Help");
      }
    }
  } else {
    await ctx.reply(helpMessage, {
      parse_mode: "Markdown",
      ...keyboard,
    });
  }
}
