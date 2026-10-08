import { normalizeRuntime, type CcxtDefaults, type RuntimeOptions, type Timeframe } from '../options';
import { validateBatch, type CandleBatch } from './ohlcv';

export type MarketIdentity = ({ source: 'ccxt' } & CcxtDefaults | { source: 'tq'; symbol: string }) & { timeframe: Timeframe };
export interface MarketSource { latest(identity: MarketIdentity, limit: number, signal: AbortSignal): Promise<CandleBatch> }
export function timeframeSeconds(timeframe: Timeframe): number {
    const units: Record<string, number> = { m: 60, h: 3600, d: 86400, w: 604800 };
    return Number(timeframe.slice(0, -1)) * units[timeframe.slice(-1)]!;
}
export class MarketClient implements MarketSource {
    constructor(private fetcher: typeof fetch = fetch.bind(globalThis)) {}
    private async json(path: string, signal?: AbortSignal): Promise<any> {
        const response = await this.fetcher(path, { signal, cache: 'no-store' });
        let data: any;
        try { data = await response.json(); } catch { throw new Error('看盘服务响应格式错误'); }
        if (!response.ok) throw new Error(data?.error?.message || `看盘服务请求失败（${response.status}）`);
        return data;
    }
    async runtime(signal?: AbortSignal): Promise<RuntimeOptions> {
        return normalizeRuntime(await this.json('/api/crypto/runtime', signal));
    }
    async latest(identity: MarketIdentity, limit: number, signal: AbortSignal): Promise<CandleBatch> {
        let path: string;
        let params: URLSearchParams;
        if (identity.source === 'ccxt') {
            path = '/api/ccxt/fetch_ohlcv/latest-limit';
            const { exchange_name, market, is_live, symbol, timeframe } = identity;
            params = new URLSearchParams({ exchange_name, market, is_live: String(is_live), symbol, timeframe,
                variant: 'default', enable_cache: 'true', limit: String(limit) });
        } else {
            path = '/api/tq/fetch_ohlcv';
            params = new URLSearchParams({ symbol: identity.symbol, duration_seconds: String(timeframeSeconds(identity.timeframe)),
                data_length: String(limit), enable_cache: 'true' });
        }
        return validateBatch(await this.json(`${path}?${params}`, signal), limit);
    }
}
