import { CandleStore, type DataChange } from './CandleStore';
import { validateBatch } from './ohlcv';
import type { MarketIdentity, MarketSource } from './client';
import { UPDATE_BARS } from '../options';
import type { IndicatorSpec } from '../../indicators/types';
import { IndicatorCalculationError } from '../../indicators/IndicatorStream';
import { indicatorKey } from '../../indicators/parameters';

export type StreamPhase = 'loading' | 'ready' | 'empty' | 'reloading' | 'error';
export interface StreamStatus { phase: StreamPhase; message: string; count: number; updatedAt: number | null }
export type StreamEvent = { kind: 'status' } | DataChange;
type Listener = (event: StreamEvent) => void;

/** 单身份只读最新窗口；断开时整批替换，不维护 since 游标或分页。 */
export class MarketStream {
    readonly store: CandleStore;
    status: StreamStatus = { phase: 'loading', message: '正在加载历史…', count: 0, updatedAt: null };
    private listeners = new Set<Listener>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private inFlight: Promise<void> | null = null;
    private controller: AbortController | null = null;
    private disposed = false;
    private refreshSeconds = 0;
    private reload = true;
    private calculationStopped = false;
    private failedIndicator: string | undefined;
    constructor(readonly identity: MarketIdentity, private source: MarketSource, readonly historyBars: number) {
        this.store = new CandleStore(historyBars);
    }
    subscribe(listener: Listener) {
        this.listeners.add(listener); listener(this.store.snapshot());
        return () => this.listeners.delete(listener);
    }
    private emit(event: StreamEvent) { for (const listener of this.listeners) listener(event); }
    private setStatus(phase: StreamPhase, message: string, success = false) {
        this.status = { phase, message, count: this.store.rows.length, updatedAt: success ? Date.now() : this.status.updatedAt };
        this.emit({ kind: 'status' });
    }
    private fail(error: unknown, configuring = false) {
        this.calculationStopped = configuring || error instanceof IndicatorCalculationError;
        this.failedIndicator = error instanceof IndicatorCalculationError ? error.indicator : undefined;
        // 配置初始化失败时取消旧请求，避免迟到响应按旧配置提交或清除错误。
        if (this.calculationStopped) this.controller?.abort();
        const message = error instanceof Error ? error.message : '行情更新失败';
        this.setStatus('error', `${message}${this.calculationStopped ? '；自动更新已暂停，请移除问题指标或刷新重试' : ''}`);
    }
    configure(indicators: IndicatorSpec[], refreshSeconds: number) {
        try {
            const changed = this.store.setIndicators(indicators);
            const recovering = this.calculationStopped;
            this.calculationStopped = !!this.failedIndicator && indicators.some(spec => indicatorKey(spec) === this.failedIndicator);
            if (!this.calculationStopped) this.failedIndicator = undefined;
            if (changed) this.emit(this.store.snapshot());
            if ((changed || recovering) && this.store.rows.length && !this.calculationStopped) this.setStatus('ready', '');
        } catch (error) { this.fail(error, true); }
        if (this.refreshSeconds !== refreshSeconds || !this.timer) {
            if (this.timer) clearInterval(this.timer);
            this.refreshSeconds = refreshSeconds;
            this.timer = setInterval(() => { void this.poll(); }, refreshSeconds * 1000);
        }
    }
    poll(): Promise<void> {
        if (this.disposed || this.calculationStopped) return Promise.resolve();
        if (this.inFlight) return this.inFlight;
        this.controller = new AbortController();
        const signal = this.controller.signal;
        this.inFlight = this.fetchCycle(signal).catch(error => {
            if (!this.disposed && !signal.aborted) this.fail(error);
        }).finally(() => { this.inFlight = null; this.controller = null; });
        return this.inFlight;
    }
    private async replaceWindow(signal: AbortSignal) {
        const response = validateBatch(await this.source.latest(this.identity, this.historyBars, signal), this.historyBars);
        if (this.disposed || signal.aborted) return;
        if (response.rows.length && this.store.tail !== undefined && response.rows.at(-1)![0] < this.store.tail) {
            throw new Error('完整窗口的最新时间早于已有行情，保留当前窗口');
        }
        this.emit(this.store.initialize(response.rows));
        this.reload = response.rows.length === 0;
        this.setStatus(response.rows.length ? 'ready' : 'empty', response.rows.length ? '' : '暂无历史数据，等待下一次更新', true);
    }
    private async fetchCycle(signal: AbortSignal) {
        if (this.reload) { await this.replaceWindow(signal); return; }
        const response = validateBatch(await this.source.latest(this.identity, UPDATE_BARS, signal), UPDATE_BARS);
        if (this.disposed || signal.aborted) return;
        const change = this.store.merge(response.rows);
        if (change.kind !== 'reload') {
            if (change.kind === 'replace' || change.rows.length || change.indicators.size) this.emit(change);
            this.setStatus('ready', '', true);
            return;
        }
        this.reload = true;
        console.warn('行情校验异常，重新获取完整窗口', { ...change, ...this.identity });
        this.setStatus('reloading', '行情窗口断开，正在重新加载…');
        await this.replaceWindow(signal);
    }
    dispose() {
        this.disposed = true; this.controller?.abort();
        if (this.timer) clearInterval(this.timer);
        this.timer = null; this.listeners.clear();
    }
}
