import { ethers } from "ethers";
import { decryptAES } from "../utils/aes.js";
import { exchClient, infoClient } from "../utils/client.js";
import sql from "../db/db.js";

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
        SELECT id_user, hl_privkey FROM users WHERE telegram_id = ${telegramId}
    `;
    if (!user || !user.hl_privkey) {
        throw new Error('User not registered or missing private key');
    }

    // 2. Decrypt privkey
    const privKey = decryptAES(user.hl_privkey);
    const wallet = new ethers.Wallet(privKey);

    // 3. Setup HL Client
    const client = await exchClient(wallet);

    // 4. Get current price
    const mids = await infoClient.allMids();
    const price = mids[ticker];
    if (!price) {
        throw new Error(`Ticker ${ticker} not found`);
    }

    // 5. Calculate order size
    const notional = margin * leverage; // en USDC
    const sz = (notional / price).toString();

    console.log("Order payload:", JSON.stringify({
    orders: [{
        a: 0,
        b: isBuy,
        s: sz,
        r: false,
        t: {
            "trigger": {
                "isMarket": true,
                "triggerPx": price.toString(),
                "tpsl": isBuy ? "tp" : "sl"
            }
        }
    }],
    grouping: "na"
    }, null, 2));

    // 6. Place market order
    const resp = await client.order({
        orders: [{
            a: 0,
            b: isBuy,
            s: sz,
            r: false,
            t: {
                "trigger": {
                    "isMarket": true,
                    "triggerPx": price.toString(),
                    "tpsl": isBuy ? "tp" : "sl"
                }
            }
        }],
        grouping: "na"
    });

    // 7. Save trade in DB
    await sql`
        INSERT INTO trades (
            user_id, side, ticker, leverage, margin, size, entry_price, status
        ) VALUES (
            ${user.id_user},
            ${isBuy ? "long" : "short"},
            ${ticker},
            ${leverage},
            ${margin},
            ${sz},
            ${price},
            'open'
        )
    `;

    return resp;
}