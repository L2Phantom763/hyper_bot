import { exchClient } from "./client.js";

export async function approveBuilderFee(wallet) {
    const builder = "0x977f27D7E026E9ACe04B406160072762Fe956971"
    const client = await exchClient(wallet);
    const result = await client.approveBuilderFee({maxFeeRate: "0.1%", hyperliquidChain: "Testnet", builder: builder});
    return result;
}