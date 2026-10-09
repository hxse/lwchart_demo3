import { normalizeOptions, normalizeSources, normalizeSettings, DASHBOARD_KEYS, type CcxtOptions, type RuntimeOptions } from '../../src/crypto/options';
import type { OhlcvRow, CandleBatch } from '../../src/crypto/data/ohlcv';
import type { MarketIdentity } from '../../src/crypto/data/client';

export const defaults = normalizeOptions({
    source: 'ccxt', exchange_name: 'binance', market: 'future', is_live: true, symbol: 'BTC/USDT:USDT',
    layout: '2x2', timeframes: ['30m', '4h', '1d', '1w'], indicators: ['ema,14', 'ema,50', 'ema,100'],
    refresh_seconds: 5, history_bars: 1000, theme: 'dark', timezone: 'local',
}) as CcxtOptions;
export const sources = normalizeSources({ ccxt: { exchange_name: defaults.exchange_name, market: defaults.market,
    is_live: defaults.is_live, symbol: defaults.symbol }, tq: { symbol: 'KQ.m@SHFE.rb' } });
export const runtime: RuntimeOptions = { defaults: normalizeSettings({ ...Object.fromEntries(DASHBOARD_KEYS.map(key => [key, defaults[key]])), ...sources }) };
export const identity: MarketIdentity = { source: 'ccxt', ...sources.ccxt, timeframe: '30m' };
export const START = 1718000000000;
export function candle(index: number, close = 100 + index, step = 1800000): OhlcvRow {
    return [START + index * step, close - 1, close + 2, close - 2, close, 12.5];
}
export function result(rows: OhlcvRow[]): CandleBatch { return { rows }; }
export function ccxtResult(rows: OhlcvRow[]) { return { rows, last_bar_completion_confirmed: rows.length ? false : null }; }
export function tqResult(rows: OhlcvRow[]) {
    return rows.map(([time, open, high, low, close, volume]) => ({ datetime: BigInt(time) * 1000000n, open, high, low, close, volume }));
}
export function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
export function asFetch(fn: (input: string | URL | Request, init?: RequestInit) => Promise<Response>): typeof fetch {
    return fn as typeof fetch;
}
