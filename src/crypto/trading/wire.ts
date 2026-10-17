import { Decimal, zero } from './decimal';
import { TradingError, type MarketInfo, type NotionalRule, type OrderKind, type PriceRules,
    type QuantityRule, type Quote, type RuleValue, type TradeData, type TradeIdentity, type TradingFee } from './types';

const invalid = () => new TradingError('BACKEND_INVALID_RESPONSE', '后端交易资料格式无效', 502);
export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw invalid();
    return value;
}
export function text(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw invalid();
    return value;
}
function nullableText(value: unknown) { return value === null ? null : text(value); }
function nullableBoolean(value: unknown) {
    if (value === null || typeof value === 'boolean') return value;
    throw invalid();
}
function nullableNumber(value: unknown) {
    if (value === null || typeof value === 'number' && Number.isFinite(value)) return value;
    throw invalid();
}
function decimal(value: unknown) {
    const input = text(value);
    try { return Decimal.parse(input).toString(); } catch { throw invalid(); }
}
export function ruleValue(input: unknown): RuleValue {
    const value = object(input);
    const status = value.status;
    if (status === 'known') {
        const number = decimal(value.value);
        if (Decimal.parse(number).cmp(zero) < 0) throw invalid();
        return { status, value: number };
    }
    if (!['unknown', 'not_applicable', 'unbounded'].includes(String(status)) || value.value !== null) throw invalid();
    return { status: status as RuleValue['status'], value: null };
}
function bounds(value: Record<string, unknown>) {
    const minimum = ruleValue(value.minimum), maximum = ruleValue(value.maximum);
    if (minimum.value !== null && maximum.value !== null && Decimal.parse(minimum.value).cmp(Decimal.parse(maximum.value)) > 0) throw invalid();
    return { minimum, maximum };
}
function priceRules(input: unknown): PriceRules {
    const value = object(input);
    const step_size = ruleValue(value.step_size), grid_origin = ruleValue(value.grid_origin);
    if (step_size.value !== null && Decimal.parse(step_size.value).cmp(zero) <= 0) throw invalid();
    return { step_size, grid_origin, ...bounds(value) };
}
function orderTypes(input: unknown): OrderKind[] {
    return array(input).map(value => {
        if (!['limit', 'market', 'stop_market', 'take_profit_market'].includes(String(value))) throw invalid();
        return value as OrderKind;
    });
}
function quantityRule(input: unknown): QuantityRule {
    const value = object(input);
    return { source: text(value.source), order_types: orderTypes(value.order_types),
        applies_to_reduce_only: nullableBoolean(value.applies_to_reduce_only), ...priceRules(value) };
}
function notionalRule(input: unknown): NotionalRule {
    const value = object(input);
    if (!['order_price', 'mark_price', 'unknown'].includes(String(value.price_reference))) throw invalid();
    return { source: text(value.source), order_types: orderTypes(value.order_types),
        applies_to_reduce_only: nullableBoolean(value.applies_to_reduce_only), ...bounds(value),
        currency: nullableText(value.currency), price_reference: value.price_reference as NotionalRule['price_reference'] };
}
export function parseMarketInfo(input: unknown, symbol: string): MarketInfo {
    const value = object(input);
    if (value.symbol !== symbol || !['contracts', 'base'].includes(String(value.amount_unit))) throw invalid();
    const size = value.contract_size_decimal === null ? null : decimal(value.contract_size_decimal);
    if (size !== null && Decimal.parse(size).cmp(zero) <= 0) throw invalid();
    return {
        symbol, base: nullableText(value.base), quote: nullableText(value.quote), settle: nullableText(value.settle),
        swap: nullableBoolean(value.swap), linear: nullableBoolean(value.linear), inverse: nullableBoolean(value.inverse),
        active: nullableBoolean(value.active), amount_unit: value.amount_unit as MarketInfo['amount_unit'],
        contract_size_currency: nullableText(value.contract_size_currency), contract_size_decimal: size,
        contract_size: nullableNumber(value.contract_size), precision_amount: nullableNumber(value.precision_amount),
        min_amount: nullableNumber(value.min_amount), leverage: nullableNumber(value.leverage),
        price_rules: priceRules(value.price_rules), quantity_rules: array(value.quantity_rules).map(quantityRule),
        notional_rules: array(value.notional_rules).map(notionalRule),
    };
}
export function parseTradingFee(input: unknown, identity: TradeIdentity): TradingFee {
    const value = object(input);
    const source = identity.exchange_name === 'binance' ? 'binance_commission_rate' : 'kraken_trade_volume';
    if (value.exchange_name !== identity.exchange_name || value.market !== 'future' || identity.market !== 'future'
        || value.mode !== (identity.is_live ? 'live' : 'sandbox') || value.symbol !== identity.symbol
        || value.source !== source || (value.rate_unit !== undefined && value.rate_unit !== 'fraction')
        || !Number.isSafeInteger(value.updated_at) || Number(value.updated_at) < 0) throw invalid();
    return { exchange_name: identity.exchange_name, market: 'future', mode: identity.is_live ? 'live' : 'sandbox',
        symbol: identity.symbol, source, rate_unit: 'fraction', updated_at: Number(value.updated_at),
        maker: decimal(value.maker), taker: decimal(value.taker) };
}
export function parsePositionEvidence(input: unknown, symbol: string): NonNullable<TradeData['position_evidence']> {
    return array(object(input).positions).map(object).filter(value => text(value.symbol) === symbol)
        .map(value => ({ symbol, hedged: nullableBoolean(value.hedged ?? null) }));
}
export function parseQuote(input: unknown, symbol: string, now: number): Quote {
    const value = object(object(input).ticker);
    if (value.symbol !== symbol) throw invalid();
    const price = (input: unknown) => {
        if (input === null || input === undefined) return null;
        if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) throw invalid();
        return String(input);
    };
    const bid = price(value.bid), ask = price(value.ask), last = price(value.last);
    if (bid && ask && Decimal.parse(bid).cmp(Decimal.parse(ask)) > 0) throw invalid();
    if (value.timestamp !== undefined && value.timestamp !== null && (!Number.isSafeInteger(value.timestamp) || Number(value.timestamp) < 0)) throw invalid();
    return { ticker: { symbol, bid, ask, last, timestamp: value.timestamp == null ? null : Number(value.timestamp) }, observed_at: now };
}
