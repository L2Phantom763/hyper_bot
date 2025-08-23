import { ethers } from "ethers";
import * as hl from "@nktkas/hyperliquid";

export async function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return wallet;
}





