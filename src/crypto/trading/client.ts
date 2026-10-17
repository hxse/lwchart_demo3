import { identityQuery } from './validation';
import type { CheckRequest, CheckResult, ExecutionResult, PositionSnapshot, Quote, TradeData, TradeIdentity, TradeRequest } from './types';

export class OrderHttpError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}
export interface OrderReader {
    data(identity: TradeIdentity, signal: AbortSignal): Promise<TradeData>;
    quote(identity: TradeIdentity, signal: AbortSignal): Promise<Quote>;
}
export class OrderClient implements OrderReader {
    constructor(private fetcher: typeof fetch = fetch.bind(globalThis)) {}
    private async request<T>(path: string, init: RequestInit): Promise<T> {
        const response = await this.fetcher(path, { ...init, cache: 'no-store' });
        let body;
        try { body = await response.json(); } catch { throw new OrderHttpError('交易服务响应无法解析，请查询结果核对', 0, 'RESPONSE_UNKNOWN'); }
        if (!response.ok) {
            if (!body?.error?.code || typeof body.error.message !== 'string') throw new OrderHttpError('交易服务响应无法确认，请查询结果核对', 0, 'RESPONSE_UNKNOWN');
            throw new OrderHttpError(body.error.message, response.status, body.error.code);
        }
        return body as T;
    }
    data(identity: TradeIdentity, signal: AbortSignal) {
        return this.request<TradeData>(`/api/ccxt/fetch_market_info?${identityQuery(identity)}`, { signal });
    }
    quote(identity: TradeIdentity, signal: AbortSignal) {
        return this.request<Quote>(`/api/ccxt/fetch_ticker?${identityQuery(identity)}`, { signal });
    }
    positions(identity: TradeIdentity, signal: AbortSignal) {
        return this.request<PositionSnapshot>(`/api/ccxt/fetch_positions?${identityQuery(identity)}`,
            { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    }
    execute(input: TradeRequest) {
        return this.request<ExecutionResult>('/api/ccxt/manual-order', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input), signal: AbortSignal.timeout(65000) });
    }
    check(input: CheckRequest) {
        return this.request<CheckResult>('/api/ccxt/manual-order/check', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input), signal: AbortSignal.timeout(65000) });
    }
}
