import { BackendWriteError, GatewayError, type BackendClient } from './backend';
import { identityQuery } from '../../src/crypto/trading/validation';
import { assertTradeScope } from '../../src/crypto/trading/rules';
import { parseMarketInfo, parsePositionEvidence, parseTradingFee } from '../../src/crypto/trading/wire';
import { TradingError, type TradeData, type TradeIdentity, type Warning } from '../../src/crypto/trading/types';

export type OrderBackend = Pick<BackendClient, 'read' | 'write'>;
export function safeIssue(error: unknown): Warning {
    return error instanceof GatewayError || error instanceof TradingError ? { code: error.code, message: error.message }
        : { code: 'BACKEND_INVALID_RESPONSE', message: '后端订单资料无法确认，请手动核对' };
}
/** 每次执行独享有限时间预算，关闭预览不能取消已准入的执行。 */
export class OrderSession {
    private readonly started = performance.now();
    constructor(readonly backend: OrderBackend, readonly identity: TradeIdentity, private timeoutSeconds: number, private signal?: AbortSignal) {}
    private requestSignal() {
        const remaining = 60000 - (performance.now() - this.started);
        if (remaining <= 0) throw new GatewayError(504, 'BACKEND_TIMEOUT', '本轮查询／执行时间已耗尽');
        const timeout = AbortSignal.timeout(Math.max(1, Math.floor(Math.min(remaining, 8000, this.timeoutSeconds * 1000))));
        return this.signal ? AbortSignal.any([timeout, this.signal]) : timeout;
    }
    async read(method: string, extra: Record<string, string> = {}) {
        const params = identityQuery(this.identity);
        if (method === 'fetch_positions') { params.delete('symbol'); params.set('symbols', this.identity.symbol); }
        for (const [key, value] of Object.entries(extra)) params.set(key, value);
        return this.backend.read(`/ccxt/${method}`, params, this.requestSignal());
    }
    async write(method: string, body: Record<string, unknown>) {
        let signal: AbortSignal;
        try { signal = this.requestSignal(); }
        catch (error) { throw new BackendWriteError(error as GatewayError, 'not_sent'); }
        return this.backend.write(`/ccxt/${method}`, body, signal);
    }
}
export async function readTradeData(session: OrderSession): Promise<TradeData> {
    const identity = session.identity;
    assertTradeScope(identity);
    const replies = await Promise.allSettled([
        session.read('fetch_market_info').then(value => parseMarketInfo(value, identity.symbol)),
        session.read('fetch_trading_fee').then(value => parseTradingFee(value, identity)),
        session.read('fetch_positions').then(value => parsePositionEvidence(value, identity.symbol)),
    ] as const);
    const [market, fee, positions] = replies;
    if (market.status === 'rejected') throw market.reason;
    if (fee.status === 'rejected') throw fee.reason;
    return { market_info: market.value, trading_fee: fee.value,
        position_evidence: positions.status === 'fulfilled' ? positions.value : null,
        warnings: positions.status === 'fulfilled' ? [] : [{ code: 'POSITION_LOOKUP_FAILED', message: `账户模式查询失败（${safeIssue(positions.reason).code}），本次模式未确认` }],
        observed_at: Date.now() };
}
