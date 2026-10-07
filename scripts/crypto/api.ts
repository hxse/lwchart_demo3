import { normalizeOptions, parseInteger, MAX_HISTORY_BARS } from '../../src/crypto/options';
import { validateOhlcv } from '../../src/crypto/data/ohlcv';
import type { CryptoConfig } from './config';
import { BackendClient, GatewayError } from './backend';

function validateQuery(params: URLSearchParams, since: boolean) {
    const allowed = ['exchange_name','market','is_live','symbol','timeframe','variant','enable_cache','limit', ...(since ? ['since'] : [])];
    for (const key of params.keys()) {
        if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error('未知或重复的行情参数');
    }
    const live = params.get('is_live');
    if (live !== 'true' && live !== 'false') throw new Error('行情环境必须是 true 或 false');
    const limit = parseInteger(params.get('limit') || '', 1, MAX_HISTORY_BARS, '行情数量');
    normalizeOptions({
        exchange_name: params.get('exchange_name'), market: params.get('market'), is_live: live === 'true',
        symbol: params.get('symbol'), layout: '1x1', timeframes: [params.get('timeframe')], indicators: [], refresh_seconds: 5, history_bars: limit, theme: 'dark',
    });
    if (params.has('variant') && params.get('variant') !== 'default') throw new Error('只支持 default 价格序列');
    if (params.has('enable_cache') && params.get('enable_cache') !== 'true') throw new Error('本入口启用后端缓存');
    if (since) parseInteger(params.get('since') || '', 1e12, 9999999999999, '起始毫秒时间');
    return limit;
}
export function createApi(config: CryptoConfig, backend: Pick<BackendClient, 'read'> = new BackendClient(config.backend)) {
    return async (request: Request): Promise<Response | null> => {
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/api/')) return null;
        const started = performance.now();
        let upstream = 0;
        const json = (body: unknown, status = 200) => {
            const response = Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
            const local = Math.max(0, performance.now() - started - upstream);
            response.headers.set('Server-Timing', `upstream;dur=${upstream.toFixed(2)}, local;dur=${local.toFixed(2)}`);
            return response;
        };
        try {
            if (request.method !== 'GET') throw new GatewayError(405, 'METHOD_NOT_ALLOWED', '本看盘入口只读取行情');
            if (url.pathname === '/api/crypto/runtime') {
                if (url.search) throw new GatewayError(400, 'INVALID_QUERY', '运行配置接口不接受查询参数');
                return json(config.runtime);
            }
            const paths = ['/api/ccxt/fetch_ohlcv/latest-limit', '/api/ccxt/fetch_ohlcv/since-limit'];
            if (!paths.includes(url.pathname)) throw new GatewayError(404, 'NOT_FOUND', '接口不存在');
            let limit: number;
            try { limit = validateQuery(url.searchParams, url.pathname.endsWith('since-limit')); }
            catch (error) { throw new GatewayError(400, 'INVALID_QUERY', (error as Error).message); }
            const upstreamStarted = performance.now();
            let body: unknown;
            try { body = await backend.read(url.pathname.slice(4), url.searchParams, request.signal); }
            finally { upstream = performance.now() - upstreamStarted; }
            try { return json(validateOhlcv(body, limit)); }
            catch { throw new GatewayError(502, 'BACKEND_INVALID_RESPONSE', '后端行情响应格式无效'); }
        } catch (error) {
            const e = error instanceof GatewayError ? error : new GatewayError(502, 'BACKEND_ERROR', '后端读取失败');
            return json({ error: { code: e.code, message: e.message } }, e.status);
        }
    };
}
