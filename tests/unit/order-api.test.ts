import { expect, test } from 'bun:test';
import { createApi } from '../../scripts/crypto/api';
import { calculatePreview } from '../../src/crypto/trading/calculate';
import { OrderExecution } from '../../src/crypto/trading/execution-state';
import type { CheckResult } from '../../src/crypto/trading/types';
import { identityQuery } from '../../src/crypto/trading/validation';
import type { ExecutionResult, TradeData, TradeRequest } from '../../src/crypto/trading/types';
import { runtime, deferred } from '../fixtures/data';
import { orderIdentity, orderRequest } from '../fixtures/orders';
import { OrderFixture } from '../fixtures/order-backend';

function setup() {
    const backend = new OrderFixture(); backend.options.price = 10000;
    const api = createApi({ backend: { base_url: 'http://offline', username: 'test', password: 'private', request_timeout_seconds: 2 },
        server: { host: '127.0.0.1', port: 5174 }, runtime }, backend);
    const get = async (path: string) => (await api(new Request('http://local' + path)))!;
    const post = async (input: unknown, path = '/api/ccxt/manual-order', signal?: AbortSignal) => (await api(new Request('http://local' + path,
        { method: 'POST', headers: { Origin: 'http://local', 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal })))!;
    const prepare = async (patch: Partial<TradeRequest> = {}) => {
        const request = { ...orderRequest(), ...patch };
        const response = await get('/api/ccxt/fetch_market_info?' + identityQuery(request));
        expect(response.status).toBe(200);
        const data = await response.json() as TradeData;
        const preview = calculatePreview(data, request, request.parameters, request.atr_snapshot.value, request.quote_snapshot, request.side);
        const { amount, stop_price, take_profit_price, estimated_risk } = preview.plan;
        return { ...request, expected: { amount, stop_price, take_profit_price, estimated_risk } };
    };
    return { backend, api, get, post, prepare };
}

test('手动持仓入口只读取目标品种，身份及数量归一，空值保留且不泄漏私有字段', async () => {
    const { backend, get } = setup();
    backend.options.positions = [
        { symbol: orderIdentity.symbol, side: 'long', contracts: 2.5, entryPrice: 57.1, info: 'PRIVATE' },
        { symbol: orderIdentity.symbol, side: 'short', contracts: null, entryPrice: null },
        { symbol: 'ETH/USDT:USDT', side: 'long', contracts: 99, entryPrice: 3000 },
    ];
    const read = backend.read.bind(backend), queries: URLSearchParams[] = [];
    backend.read = async (path, params, signal) => { queries.push(new URLSearchParams(params)); return read(path, params, signal); };
    const response = await get('/api/ccxt/fetch_positions?' + identityQuery(orderIdentity));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ identity: orderIdentity, checked_at: expect.any(Number), positions: [
        { side: 'long', contracts: '2.5', entry_price: '57.1' }, { side: 'short', contracts: null, entry_price: null },
    ] });
    expect(queries).toHaveLength(1); expect(queries[0]!.getAll('symbols')).toEqual([orderIdentity.symbol]);
    expect(queries[0]!.has('symbol')).toBe(false);
    expect(backend.reads.map(read => read.method)).toEqual(['fetch_positions']); expect(backend.writes).toHaveLength(0);
    backend.options.positions = [];
    expect((await (await get('/api/ccxt/fetch_positions?' + identityQuery(orderIdentity))).json()).positions).toEqual([]);
});

test('持仓读取失败或非法数量不伪装空仓；非法 GET 参数及 POST 在读取前拒绝', async () => {
    const { backend, get, api } = setup(), path = '/api/ccxt/fetch_positions?' + identityQuery(orderIdentity);
    backend.options.scenario = 'positions-fail';
    const unavailable = await get(path); expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error.code).toBe('SERVICE_NOT_READY');
    backend.options.scenario = 'ok'; backend.options.positions = [{ symbol: orderIdentity.symbol, contracts: -1 }];
    const invalid = await get(path); expect(invalid.status).toBe(502);
    expect((await invalid.json()).error.code).toBe('BACKEND_INVALID_RESPONSE');
    const count = backend.reads.length;
    for (const suffix of ['&extra=x', '&symbol=OTHER']) {
        const response = await get(path + suffix); expect(response.status).toBe(400);
        expect((await response.json()).error.code).toBe('INVALID_QUERY');
    }
    expect((await api(new Request('http://local' + path, { method: 'POST' })))!.status).toBe(405);
    expect(backend.reads).toHaveLength(count); expect(backend.writes).toHaveLength(0);
});

