import { infoClient } from "./client.js";
import { parsePerpBalances } from "../services/helper.js";

export async function getBalance(userAddress) {
  const clearinghouseState = await infoClient.clearinghouseState({
    user: userAddress,
  });
  return clearinghouseState.marginSummary.accountValue;
}

export async function getPerpBalances(userAddress) {
  const st = await infoClient.clearinghouseState({
    user: userAddress,
    dex: "",
  });
  return parsePerpBalances(st);
}

export async function hasSufficientPerpMargin(
  userAddress,
  requiredMargin,
  buffer = 1
) {
  const { withdrawable } = await getPerpBalances(userAddress);
  return withdrawable >= requiredMargin + buffer;
}
