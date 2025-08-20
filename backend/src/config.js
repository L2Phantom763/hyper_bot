import dotenv from "dotenv";

dotenv.config();

export const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
  },
};

export function validateConfig() {
  const errors = [];

  if (!config.telegram.token) {
    errors.push("TELEGRAM_BOT_TOKEN is required");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join("\n")}`);
  }
}
