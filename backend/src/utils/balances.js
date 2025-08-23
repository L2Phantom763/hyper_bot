import { infoClient } from './client.js';

export async function getBalance(userAddress) {
    const clearinghouseState = await infoClient.clearinghouseState({ user: userAddress });
    return clearinghouseState.marginSummary.accountValue;
}