test('实际未知规则警告后允许入场，入场确认才并发提交双保护并核对三个订单', async () => {
    const { backend, prepare, post } = setup();
    const request = await prepare();
    const response = await post(request), result = await response.json() as ExecutionResult;
    expect(response.status).toBe(200);
    expect(result.legs.entry).toMatchObject({ write_state: 'accepted', confirmation: 'filled', filled: '0.005', average: '10000' });
    expect(result.legs.stop_loss).toMatchObject({ write_state: 'accepted', confirmation: 'open' });
    expect(result.legs.take_profit).toMatchObject({ write_state: 'accepted', confirmation: 'open' });
    expect(result.warnings.map(w => w.code)).toContain('NOTIONAL_UNVERIFIED');
    expect(backend.writes.map(w => w.method)).toEqual(['create_market_order', 'create_stop_market_order', 'create_take_profit_market_order']);
    expect(backend.writes[0]!.body).toMatchObject({ positionSide: 'BOTH', amount: '0.005', side: 'buy', is_live: false });
    for (const leg of backend.writes.slice(1)) expect(leg.body).toMatchObject({ amount: '0.005', side: 'sell', reduceOnly: true, workingType: 'CONTRACT_PRICE', positionSide: 'BOTH' });
    expect(result.verification.positions?.[0]?.contracts).toBe('0.005');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
});

test('Kraken live 使用 USD 及 last 触发，未知上下限／模式不改写成已知；sandbox 禁用', async () => {
    const { backend, prepare, post, get } = setup();
    const request = await prepare({ exchange_name: 'kraken', is_live: true, symbol: 'BTC/USD:USD',
        quote_snapshot: { ...orderRequest().quote_snapshot, ticker: { ...orderRequest().quote_snapshot.ticker, symbol: 'BTC/USD:USD' } } });
    const result = await (await post(request)).json() as ExecutionResult;
    expect(result.submitted_plan?.risk_currency).toBe('USD');
    expect(result.warnings.map(w => w.code)).toContain('LIMITS_UNVERIFIED');
    expect(backend.writes[1]!.body).toMatchObject({ triggerSignal: 'last', reduceOnly: true });
    expect(backend.writes[1]!.body).not.toHaveProperty('positionSide');
    expect(backend.writes[1]!.body).not.toHaveProperty('workingType');
    const unsupported = await get('/api/ccxt/fetch_market_info?' + identityQuery({ ...request, is_live: false }));
    expect(unsupported.status).toBe(422);
    expect((await unsupported.json()).error.code).toBe('NOT_SUPPORTED');
});

test('明确资金拒单不挂保护；部分成交只保护实际数量；单腿失败不撤销或补挂', async () => {
    for (const scenario of ['insufficient', 'partial', 'stop-rejected', 'take-profit-rejected']) {
        const { backend, prepare, post } = setup(); backend.options.scenario = scenario;
        const result = await (await post(await prepare())).json() as ExecutionResult;
        if (scenario === 'insufficient') {
            expect(backend.writes).toHaveLength(1);
            expect(result.legs.entry).toMatchObject({ write_state: 'rejected', error: { code: 'INSUFFICIENT_FUNDS' } });
            expect(result.legs.stop_loss.write_state).toBe('not_sent');
        } else {
            expect(backend.writes).toHaveLength(3);
            if (scenario === 'partial') {
                expect(result.legs.entry.confirmation).toBe('partially_filled');
                expect(result.submitted_plan?.amount).toBe('0.002');
                expect(backend.writes[1]!.body.amount).toBe('0.002'); expect(backend.writes[2]!.body.amount).toBe('0.002');
                expect(result.warnings.map(w => w.code)).toContain('FILLED_RISK_CHANGED');
            } else {
                expect(result.legs[scenario === 'stop-rejected' ? 'stop_loss' : 'take_profit'].write_state).toBe('rejected');
                expect(result.legs[scenario === 'stop-rejected' ? 'take_profit' : 'stop_loss'].confirmation).toBe('open');
            }
        }
    }
});

test('未知回执不重发，能在本轮查到成交才挂保护；open 的部分成交不自动补偿', async () => {
    for (const scenario of ['entry-unknown', 'entry-unknown-found', 'entry-pending', 'missing-average']) {
        const { backend, prepare, post } = setup(); backend.options.scenario = scenario;
        const result = await (await post(await prepare())).json() as ExecutionResult;
        expect(backend.writes.filter(w => w.method === 'create_market_order')).toHaveLength(1);
        if (scenario === 'entry-unknown' || scenario === 'entry-pending') {
            expect(backend.writes).toHaveLength(1); expect(result.legs.stop_loss.write_state).toBe('not_sent');
        } else {
            expect(backend.writes).toHaveLength(3); expect(result.legs.entry.confirmation).toBe('filled');
            if (scenario === 'missing-average') expect(result.submitted_plan?.opening_fee_source).toBe('reported');
        }
    }
});

