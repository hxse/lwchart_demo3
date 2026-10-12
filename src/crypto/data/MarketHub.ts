import type { DashboardOptions } from '../options';
import type { MarketIdentity, MarketSource } from './client';
import { MarketStream } from './MarketStream';
import { chartIndicators } from '../chartIndicators';
import { indicatorKey } from '../../indicators/parameters';
import type { IndicatorSpec } from '../../indicators/types';

export class MarketHub {
    private streams = new Map<string, MarketStream>();
    constructor(private source: MarketSource) {}
    configure(options: DashboardOptions) {
        const identities: MarketIdentity[] = options.timeframes.map(timeframe => options.source === 'ccxt'
            ? { source: 'ccxt', exchange_name: options.exchange_name, market: options.market, is_live: options.is_live, symbol: options.symbol, timeframe }
            : { source: 'tq', symbol: options.symbol, timeframe });
        const key = (identity: MarketIdentity) => JSON.stringify([identity, options.history_bars]);
        const groups = new Map<string,{identity:MarketIdentity;indicators:Map<string,IndicatorSpec>}>();
        identities.forEach((identity,index) => {
            const id = key(identity);
            let group = groups.get(id);
            if (!group) { group={identity,indicators:new Map()}; groups.set(id,group); }
            for (const spec of chartIndicators(options,index)) group.indicators.set(indicatorKey(spec),spec);
        });
        for (const [id, stream] of this.streams) if (!groups.has(id)) { stream.dispose(); this.streams.delete(id); }
        for (const [id,group] of groups) {
            let stream = this.streams.get(id);
            const fresh = !stream;
            if (!stream) { stream = new MarketStream(group.identity, this.source, options.history_bars); this.streams.set(id, stream); }
            const specs = [...group.indicators].sort(([a],[b]) => a<b ? -1 : a>b ? 1 : 0).map(([,spec]) => spec);
            stream.configure(specs, options.refresh_seconds);
            if (fresh) void stream.poll();
        }
        return identities.map(identity => this.streams.get(key(identity))!);
    }
    dispose() { for (const stream of this.streams.values()) stream.dispose(); this.streams.clear(); }
}
