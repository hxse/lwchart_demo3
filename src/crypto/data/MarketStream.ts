import { CandleStore, type DataChange } from './CandleStore';
import { validateOhlcv } from './ohlcv';
import type { MarketIdentity, OhlcvSource } from './client';
import type { DataBudget, IndicatorSpec } from '../options';

export type StreamPhase = 'loading' | 'ready' | 'empty' | 'catching-up' | 'error';
export interface StreamStatus { phase: StreamPhase; message: string; count: number; updatedAt: number | null }
export type StreamEvent = { kind: 'status' } | DataChange;
type Listener = (event: StreamEvent) => void;

/** 每个行情身份独立单飞；相同周期槽位共享数据而保留独立图表。 */
export class MarketStream {
    readonly store: CandleStore;
    status: StreamStatus = { phase: 'loading', message: '正在加载历史…', count: 0, updatedAt: null };
    private listeners = new Set<Listener>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private inFlight: Promise<void> | null = null;
    private controller: AbortController | null = null;
    private disposed = false;
    private refreshSeconds = 0;

    constructor(readonly identity: MarketIdentity, private source: OhlcvSource, private budget: DataBudget, readonly historyBars: number) {
        this.store = new CandleStore(historyBars);
    }
    subscribe(listener: Listener) {
        this.listeners.add(listener);
        listener(this.store.snapshot());
        return () => this.listeners.delete(listener);
    }
    private emit(event: StreamEvent) { for (const listener of this.listeners) listener(event); }
    private setStatus(phase: StreamPhase, message: string, success = false) {
        this.status = { phase, message, count: this.store.rows.length, updatedAt: success ? Date.now() : this.status.updatedAt };
        this.emit({ kind: 'status' });
    }
    configure(indicators: IndicatorSpec[], refreshSeconds: number) {
        const old = [...this.store.emas.keys()].sort((a,b) => a-b).join(',');
        this.store.setIndicators(indicators);
        const changed = old !== [...this.store.emas.keys()].sort((a,b) => a-b).join(',');
        if (changed) this.emit(this.store.snapshot());
        if (this.refreshSeconds !== refreshSeconds || !this.timer) {
            if (this.timer) clearInterval(this.timer);
            this.refreshSeconds = refreshSeconds;
            this.timer = setInterval(() => { void this.poll(); }, refreshSeconds * 1000);
        }
    }
    poll(): Promise<void> {
        if (this.disposed) return Promise.resolve();
        if (this.inFlight) return this.inFlight;
        this.controller = new AbortController();
        const signal = this.controller.signal;
        this.inFlight = this.fetchCycle(signal).catch(error => {
            if (!this.disposed && !signal.aborted) this.setStatus('error', (error as Error).message || '行情更新失败');
        }).finally(() => { this.inFlight = null; this.controller = null; });
        return this.inFlight;
    }
    private async fetchCycle(signal: AbortSignal) {
        if (this.store.tail === undefined) {
            const response = validateOhlcv(await this.source.history(this.identity, this.historyBars, signal), this.historyBars);
            if (this.disposed || signal.aborted) return;
            this.emit(this.store.initialize(response.rows));
            this.setStatus(response.rows.length ? 'ready' : 'empty', response.rows.length ? '' : '暂无历史数据，等待下一次更新', response.rows.length > 0);
            return;
        }
        for (let page = 0; page < this.budget.max_catchup_pages; page++) {
            const since = this.store.tail!;
            const response = validateOhlcv(await this.source.increment(this.identity, since, this.budget.incremental_bars, signal), this.budget.incremental_bars);
            if (this.disposed || signal.aborted) return;
            if (!response.rows.length) throw new Error('增量暂未返回数据，保留已有行情');
            if (response.rows[0]![0] !== since) throw new Error('增量缺少末根重叠，等待数据恢复');
            const last = response.rows.at(-1)![0];
            if (response.rows.length === this.budget.incremental_bars && last <= since) throw new Error('补齐数据没有进展');
            this.emit(this.store.merge(response.rows));
            if (response.rows.length < this.budget.incremental_bars) {
                this.setStatus('ready', '', true);
                return;
            }
            this.setStatus('catching-up', '正在补齐断网期间行情…', true);
        }
        this.setStatus('catching-up', '正在补齐，下一轮继续…', true);
    }
    dispose() {
        this.disposed = true;
        this.controller?.abort();
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.listeners.clear();
    }
}