test('费用／关键规则缺失、明确双向模式、计划变化和过期快照在任何写操作前失败', async () => {
    for (const scenario of ['no-fee', 'bad-grid', 'hedged', 'changed', 'stale']) {
        const { backend, prepare, post } = setup();
        const request = await prepare();
        if (scenario === 'changed') backend.options.taker = '0.002';
        else if (scenario === 'stale') request.quote_snapshot.observed_at = Date.now() - 5001;
        else backend.options.scenario = scenario;
        const response = await post(request);
        expect(response.status).toBe(scenario === 'hedged' ? 422 : scenario === 'changed' ? 409 : 503);
        expect(backend.writes).toHaveLength(0);
        const code = (await response.json()).error.code;
        expect(code).toBe(scenario === 'no-fee' ? 'FEE_CREDENTIALS_NOT_CONFIGURED' : scenario === 'hedged' ? 'NOT_SUPPORTED'
            : scenario === 'changed' ? 'TRADE_PLAN_CHANGED' : 'TRADE_DATA_UNAVAILABLE');
    }
});

test('独立模式读取失败仅警告；只读检查及关闭客户端不增加自动写操作', async () => {
    const { backend, prepare, post } = setup(); backend.options.scenario = 'positions-fail';
    const request = await prepare();
    const gate = deferred<void>(), started = deferred<void>(), originalWrite = backend.write.bind(backend);
    backend.write = async (...args) => { if (args[0].endsWith('create_market_order')) { started.resolve(); await gate.promise; } return originalWrite(...args); };
    const cancellation = new AbortController();
    const pending = post(request, undefined, cancellation.signal);
    await started.promise; cancellation.abort(); gate.resolve();
    const result = await (await pending).json() as ExecutionResult;
    expect(backend.writes).toHaveLength(3);
    expect(result.warnings.map(w => w.code)).toContain('POSITION_MODE_UNVERIFIED');
    const checked = await post({ ...orderIdentity, request_id: result.request_id, orders: { entry: result.legs.entry.order_id, stop_loss: result.legs.stop_loss.order_id, take_profit: result.legs.take_profit.order_id } }, '/api/ccxt/manual-order/check');
    expect(checked.status).toBe(200);
    expect(backend.writes).toHaveLength(3);
    expect((await checked.json()).observations.entry).not.toHaveProperty('write_state');
});

test('同源、JSON、大小、未知字段及方法检查均先于后端读取', async () => {
    const { backend, api } = setup();
    for (const [headers, body, status] of [
        [{ 'Content-Type': 'application/json' }, '{}', 403],
        [{ Origin: 'http://evil', 'Content-Type': 'application/json' }, '{}', 403],
        [{ Origin: 'http://local', 'Content-Type': 'text/plain' }, '{}', 415],
        [{ Origin: 'http://local', 'Content-Type': 'application/json' }, JSON.stringify({ data: 'x'.repeat(8192) }), 413],
        [{ Origin: 'http://local', 'Content-Type': 'application/json' }, '{', 400],
        [{ Origin: 'http://local', 'Content-Type': 'application/json' }, JSON.stringify({ ...orderRequest(), reduceOnly: false }), 400],
    ] as const) {
        const response = (await api(new Request('http://local/api/ccxt/manual-order', { method: 'POST', headers, body })))!;
        expect(response.status).toBe(status);
    }
    expect((await api(new Request('http://local/api/ccxt/manual-order')))!.status).toBe(405);
    expect(backend.reads).toHaveLength(0); expect(backend.writes).toHaveLength(0);
});

test('两张保护单真正独立发起，一张等待时另一张可以返回，已触发不会显示仍挂着', async () => {
    const { backend, prepare, post } = setup(); backend.options.scenario = 'stop-triggered'; backend.options.protection_delay = 10;
    const request = await prepare(), original = backend.write.bind(backend);
    const stop = deferred<void>(), takeProfit = deferred<void>();
    backend.write = async (...args) => {
        if (args[0].endsWith('create_stop_market_order')) await stop.promise;
        if (args[0].endsWith('create_take_profit_market_order')) takeProfit.resolve();
        return original(...args);
    };
    const pending = post(request); await takeProfit.promise; stop.resolve();
    const result = await (await pending).json() as ExecutionResult;
    expect(result.legs.stop_loss.confirmation).toBe('filled');
    expect(result.legs.take_profit.confirmation).toBe('open');
    expect(result.legs.stop_loss.order_id).not.toBe(result.legs.take_profit.order_id);
    expect(result.warnings.map(w => w.code)).toContain('REMAINING_PROTECTION');
});

test('查询结果保留最初拒单原因，查询错误单独记录且不补发订单', async () => {
    const { backend, prepare, post } = setup(); backend.options.scenario = 'take-profit-rejected';
    const input = await prepare();
    const execution = new OrderExecution({ execute: async request => await (await post(request)).json() as ExecutionResult,
        check: async request => await (await post(request, '/api/ccxt/manual-order/check')).json() as CheckResult });
    await execution.submit(input);
    expect(execution.state.result!.legs.take_profit.error?.code).toBe('ORDER_REJECTED');
    await execution.check();
    expect(execution.state.result!.legs.take_profit.error?.code).toBe('ORDER_REJECTED');
    expect(execution.state.result!.legs.take_profit.write_state).toBe('rejected');
    expect(backend.writes).toHaveLength(3);
});
