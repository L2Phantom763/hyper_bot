import * as hl from '@nktkas/hyperliquid';

export const infoClient = new hl.InfoClient({
    transport: new hl.HttpTransport(),
});