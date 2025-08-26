import * as hl from '@nktkas/hyperliquid';

export const infoClient = new hl.InfoClient({
    transport: new hl.HttpTransport({ isTestnet: true }),
});

export async function exchClient(wallet) {
    return new hl.ExchangeClient({
        wallet: wallet, // `viem`, `ethers`, or private key directly
        transport: new hl.HttpTransport({ isTestnet: true }),
        isTestnet: true, // or `WebSocketTransport`
    });
} 
