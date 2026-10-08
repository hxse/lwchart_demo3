import type { DashboardOptions } from '../options';
import type { MarketIdentity, MarketSource } from './client';
import { MarketStream } from './MarketStream';

export class MarketHub {
    private streams = new Map<string, MarketStream>();
    constructor(private source: MarketSource) {}
    configure(options: DashboardOptions) {
        const identities: MarketIdentity[] = options.timeframes.map(timeframe => options.source === 'ccxt'
            ? { source: 'ccxt', exchange_name: options.exchange_name, market: options.market, is_live: options.is_live, symbol: options.symbol, timeframe }
            : { source: 'tq', symbol: options.symbol, timeframe });
        const key = (identity: MarketIdentity) => JSON.stringify([identity, options.history_bars]);
        const wanted = new Set(identities.map(key));
        for (const [id, stream] of this.streams) if (!wanted.has(id)) { stream.dispose(); this.streams.delete(id); }
        return identities.map(identity => {
            const id = key(identity);
            let stream = this.streams.get(id);
            const fresh = !stream;
            if (!stream) { stream = new MarketStream(identity, this.source, options.history_bars); this.streams.set(id, stream); }
            stream.configure(options.indicators, options.refresh_seconds);
            if (fresh) void stream.poll();
            return stream;
        });
    }
    dispose() { for (const stream of this.streams.values()) stream.dispose(); this.streams.clear(); }
}
