import { expect, test } from 'bun:test';
import { parseMarketInfo, parsePositionEvidence, parseQuote, parseTradingFee } from '../../src/crypto/trading/wire';
import { assertFreshQuote, parseCheckRequest, parseTradeParameters, parseTradeQuery, parseTradeRequest } from '../../src/crypto/trading/validation';
import { orderFee, orderIdentity, orderMarket, orderParameters, orderRequest } from '../fixtures/orders';

test('真实市场规则保留四态、多个数量过滤器、非零起点与未知适用性', () => {
    const raw = orderMarket();
    const parsed = parseMarketInfo({ ...raw, private_info: 'PRIVATE' }, orderIdentity.symbol);
    expect(parsed).toEqual(raw);
    expect(parsed.quantity_rules[0]!.grid_origin.value).toBe('0.001');
    expect(parsed.notional_rules[2]!.applies_to_reduce_only).toBeNull();
    expect(parsed.notional_rules[0]!.maximum).toEqual({ status: 'unknown', value: null });
    expect(JSON.stringify(parsed)).not.toContain('PRIVATE');
    for (const status of ['not_applicable', 'unbounded'] as const) {
        raw.price_rules.maximum = { status, value: null };
        expect(parseMarketInfo(raw, orderIdentity.symbol).price_rules.maximum.status).toBe(status);
    }
    raw.price_rules.minimum = { status: 'known', value: '-1' };
    expect(() => parseMarketInfo(raw, orderIdentity.symbol)).toThrow('后端交易资料格式无效');
    expect(() => parseMarketInfo({ ...orderMarket(), symbol: 'OTHER' }, orderIdentity.symbol)).toThrow();
});

test('账户费率核对真实身份和环境，负费率及零费率保留比例语义', () => {
    for (const taker of ['0', '-0.0001', '0.0004']) expect(parseTradingFee({ ...orderFee(), taker }, orderIdentity).taker).toBe(taker);
    for (const patch of [{ mode: 'live' }, { symbol: 'OTHER' }, { source: 'account' }, { taker: null }, { rate_unit: 'percent' }, { updated_at: -1 }]) {
        expect(() => parseTradingFee({ ...orderFee(), ...patch }, orderIdentity)).toThrow('后端交易资料格式无效');
    }
    expect(parsePositionEvidence({ positions: [{ symbol: orderIdentity.symbol, hedged: false, info: 'PRIVATE' }] }, orderIdentity.symbol))
        .toEqual([{ symbol: orderIdentity.symbol, hedged: false }]);
    expect(parsePositionEvidence({ positions: [] }, orderIdentity.symbol)).toEqual([]);
    expect(parsePositionEvidence({ positions: [{ symbol: orderIdentity.symbol }] }, orderIdentity.symbol)[0]!.hedged).toBeNull();
});

test('ticker 缺盘口保留 null，坏价格或反向点差不借 last 放行', () => {
    const raw = { symbol: orderIdentity.symbol, last: 10000, info: 'PRIVATE' };
    const quote = parseQuote({ ticker: raw }, orderIdentity.symbol, 1000);
    expect(quote).toEqual({ ticker: { symbol: raw.symbol, last: '10000', bid: null, ask: null, timestamp: null }, observed_at: 1000 });
    for (const patch of [{ bid: 10, ask: 9 }, { ask: -1 }, { bid: false }, { symbol: 'OTHER' }, { last: '10000' }]) {
        expect(() => parseQuote({ ticker: { ...raw, ...patch } }, orderIdentity.symbol, 1000)).toThrow('后端交易资料格式无效');
    }
    expect(() => assertFreshQuote(quote, 6000)).not.toThrow();
    expect(() => assertFreshQuote(quote, 6001)).toThrow('报价已失效');
    expect(() => assertFreshQuote(quote, 999)).toThrow('报价已失效');
});

test('真实下单与只读查询写法严格解析，非法参数在上游调用前拒绝', () => {
    const request = orderRequest();
    expect(parseTradeRequest(request)).toEqual(request);
    expect(parseTradeParameters({ ...orderParameters, risk_tolerance: '0' }).risk_tolerance).toBe('0');
    for (const patch of [{ risk_amount: '0' }, { atr_period: 1.5 }, { atr_period: true }, { timeframe: '1s' }, { atr_tolerance: '1' }]) {
        expect(() => parseTradeRequest({ ...request, parameters: { ...orderParameters, ...patch } })).toThrow();
    }
    for (const patch of [{ token: 'PRIVATE' }, { reduceOnly: false }, { order_type: 'limit' }, { request_id: 'invalid' }, { is_live: 'false' }]) {
        try { parseTradeRequest({ ...request, ...patch }); throw new Error('应拒绝'); }
        catch (error) { expect(error).toMatchObject({ code: 'INVALID_TRADE_REQUEST', status: 400 }); }
    }
    expect(parseCheckRequest({ ...orderIdentity, request_id: request.request_id, orders: { entry: 'one', stop_loss: null, take_profit: null } }).orders.entry).toBe('one');
    const query = new URLSearchParams({ ...orderIdentity, is_live: 'false' });
    expect(parseTradeQuery(query)).toEqual(orderIdentity);
    query.append('symbol', 'OTHER');
    expect(() => parseTradeQuery(query)).toThrow('不能重复');
});
