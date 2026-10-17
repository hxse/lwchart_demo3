import { normalizeCcxt, type DashboardSettings, type Timeframe } from '../options';
import { timeframeSeconds } from '../data/client';
import type { MarketHub } from '../data/MarketHub';
import type { MarketStream } from '../data/MarketStream';
import { OrderClient, type OrderReader } from './client';
import { calculatePreview } from './calculate';
import { Decimal } from './decimal';
import { assertTradeScope } from './rules';
import { parseTradeParameters } from './validation';
import type { AtrSnapshot, Preview, Quote, Side, TradeData, TradeIdentity, TradeParameters, TradeRequest } from './types';

export interface OrderDraft {
    symbol: string; timeframe: Timeframe; atr_period: string; risk_amount: string; atr_multiplier: string;
    risk_tolerance: string; atr_tolerance: string; take_profit_multiplier: string;
}
export interface DirectionPreview { preview: Preview | null; error: string }
export interface PanelState {
    identity: TradeIdentity; parameters: TradeParameters; quote: Quote | null; atr: AtrSnapshot | null;
    data: TradeData | null; loading: boolean; error: string; directions: Record<Side, DirectionPreview>;
    quoteAgeSeconds: number | null; refreshing: boolean; refreshCooldownSeconds: number;
}
const REFRESH_COOLDOWN_MS = 5000;
export function initialOrderDraft(settings: DashboardSettings): OrderDraft {
    const timeframe = settings.timeframes.reduce((small, value) => timeframeSeconds(value) < timeframeSeconds(small) ? value : small);
    return { symbol: settings[settings.source].symbol, timeframe, atr_period: '14', risk_amount: '1', atr_multiplier: '2',
        risk_tolerance: '5', atr_tolerance: '5', take_profit_multiplier: '2' };
}
export function draftParameters(draft: OrderDraft) {
    const { symbol: _symbol, ...values } = draft;
    return parseTradeParameters({ ...values, atr_period: Number(draft.atr_period),
        risk_tolerance: Decimal.parse(draft.risk_tolerance).div(new Decimal(100n)).toString(),
        atr_tolerance: Decimal.parse(draft.atr_tolerance).div(new Decimal(100n)).toString() });
}
export class OrderPanelState {
    readonly initialDraft: OrderDraft;
    private identity: TradeIdentity;
    private parameters: TradeParameters;
    private data: TradeData | null = null;
    private quote: Quote | null = null;
    private quoteReceived: number | null = null;
    private stream?: MarketStream;
    private unsubscribe?: () => void;
    private timer?: ReturnType<typeof setInterval>;
    private abort = new AbortController();
    private generation = 0;
    private metadataPending: Promise<void> | null = null;
    private tickerPending: Promise<void> | null = null;
    private refreshing = false;
    private refreshAllowedAt = 0;
    private dataError = '';
    private quoteError = '';
    private listeners = new Set<(value: PanelState) => void>();
    private cacheKey = '';
    private cached?: PanelState['directions'];
    private dataVersion = 0;
    constructor(private settings: DashboardSettings, private hub: MarketHub, private client: OrderReader = new OrderClient(), draft = initialOrderDraft(settings)) {
        this.initialDraft = { ...draft };
        this.identity = { ...settings.ccxt };
        this.parameters = draftParameters(this.initialDraft);
    }
    subscribe(listener: (value: PanelState) => void) {
        this.listeners.add(listener); listener(this.snapshot());
        return () => { this.listeners.delete(listener); };
    }
    start() {
        try { assertTradeScope(this.identity); }
        catch (error) { this.dataError = (error as Error).message; this.emit(); return; }
        this.attachAtr(); this.restartReads();
    }
    apply(draft: OrderDraft) {
        const next = draftParameters(draft);
        const identity = normalizeCcxt({ ...this.identity, symbol: draft.symbol });
        const changedIdentity = JSON.stringify(identity) !== JSON.stringify(this.identity);
        const changedAtr = next.timeframe !== this.parameters.timeframe || next.atr_period !== this.parameters.atr_period;
        assertTradeScope(identity);
        this.parameters = next; this.identity = identity;
        if (changedIdentity || changedAtr) this.attachAtr();
        if (changedIdentity) this.restartReads();
        this.emit();
    }
    private attachAtr() {
        this.unsubscribe?.();
        this.stream = this.hub.setOrderDemand({ identity: { source: 'ccxt', ...this.identity, timeframe: this.parameters.timeframe },
            historyBars: Math.max(this.settings.history_bars, this.parameters.atr_period), atrPeriod: this.parameters.atr_period, refreshSeconds: this.settings.refresh_seconds });
        this.unsubscribe = this.stream!.subscribe(() => this.emit());
    }
    private restartReads() {
        this.abort.abort(); this.abort = new AbortController(); this.generation++;
        if (this.timer) clearInterval(this.timer);
        this.quote = null; this.quoteReceived = null; this.data = null; this.dataError = ''; this.quoteError = '';
        this.tickerPending = null; this.metadataPending = null; this.refreshing = false;
        void this.loadData(); void this.pollTicker();
        this.timer = setInterval(() => { this.emit(); void this.pollTicker(); }, 1000);
    }
    private emit() { const value = this.snapshot(); for (const listener of this.listeners) listener(value); }
    private loadData() {
        if (this.metadataPending) return this.metadataPending;
        const generation = this.generation;
        this.dataError = '';
        this.metadataPending = this.client.data(this.identity, this.abort.signal).then(value => {
            if (generation === this.generation && !this.abort.signal.aborted) { this.data = value; this.dataVersion++; }
        }).catch(error => {
            if (generation === this.generation && !this.abort.signal.aborted) { this.data = null; this.dataError = (error as Error).message; }
        }).finally(() => {
            if (generation === this.generation) { this.metadataPending = null; this.emit(); }
        });
        this.emit(); return this.metadataPending;
    }
    private pollTicker() {
        if (this.tickerPending) return this.tickerPending;
        const generation = this.generation;
        this.tickerPending = this.client.quote(this.identity, this.abort.signal).then(quote => {
            if (generation === this.generation && !this.abort.signal.aborted) { this.quote = quote; this.quoteReceived = performance.now(); this.quoteError = ''; }
        }).catch(error => {
            if (generation === this.generation && !this.abort.signal.aborted) { this.quote = null; this.quoteError = (error as Error).message; }
        }).finally(() => {
            if (generation === this.generation) { this.tickerPending = null; this.emit(); }
        });
        return this.tickerPending;
    }
    private atr(): AtrSnapshot | null {
        const stream = this.stream;
        if (!stream || stream.status.phase !== 'ready' || stream.status.updatedAt === null
            || Date.now() - stream.status.updatedAt > Math.max(10000, stream.refreshIntervalSeconds * 2000)) return null;
        const point = stream.store.indicators.get(`atr,${this.parameters.atr_period}`)?.outputs.get('value')?.at(-1);
        if (!point || point.state !== 'value' || !Number.isFinite(point.value) || point.value! <= 0) return null;
        return { value: String(point.value), bar_time: point.time, history_bars: stream.historyBars };
    }
    snapshot(): PanelState {
        const atr = this.atr(), now = performance.now();
        const quoteAge = this.quoteReceived === null ? null : Math.max(0, now - this.quoteReceived);
        const error = this.dataError || this.quoteError || (this.metadataPending ? '正在刷新交易资料…' : '')
            || (!this.data ? '正在读取市场规则与账户费率…' : !this.quote ? '正在读取最新报价…' : quoteAge !== null && quoteAge > 5000
                ? '报价已失效，等待新报价' : !atr ? this.stream?.status.phase === 'error' ? this.stream.status.message : 'ATR 尚未预热或行情已过期' : '');
        let directions: PanelState['directions'];
        if (error) directions = { buy: { preview: null, error }, sell: { preview: null, error } };
        else {
            const key = JSON.stringify([this.dataVersion, this.identity, this.parameters, atr!.value, this.quote!.ticker.bid, this.quote!.ticker.ask, this.quote!.ticker.last]);
            if (key !== this.cacheKey || !this.cached) {
                const calculate = (side: Side): DirectionPreview => {
                    try { return { preview: calculatePreview(this.data!, this.identity, this.parameters, atr!.value, this.quote!, side), error: '' }; }
                    catch (error) { return { preview: null, error: (error as Error).message }; }
                };
                this.cached = { buy: calculate('buy'), sell: calculate('sell') }; this.cacheKey = key;
            }
            directions = this.cached;
        }
        return { identity: this.identity, parameters: this.parameters, data: this.data, quote: this.quote, atr,
            loading: !!this.metadataPending, error, directions, quoteAgeSeconds: quoteAge === null ? null : Math.floor(quoteAge / 1000),
            refreshing: this.refreshing, refreshCooldownSeconds: Math.max(0, Math.ceil((this.refreshAllowedAt - now) / 1000)) };
    }
    prepare(side: Side): Omit<TradeRequest, 'request_id'> {
        const value = this.snapshot(), preview = value.directions[side].preview;
        if (!preview || !value.atr || !value.quote) throw new Error(value.directions[side].error || '下单资料未就绪');
        const { amount, stop_price, take_profit_price, estimated_risk } = preview.plan;
        return { ...this.identity, mode: 'fixed-risk-atr', order_type: 'market', side, parameters: { ...this.parameters },
            atr_snapshot: { ...value.atr }, quote_snapshot: { ...value.quote, ticker: { ...value.quote.ticker } },
            expected: { amount, stop_price, take_profit_price, estimated_risk } };
    }
    async refresh() {
        if (this.abort.signal.aborted || this.metadataPending || this.refreshing || performance.now() < this.refreshAllowedAt) return;
        const generation = this.generation;
        this.refreshing = true; this.refreshAllowedAt = performance.now() + REFRESH_COOLDOWN_MS;
        this.emit();
        try { await Promise.all([this.loadData(), this.pollTicker(), this.stream?.refresh()]); }
        finally { if (generation === this.generation) { this.refreshing = false; this.emit(); } }
    }
    dispose() {
        this.generation++; this.abort.abort();
        if (this.timer) clearInterval(this.timer);
        this.unsubscribe?.(); this.hub.setOrderDemand(null); this.listeners.clear();
    }
}
