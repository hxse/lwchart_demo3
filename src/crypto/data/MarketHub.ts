import { integer, MAX_HISTORY_BARS, type DashboardOptions } from '../options';
import type { MarketIdentity, MarketSource } from './client';
import { MarketStream } from './MarketStream';
import { chartIndicators } from '../chartIndicators';
import { tqChartSymbol } from '../chartTqSeries';
import { indicatorKey, parseIndicator } from '../../indicators/parameters';
import type { IndicatorSpec } from '../../indicators/types';

export interface OrderDemand {
    identity: MarketIdentity;
    historyBars: number;
    atrPeriod: number;
    refreshSeconds: number;
}
interface DemandGroup {
    identity: MarketIdentity;
    historyBars: number;
    refreshSeconds: number;
    indicators: Map<string, IndicatorSpec>;
}
function streamKey(identity: MarketIdentity, historyBars: number) {
    return JSON.stringify([identity.source, identity.source === 'ccxt' ? [identity.exchange_name, identity.market, identity.is_live] : [],
        identity.symbol, identity.timeframe, historyBars]);
}

export class MarketHub {
    private streams = new Map<string, MarketStream>();
    private options: DashboardOptions | null = null;
    private orderDemand: OrderDemand | null = null;
    constructor(private source: MarketSource) {}
    configure(options: DashboardOptions | null) {
        this.options = options;
        return this.reconcile();
    }
    setOrderDemand(demand: OrderDemand | null): MarketStream | undefined {
        if (demand) {
            parseIndicator({ type: 'atr', period: demand.atrPeriod });
            integer(demand.historyBars, demand.atrPeriod, MAX_HISTORY_BARS, '下单 ATR 历史容量');
            integer(demand.refreshSeconds, 1, 3600, '下单行情刷新间隔');
        }
        this.orderDemand = demand;
        this.reconcile();
        return demand ? this.streams.get(streamKey(demand.identity, demand.historyBars)) : undefined;
    }
    private reconcile() {
        const options = this.options;
        const identities: MarketIdentity[] = options ? options.timeframes.map((timeframe, index) => options.source === 'ccxt'
            ? { source: 'ccxt', exchange_name: options.exchange_name, market: options.market, is_live: options.is_live, symbol: options.symbol, timeframe }
            : { source: 'tq', symbol: tqChartSymbol(options.symbol, options.chart_tq_series[String(index + 1)]), timeframe }) : [];
        const groups = new Map<string, DemandGroup>();
        identities.forEach((identity,index) => {
            const id = streamKey(identity, options!.history_bars);
            let group = groups.get(id);
            if (!group) {
                group = { identity, historyBars: options!.history_bars, refreshSeconds: options!.refresh_seconds, indicators: new Map() };
                groups.set(id, group);
            }
            for (const spec of chartIndicators(options!,index)) group.indicators.set(indicatorKey(spec),spec);
        });
        const demand = this.orderDemand;
        if (demand) {
            const id = streamKey(demand.identity, demand.historyBars);
            let group = groups.get(id);
            if (!group) {
                group = { identity: demand.identity, historyBars: demand.historyBars, refreshSeconds: demand.refreshSeconds, indicators: new Map() };
                groups.set(id, group);
            }
            // 同流采用图表刷新间隔；面板独占时恢复打开面板时的节拍。
            const spec: IndicatorSpec = { type: 'atr', period: demand.atrPeriod };
            group.indicators.set(indicatorKey(spec), spec);
        }
        for (const [id, stream] of this.streams) if (!groups.has(id)) { stream.dispose(); this.streams.delete(id); }
        for (const [id,group] of groups) {
            let stream = this.streams.get(id);
            const fresh = !stream;
            if (!stream) { stream = new MarketStream(group.identity, this.source, group.historyBars); this.streams.set(id, stream); }
            const specs = [...group.indicators].sort(([a],[b]) => a<b ? -1 : a>b ? 1 : 0).map(([,spec]) => spec);
            stream.configure(specs, group.refreshSeconds);
            if (fresh) void stream.poll();
        }
        return identities.map(identity => this.streams.get(streamKey(identity, options!.history_bars))!);
    }
    dispose() {
        for (const stream of this.streams.values()) stream.dispose();
        this.streams.clear(); this.options = null; this.orderDemand = null;
    }
}
