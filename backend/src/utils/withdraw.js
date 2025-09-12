import { exchClient } from "./client.js";

export async function coreWithdraw(wallet, addressToWithdraw, amount) {
    const client = await exchClient(wallet)
    const result = await client.usdSend({ destination: addressToWithdraw, amount: amount, hyperliquidChain: "Testnet" });
    return result;
}

export async function arbitrumWithdraw(wallet, addressToWithdraw, amount) {
    const client = await exchClient(wallet)
    const result = await client.withdraw3({ destination: addressToWithdraw, amount: amount, hyperliquidChain: "Testnet" });
    return result;
}