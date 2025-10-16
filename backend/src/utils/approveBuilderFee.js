import { exchClient, infoClient } from "./client.js";

const BUILDER_ADDRESS = "0x977f27D7E026E9ACe04B406160072762Fe956971";

/**
 * Check if builder fee approval is sufficient
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<number>} - Maximum fee approved in tenths of a basis point (1 = 0.001%)
 */
export async function checkBuilderFeeApproval(userAddress) {
    try {
        const result = await infoClient.maxBuilderFee({
            user: userAddress,
            builder: BUILDER_ADDRESS
        });
        return result;
    } catch (error) {
        console.error("Error checking builder fee approval:", error);
        throw error;
    }
}

/**
 * Approve builder fee if not already approved
 * @param {object} wallet - Ethers wallet object
 * @returns {Promise<object>} - Approval result
 */
export async function approveBuilderFee(wallet) {
    const client = await exchClient(wallet);
    const result = await client.approveBuilderFee({
        maxFeeRate: "0.1%", 
        hyperliquidChain: "Testnet", 
        builder: BUILDER_ADDRESS
    });
    return result;
}