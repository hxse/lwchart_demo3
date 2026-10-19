import { expect, test } from 'bun:test';
import { createApi } from '../../scripts/crypto/api';
import { BackendWriteError, GatewayError } from '../../scripts/crypto/backend';
import type { CleanupResult } from '../../src/crypto/trading/inspection';
import type { TradeIdentity } from '../../src/crypto/trading/types';
import { runtime, deferred } from '../fixtures/data';
import { orderIdentity } from '../fixtures/orders';
import { OrderFixture } from '../fixtures/order-backend';

const path = '/api/ccxt/manual-order/cleanup';
const conditional = (id = 'stop', patch: Record<string, unknown> = {}) => ({
    id, symbol: orderIdentity.symbol, status: 'open', type: 'stop_market', side: 'sell',
    reduceOnly: true, triggerPrice: 59000, amount: 1, filled: 0, ...patch,
});
function setup(identity: TradeIdentity = orderIdentity) {
    const backend = new OrderFixture();
    backend.options.positions = []; backend.options.open_orders = [conditional('stop', { symbol: identity.symbol })];
    const api = createApi({ backend: { base_url: 'http://offline', username: 'test', password: 'private', request_timeout_seconds: 2 },
        server: { host: '127.0.0.1', port: 5174 }, runtime }, backend);
    const request = (input: unknown = identity, suffix = '', init: RequestInit = {}) => new Request('http://local' + path + suffix,
        { method: 'POST', headers: { Origin: 'http://local', 'Content-Type': 'application/json' }, body: JSON.stringify(input), ...init });
    const run = async () => {
        const reply = (await api(request()))!;
        expect(reply.status).toBe(200); expect(reply.headers.get('Cache-Control')).toBe('no-store');
        return reply.json() as Promise<CleanupResult>;
    };
    return { backend, api, request, run };
}

test('Binance 和 Kraken 空仓清理使用实际路由、完整身份和新列表，只逐笔取消条件只减仓单', async () => {
    for (const identity of [orderIdentity, { ...orderIdentity, exchange_name: 'kraken' as const, is_live: true, symbol: 'BTC/USD:USD' }]) {
        const { backend, run } = setup(identity);
        backend.options.positions = [{ symbol: identity.symbol, contracts: 0 }];
        backend.options.open_orders = [conditional('stop', { symbol: identity.symbol, type: 'stp', triggerPrice: null }),
            conditional('take', { symbol: identity.symbol, type: 'TAKE_PROFIT', triggerPrice: null }),
            conditional('trigger', { symbol: identity.symbol, type: 'limit' }),
            conditional('limit', { symbol: identity.symbol, type: 'limit', triggerPrice: null }),
            conditional('other', { symbol: 'ETH/USDT:USDT', reduceOnly: false })];
        const read = backend.read.bind(backend), queries: Array<{ path: string; params: URLSearchParams }> = [];
        backend.read = (path, params, signal) => { queries.push({ path, params: new URLSearchParams(params) }); return read(path, params, signal); };
        const result = await run();
        expect(result.identity).toEqual(identity); expect(result.outcome).toBe('completed');
        expect(result.orders.map(o => [o.id, o.write_state, o.confirmation])).toEqual([
            ['stop', 'accepted', 'canceled'], ['take', 'accepted', 'canceled'], ['trigger', 'accepted', 'canceled']]);
        expect(backend.writes.map(w => w.body)).toEqual(['stop', 'take', 'trigger'].map(id => ({ ...identity, id })));
        expect(backend.writes.every(w => w.method === 'cancel_order')).toBe(true);
        expect(queries.map(q => q.path)).toEqual(['/ccxt/fetch_positions', '/ccxt/fetch_open_orders', '/ccxt/fetch_positions', '/ccxt/fetch_open_orders']);
        for (const { path, params } of queries) {
            expect(params.get('exchange_name')).toBe(identity.exchange_name); expect(params.get('is_live')).toBe(String(identity.is_live));
            expect(params.get(path.endsWith('fetch_positions') ? 'symbols' : 'symbol')).toBe(identity.symbol);
            expect(params.has('limit')).toBe(false); expect(params.has('since')).toBe(false);
        }
        expect(result.issues).toEqual([]);
    }
});

