import { normalizeOptions, type DashboardOptions, type DataBudget } from '../../src/crypto/options';
import type { OhlcvRow, OhlcvResult } from '../../src/crypto/data/ohlcv';
import type { MarketIdentity } from '../../src/crypto/data/client';

export const defaults: DashboardOptions = normalizeOptions({
    exchange_name: 'binance', market: 'future', is_live: true, symbol: 'BTC/USDT:USDT',
    layout: '2x2', timeframes: ['30m', '4h', '1d', '1w'],
    indicators: ['ema,14', 'ema,50', 'ema,100'], refresh_seconds: 5, history_bars: 1500,
});
export const budget: DataBudget = { incremental_bars: 10, max_catchup_pages: 20 };
export const identity: MarketIdentity = {
    exchange_name: 'binance', market: 'future', is_live: true, symbol: defaults.symbol, timeframe: '30m',
};
export const START = 1718000000000;
export function candle(index: number, close = 100 + index, step = 1800000): OhlcvRow {
    return [START + index * step, close - 1, close + 2, close - 2, close, 12.5];
}
export function result(rows: OhlcvRow[]): OhlcvResult {
    return { rows, last_bar_completion_confirmed: rows.length ? false : null };
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
