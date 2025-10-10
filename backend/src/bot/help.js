const commands = [
  { cmd: "/start", desc: "Start the bot" },
  { cmd: "/markets", desc: "View available markets" },
  { cmd: "/positions", desc: "Check your open positions" },
  { cmd: "/balance", desc: "Check your account balance" },
  { cmd: "/wallet", desc: "View your wallet address" },
  { cmd: "/withdraw", desc: "Withdraw funds to external address" },
  { cmd: "/referral", desc: "View referral program, share your link and track earnings" },
  { cmd: "/chart [symbol] [timeframe]", desc: "Generate cryptocurrency chart (e.g. /chart eth 1h)" },
  { cmd: "/help", desc: "Show this help message" },
];

export async function handleHelp(ctx) {
  const helpMessage =
    "📖 *Available Commands*:\n\n" +
    commands.map((c) => `${c.cmd} - ${c.desc}`).join("\n");

  await ctx.reply(helpMessage, { parse_mode: "Markdown" });
}