test('已有仓位、未知数量和多空抵销均不能作为空仓，非法数量或读取失败不撤单', async () => {
    for (const [positions, outcome] of [
        [[{ contracts: 1, side: 'long' }], 'skipped'], [[{ contracts: null }], 'skipped'],
        [[{ contracts: 1, side: 'long' }, { contracts: 1, side: 'short' }], 'skipped'],
        [[{ contracts: -1 }], 'failed'], [[{ contracts: '0' }], 'failed'],
    ] as const) {
        const { backend, run } = setup();
        backend.options.positions = positions.map(position => ({ symbol: orderIdentity.symbol, ...position }));
        const result = await run(); expect(result.outcome).toBe(outcome);
        expect(backend.reads.map(r => r.method)).toEqual(['fetch_positions']); expect(backend.writes).toEqual([]);
        if (outcome === 'failed') expect(result.issues[0]!.code).toBe('BACKEND_INVALID_RESPONSE');
    }
    const { backend, run } = setup(); backend.options.scenario = 'positions-fail';
    const result = await run(); expect(result.outcome).toBe('failed'); expect(result.snapshot).toBeNull();
    expect(result.issues[0]!.code).toBe('SERVICE_NOT_READY'); expect(backend.writes).toEqual([]);
});

test('开仓挂单、未知只减仓属性或状态阻止整轮清理；普通减仓及未知条件类型保留', async () => {
    for (const patch of [{ reduceOnly: false }, { reduceOnly: null }, { status: null }]) {
        const { backend, run } = setup(); backend.options.open_orders.push(conditional('uncertain', patch));
        const result = await run(); expect(result.outcome).toBe('skipped'); expect(result.message).toContain('开仓挂单');
        expect(result.orders).toEqual([]); expect(backend.writes).toEqual([]);
    }
    const { backend, run } = setup();
    backend.options.open_orders = [conditional('limit', { triggerPrice: null, type: 'limit' }),
        conditional('unknown', { triggerPrice: null, type: null })];
    expect((await run()).outcome).toBe('empty'); expect(backend.writes).toEqual([]);
});

test('撤单前复查仓位变化或未知时跳过；重复 ID 和非法记录使规划失败', async () => {
    for (const contracts of [1, null]) {
        const { backend, run } = setup(), read = backend.read.bind(backend); let calls = 0;
        backend.read = async (path, params, signal) => {
            if (path.endsWith('fetch_positions') && ++calls === 2) return { positions: [{ symbol: orderIdentity.symbol, contracts }] };
            return read(path, params, signal);
        };
        const result = await run(); expect(result.outcome).toBe('skipped'); expect(result.message).toContain('复查');
        expect(result.snapshot!.positions[0]!.contracts).toBe(contracts === null ? null : '1'); expect(backend.writes).toEqual([]);
    }
    for (const extra of [conditional(), conditional('invalid', { symbol: null })]) {
        const { backend, run } = setup(), read = backend.read.bind(backend);
        backend.read = (path, params, signal) => path.endsWith('fetch_open_orders') ? Promise.resolve({ orders: [conditional(), extra] }) : read(path, params, signal);
        const result = await run(); expect(result.outcome).toBe('failed'); expect(result.issues).toHaveLength(1); expect(backend.writes).toEqual([]);
    }
});

test('撤单并发最多两笔，浏览器取消不停止已准入执行，稀疏 200 只表示受理和列表缺席', async () => {
    const { backend, api, request } = setup(), started = deferred<void>(), release = deferred<void>();
    backend.options.open_orders = [conditional('1'), conditional('2'), conditional('3')]; backend.options.cancel_sparse = true;
    const write = backend.write.bind(backend); let active = 0, peak = 0;
    backend.write = async (path, body, signal) => {
        active++; peak = Math.max(peak, active); if (active === 2) started.resolve();
        await release.promise;
        try { return await write(path, body, signal); } finally { active--; }
    };
    const abort = new AbortController(), response = api(request(orderIdentity, '', { signal: abort.signal }));
    await started.promise; abort.abort(); release.resolve();
    const result = await (await response)!.json() as CleanupResult;
    expect(peak).toBe(2); expect(backend.writes).toHaveLength(3);
    expect(result.orders.map(o => [o.write_state, o.confirmation])).toEqual(Array(3).fill(['accepted', 'absent']));
    expect(result.orders.every(o => o.error === null)).toBe(true);
});

