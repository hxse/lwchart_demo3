import { integer, MAX_HISTORY_BARS, normalizeCcxt, onlyKeys, record, symbol, TIMEFRAMES, type Timeframe } from '../options';
import { parseIndicator } from '../../indicators/parameters';
import { Decimal, one, zero } from './decimal';
import { TradingError, type CheckRequest, type Quote, type TradeIdentity, type TradeParameters, type TradeRequest } from './types';

const identityKeys = ['exchange_name', 'market', 'is_live', 'symbol'];
export function identityOf(value: TradeIdentity): TradeIdentity {
    return { exchange_name: value.exchange_name, market: value.market, is_live: value.is_live, symbol: value.symbol };
}
function uuid(value: unknown) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('request_id 必须是 UUID v4');
    return value;
}
function fields(input: unknown, keys: string[], label: string) {
    const value = record(input, label);
    onlyKeys(value, keys, label);
    if (keys.some(key => !Object.hasOwn(value, key))) throw new Error(`${label} 缺少必填字段`);
    return value;
}
export function positiveDecimal(input: unknown, label: string) {
    if (typeof input !== 'string') throw new Error(`${label} 必须是十进制字符串`);
    const value = Decimal.parse(input);
    if (value.cmp(zero) <= 0) throw new Error(`${label} 必须大于零`);
    return value.toString();
}
function tolerance(input: unknown, label: string) {
    if (typeof input !== 'string') throw new Error(`${label} 必须是十进制比例`);
    const value = Decimal.parse(input);
    if (value.cmp(zero) < 0 || value.cmp(one) >= 0) throw new Error(`${label} 必须在 0% 至 100% 之间，不能等于 100%`);
    return value.toString();
}
function timestamp(value: unknown, label: string, minimum = 0) { return integer(value, minimum, 9999999999999, label); }
export function parseTradeParameters(input: unknown): TradeParameters {
    const value = fields(input, ['timeframe', 'atr_period', 'risk_amount', 'atr_multiplier', 'risk_tolerance', 'atr_tolerance', 'take_profit_multiplier'], '下单参数');
    if (!TIMEFRAMES.includes(value.timeframe as Timeframe)) throw new Error('下单 K 线周期不受支持');
    const atr_period = integer(value.atr_period, 1, MAX_HISTORY_BARS, 'ATR 根数');
    parseIndicator({ type: 'atr', period: atr_period });
    return { timeframe: value.timeframe as Timeframe, atr_period,
        risk_amount: positiveDecimal(value.risk_amount, '风险金额'), atr_multiplier: positiveDecimal(value.atr_multiplier, 'ATR 倍数'),
        risk_tolerance: tolerance(value.risk_tolerance, '金额容差'), atr_tolerance: tolerance(value.atr_tolerance, 'ATR 容差'),
        take_profit_multiplier: positiveDecimal(value.take_profit_multiplier, '止盈倍数') };
}
function quote(input: unknown, identity: TradeIdentity): Quote {
    const value = fields(input, ['ticker', 'observed_at'], '报价快照');
    const ticker = fields(value.ticker, ['symbol', 'last', 'bid', 'ask', 'timestamp'], '报价');
    if (symbol(ticker.symbol) !== identity.symbol) throw new Error('报价品种与下单品种不一致');
    const price = (v: unknown) => v === null ? null : positiveDecimal(v, '报价价格');
    const bid = price(ticker.bid), ask = price(ticker.ask), last = price(ticker.last);
    if (bid && ask && Decimal.parse(bid).cmp(Decimal.parse(ask)) > 0) throw new Error('报价买价高于卖价');
    return { ticker: { symbol: identity.symbol, bid, ask, last, timestamp: ticker.timestamp === null ? null : timestamp(ticker.timestamp, '报价时间') },
        observed_at: timestamp(value.observed_at, '报价获取时间') };
}
export function assertFreshQuote(quote: Quote, now: number) {
    if (quote.observed_at > now || now - quote.observed_at > 5000) throw new TradingError('TRADE_DATA_UNAVAILABLE', '报价已失效，请等待新报价后重新选择');
}
function parseInput<T>(run: () => T): T {
    try { return run(); }
    catch (error) { throw new TradingError('INVALID_TRADE_REQUEST', error instanceof Error ? error.message : '下单参数无效', 400); }
}
export function parseTradeRequest(input: unknown): TradeRequest {
    return parseInput(() => {
        const value = fields(input, [...identityKeys, 'request_id', 'mode', 'side', 'order_type', 'parameters', 'atr_snapshot', 'quote_snapshot', 'expected'], '下单请求');
        const identity = normalizeCcxt(Object.fromEntries(identityKeys.map(key => [key, value[key]])));
        if (value.mode !== 'fixed-risk-atr' || value.order_type !== 'market') throw new Error('本入口仅支持固定风险金额＋ATR 的市价入场');
        if (value.side !== 'buy' && value.side !== 'sell') throw new Error('下单方向必须是 buy 或 sell');
        const parameters = parseTradeParameters(value.parameters);
        const atr = fields(value.atr_snapshot, ['value', 'bar_time', 'history_bars'], 'ATR 快照');
        const expected = fields(value.expected, ['amount', 'stop_price', 'take_profit_price', 'estimated_risk'], '预览计划');
        return { ...identity, request_id: uuid(value.request_id), mode: 'fixed-risk-atr', order_type: 'market', side: value.side,
            parameters, quote_snapshot: quote(value.quote_snapshot, identity),
            atr_snapshot: { value: positiveDecimal(atr.value, 'ATR'), bar_time: timestamp(atr.bar_time, 'ATR K 线时间', 1000000000000),
                history_bars: integer(atr.history_bars, parameters.atr_period, MAX_HISTORY_BARS, 'ATR 历史容量') },
            expected: { amount: positiveDecimal(expected.amount, '数量'), stop_price: positiveDecimal(expected.stop_price, '止损价格'),
                take_profit_price: positiveDecimal(expected.take_profit_price, '止盈价格'), estimated_risk: positiveDecimal(expected.estimated_risk, '预计风险') } };
    });
}
export function parseCheckRequest(input: unknown): CheckRequest {
    return parseInput(() => {
        const value = fields(input, [...identityKeys, 'request_id', 'orders'], '查询请求');
        const identity = normalizeCcxt(Object.fromEntries(identityKeys.map(key => [key, value[key]])));
        const orders = fields(value.orders, ['entry', 'stop_loss', 'take_profit'], '订单编号');
        const id = (value: unknown) => {
            if (value === null) return null;
            if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('订单编号格式无效');
            return value;
        };
        return { ...identity, request_id: uuid(value.request_id), orders: { entry: id(orders.entry), stop_loss: id(orders.stop_loss), take_profit: id(orders.take_profit) } };
    });
}
export function parseTradeQuery(params: URLSearchParams): TradeIdentity {
    const values = Object.fromEntries(params);
    onlyKeys(values, identityKeys, '交易资料参数');
    for (const key of identityKeys) if (params.getAll(key).length !== 1) throw new Error('交易资料参数必须完整且不能重复');
    if (!['true', 'false'].includes(values.is_live!)) throw new Error('交易环境必须明确为 true 或 false');
    return normalizeCcxt({ ...values, is_live: values.is_live === 'true' });
}
export function identityQuery(identity: TradeIdentity) {
    return new URLSearchParams({ ...identityOf(identity), is_live: String(identity.is_live) });
}
