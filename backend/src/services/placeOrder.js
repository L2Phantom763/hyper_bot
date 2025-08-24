import { ethers } from "ethers";
import { ExchangeClient,WebSocketTransport } from "@nktkas/hyperliquid";
import { infoClient } from "../utils/client";

const transport = new WebSocketTransport({
    url: 'wss://api.hyperliquid.xyz/ws',
});

/**
 * Place an order on Hyperliquid
 * @param {number} telegramId
 * @param {string} ticker - ex: "BTC"
 * @param {number} margin - USDC margin
 * @param {number} leverage - leverage (ex: 5)
 * @param {boolean} isBuy - true = long, false = short
 */
export async function placeOrder(telegramId, ticker, margin, leverage, isBuy)
{
    // 1. Get privkey user
    const [user] = await sql`
        SELECT hl_privkey FROM users WHERE telegram_id = ${telegramId}
    `;
    if (!user || !user.hl_privkey) {
        throw new Error('User not registered or missing private key');
    }

    // 2. Setup wallet + client
    const wallet = new ethers.Wallet(user.hl_privkey);
    const client = new ExchangeClient({ transport, wallet});

    // 3. Current price
    const mids = await infoClient.allMids();
    const price = mids[ticker];
    if (!price) {
        throw new Error(`Ticker ${ticker} not found`);
    }

    // 4. Calculate order size
    const size = margin * leverage;
    const sz = (notional / price).toString();

    // 5. Place order
    const resp = await client.order({
        coin: ticker,
        isBuy,
        sz,
        orderType: {
            market: {},
        }
    });

    // 6. Save trade in DB
    await sql`
        INSERT INTO trades (
            user_id, side, ticker, leverage, margin, size, entry_price, status
        ) VALUES (
            ${user.id_user},
            ${isBuy ? "long" : "short"},
            ${ticker},
            ${leverage},
            ${margin},
            ${notional},
            ${price},
            'open'
        )
    `;

    return resp;
}