test('逐项保留拒绝、结果未知和未发送，不重试；新的挂单核对揭示仍存在的订单', async () => {
    const { backend, run } = setup(), write = backend.write.bind(backend);
    backend.options.open_orders = ['ok', 'rejected', 'unknown', 'not_sent', 'conflict'].map(id => conditional(id));
    const attempted: string[] = [];
    backend.write = async (path, body, signal) => {
        attempted.push(String(body.id));
        if (body.id === 'conflict') return { order: conditional('conflict', { status: 'canceled' }) };
        if (body.id !== 'ok') throw new BackendWriteError(new GatewayError(502, 'OPERATION_STATUS_UNKNOWN', '失败'), body.id as 'rejected' | 'unknown' | 'not_sent');
        return write(path, body, signal);
    };
    const result = await run(); expect(result.outcome).toBe('completed');
    expect(attempted).toEqual(['ok', 'rejected', 'unknown', 'not_sent', 'conflict']);
    expect(result.orders.map(o => [o.write_state, o.confirmation])).toEqual([
        ['accepted', 'canceled'], ['rejected', 'open'], ['unknown', 'open'], ['not_sent', 'open'], ['accepted', 'open']]);
    expect(result.orders[4]!.error!.code).toBe('ORDER_FACTS_CONFLICT');
});

test('写后查询失败保留受理事实，不把取消回执当作最新核对；身份矛盾不确认成功', async () => {
    const { backend, run } = setup(), read = backend.read.bind(backend); let lists = 0;
    backend.read = (path, params, signal) => {
        if (path.endsWith('fetch_open_orders') && ++lists === 2) throw new GatewayError(504, 'BACKEND_TIMEOUT', '超时');
        return read(path, params, signal);
    };
    const result = await run(); expect(result.orders[0]).toMatchObject({ write_state: 'accepted', confirmation: 'unknown' });
    expect(result.issues[0]!.code).toBe('BACKEND_TIMEOUT'); expect(backend.writes).toHaveLength(1);
    const other = setup();
    other.backend.write = async () => ({ order: conditional('foreign', { status: 'canceled' }) });
    const conflict = await other.run(); expect(conflict.orders[0]).toMatchObject({ write_state: 'unknown', confirmation: 'open', error: { code: 'ORDER_FACTS_CONFLICT' } });
});

test('清理准入严格拒绝方法、身份、额外字段、来源、正文类型和超大正文，拒绝前不访问后端', async () => {
    const { backend, api, request } = setup();
    const cases: Array<[Request, number, string]> = [
        [new Request('http://local' + path), 405, 'METHOD_NOT_ALLOWED'],
        [request({ ...orderIdentity, ids: ['stop'] }), 400, 'INVALID_TRADE_REQUEST'],
        [request({ ...orderIdentity, symbol: '' }), 400, 'INVALID_TRADE_REQUEST'],
        [request({ ...orderIdentity, symbol: 'BTC/*' }), 400, 'INVALID_TRADE_REQUEST'],
        [request({ ...orderIdentity, is_live: 'true' }), 400, 'INVALID_TRADE_REQUEST'],
        [request({ symbol: orderIdentity.symbol }), 400, 'INVALID_TRADE_REQUEST'],
        [request(orderIdentity, '?symbol=OTHER'), 400, 'INVALID_TRADE_REQUEST'],
        [request(orderIdentity, '', { headers: { 'Content-Type': 'application/json' } }), 403, 'ORIGIN_NOT_ALLOWED'],
        [request(orderIdentity, '', { headers: { Origin: 'http://evil', 'Content-Type': 'application/json' } }), 403, 'ORIGIN_NOT_ALLOWED'],
        [request(orderIdentity, '', { headers: { Origin: 'http://local', 'Content-Type': 'text/plain' } }), 415, 'JSON_REQUIRED'],
        [request(orderIdentity, '', { body: 'x'.repeat(8193) }), 413, 'REQUEST_TOO_LARGE'],
    ];
    for (const [input, status, code] of cases) {
        const result = (await api(input))!; expect(result.status).toBe(status); expect((await result.json()).error.code).toBe(code);
    }
    expect((await api(request({ ...orderIdentity, market: 'spot' })))!.status).toBe(422);
    expect(backend.reads).toEqual([]); expect(backend.writes).toEqual([]);
});
