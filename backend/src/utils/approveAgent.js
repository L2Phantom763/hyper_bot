import { exchClient } from "./client.js";

export async function approveAgent(wallet, agentAddress) {
    const client = await exchClient(wallet);
    const result = await client.approveAgent({agentAddress: agentAddress, hyperliquidChain: "Testnet"});
    return result;
}