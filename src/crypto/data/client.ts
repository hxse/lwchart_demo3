import { normalizeOptions, normalizeBudget, type DashboardOptions, type RuntimeOptions, type Timeframe } from '../options';
import { validateOhlcv, type OhlcvResult } from './ohlcv';

export type MarketIdentity = Pick<DashboardOptions, 'exchange_name' | 'market' | 'is_live' | 'symbol'> & { timeframe: Timeframe };
export interface OhlcvSource {
    history(identity: MarketIdentity, limit: number, signal: AbortSignal): Promise<OhlcvResult>;
    increment(identity: MarketIdentity, since: number, limit: number, signal: AbortSignal): Promise<OhlcvResult>;
}
export class CryptoClient implements OhlcvSource {
    constructor(private fetcher: typeof fetch = fetch.bind(globalThis)) {}
    private async json(path: string, signal?: AbortSignal): Promise<any> {
        const response = await this.fetcher(path, { signal, cache: 'no-store' });
        let data: any;
        try { data = await response.json(); } catch { throw new Error('看盘服务响应格式错误'); }
        if (!response.ok) throw new Error(data?.error?.message || `看盘服务请求失败（${response.status}）`);
        return data;
    }
    async runtime(signal?: AbortSignal): Promise<RuntimeOptions> {
        const value = await this.json('/api/crypto/runtime', signal);
        return { defaults: normalizeOptions(value.defaults), data: normalizeBudget(value.data) };
    }
    private async get(identity: MarketIdentity, method: string, limit: number, signal: AbortSignal, since?: number) {
        const params = new URLSearchParams({ ...identity, is_live: String(identity.is_live), variant: 'default', enable_cache: 'true', limit: String(limit) });
        if (since !== undefined) params.set('since', String(since));
        return validateOhlcv(await this.json(`/api/ccxt/fetch_ohlcv/${method}?${params}`, signal), limit);
    }
    history(identity: MarketIdentity, limit: number, signal: AbortSignal) {
        return identity.timeframe === '1w'
            ? this.get(identity, 'since-limit', limit, signal, 1e12)
            : this.get(identity, 'latest-limit', limit, signal);
    }
    increment(identity: MarketIdentity, since: number, limit: number, signal: AbortSignal) {
        return this.get(identity, 'since-limit', limit, signal, since);
    }
}
