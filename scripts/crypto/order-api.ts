import { GatewayError } from './backend';
import { OrderSession, readTradeData, type OrderBackend } from './order-data';
import { executeOrder } from './order-execution';
import { checkOrders, readPositions } from './order-query';
import { cleanupOrders } from './order-cleanup';
import { parseCheckRequest, parseCleanupRequest, parseTradeQuery, parseTradeRequest } from '../../src/crypto/trading/validation';
import { parseQuote } from '../../src/crypto/trading/wire';
import { assertTradeScope } from '../../src/crypto/trading/rules';

export const orderWritePaths = ['/api/ccxt/manual-order', '/api/ccxt/manual-order/check', '/api/ccxt/manual-order/cleanup'];
export const orderPaths = ['/api/ccxt/fetch_market_info', '/api/ccxt/fetch_ticker', '/api/ccxt/fetch_positions', ...orderWritePaths];
async function readBody(request: Request): Promise<unknown> {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin) throw new GatewayError(403, 'ORIGIN_NOT_ALLOWED', '交易请求必须来自同源页面');
    if (request.headers.get('Content-Type')?.split(';')[0]!.trim().toLowerCase() !== 'application/json') throw new GatewayError(415, 'JSON_REQUIRED', '交易请求必须使用 JSON');
    if (Number(request.headers.get('Content-Length')) > 8192) throw new GatewayError(413, 'REQUEST_TOO_LARGE', '交易请求正文超过 8 KiB');
    const reader = request.body?.getReader();
    if (!reader) throw new GatewayError(400, 'INVALID_TRADE_REQUEST', '缺少交易请求正文');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 8192) { await reader.cancel(); throw new GatewayError(413, 'REQUEST_TOO_LARGE', '交易请求正文超过 8 KiB'); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(body)); }
    catch { throw new GatewayError(400, 'INVALID_TRADE_REQUEST', '交易请求 JSON 无效'); }
}
export async function handleOrderApi(request: Request, backend: OrderBackend, timeoutSeconds: number) {
    const url = new URL(request.url);
    const writing = orderWritePaths.includes(url.pathname);
    if (request.method !== (writing ? 'POST' : 'GET')) throw new GatewayError(405, 'METHOD_NOT_ALLOWED', '该交易接口不支持此方法');
    if (writing) {
        if (url.search) throw new GatewayError(400, 'INVALID_TRADE_REQUEST', '交易 POST 不接受查询参数');
        const body = await readBody(request);
        if (url.pathname.endsWith('/cleanup')) {
            const identity = parseCleanupRequest(body);
            assertTradeScope(identity);
            return cleanupOrders(new OrderSession(backend, identity, timeoutSeconds));
        }
        const check = url.pathname.endsWith('/check');
        if (check) {
            const input = parseCheckRequest(body);
            assertTradeScope(input);
            return checkOrders(new OrderSession(backend, input, timeoutSeconds), input);
        }
        const input = parseTradeRequest(body);
        // JSON 准入以后不继承浏览器取消信号，仍受独立总预算约束。
        return executeOrder(new OrderSession(backend, input, timeoutSeconds), input);
    }
    let identity;
    try { identity = parseTradeQuery(url.searchParams); }
    catch (error) { throw new GatewayError(400, 'INVALID_QUERY', (error as Error).message); }
    assertTradeScope(identity);
    const session = new OrderSession(backend, identity, timeoutSeconds, request.signal);
    if (url.pathname.endsWith('/fetch_positions')) return readPositions(session);
    return url.pathname.endsWith('/fetch_market_info') ? readTradeData(session)
        : parseQuote(await session.read('fetch_ticker'), identity.symbol, Date.now());
}
