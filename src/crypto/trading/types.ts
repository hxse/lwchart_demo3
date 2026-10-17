import type { CcxtDefaults, Timeframe } from '../options';

export type TradeIdentity = CcxtDefaults;
export type Side = 'buy' | 'sell';
export type LegName = 'entry' | 'stop_loss' | 'take_profit';
export type OrderKind = 'limit' | 'market' | 'stop_market' | 'take_profit_market';
export interface RuleValue {
    status: 'known' | 'unknown' | 'not_applicable' | 'unbounded';
    value: string | null;
}
export interface PriceRules {
    step_size: RuleValue;
    minimum: RuleValue;
    maximum: RuleValue;
    grid_origin: RuleValue;
}
export interface QuantityRule extends PriceRules {
    source: string;
    order_types: OrderKind[];
    applies_to_reduce_only: boolean | null;
}
export interface NotionalRule {
    source: string;
    order_types: OrderKind[];
    applies_to_reduce_only: boolean | null;
    minimum: RuleValue;
    maximum: RuleValue;
    currency: string | null;
    price_reference: 'order_price' | 'mark_price' | 'unknown';
}
export interface MarketInfo {
    symbol: string;
    base: string | null;
    quote: string | null;
    settle: string | null;
    swap: boolean | null;
    linear: boolean | null;
    inverse: boolean | null;
    active: boolean | null;
    amount_unit: 'contracts' | 'base';
    contract_size_decimal: string | null;
    contract_size_currency: string | null;
    contract_size: number | null;
    precision_amount: number | null;
    min_amount: number | null;
    leverage: number | null;
    price_rules: PriceRules;
    quantity_rules: QuantityRule[];
    notional_rules: NotionalRule[];
}
export interface TradingFee {
    exchange_name: 'binance' | 'kraken';
    market: 'future';
    mode: 'live' | 'sandbox';
    symbol: string;
    maker: string;
    taker: string;
    rate_unit: 'fraction';
    source: 'binance_commission_rate' | 'kraken_trade_volume';
    updated_at: number;
}
export interface TradeData {
    market_info: MarketInfo;
    trading_fee: TradingFee;
    position_evidence: Array<{ symbol: string; hedged: boolean | null }> | null;
    warnings: Warning[];
    observed_at: number;
}
export interface Ticker {
    symbol: string;
    last: string | null;
    bid: string | null;
    ask: string | null;
    timestamp: number | null;
}
export interface Quote { ticker: Ticker; observed_at: number }
export interface TradeParameters {
    timeframe: Timeframe;
    atr_period: number;
    risk_amount: string;
    atr_multiplier: string;
    risk_tolerance: string;
    atr_tolerance: string;
    take_profit_multiplier: string;
}
export interface AtrSnapshot { value: string; bar_time: number; history_bars: number }
export interface ExpectedPlan { amount: string; stop_price: string; take_profit_price: string; estimated_risk: string }
export interface TradeRequest extends TradeIdentity {
    request_id: string;
    mode: 'fixed-risk-atr';
    side: Side;
    order_type: 'market';
    parameters: TradeParameters;
    atr_snapshot: AtrSnapshot;
    quote_snapshot: Quote;
    expected: ExpectedPlan;
}
export interface Warning { code: string; message: string }
export interface TradePlan extends ExpectedPlan {
    contract_size: string;
    risk_currency: string;
    entry_price: string;
    opening_fee: string;
    opening_fee_source: 'estimated' | 'reported';
    estimated_stop_fee: string;
    estimated_take_profit_fee: string;
    estimated_take_profit_net: string;
}
export interface Preview {
    plan: TradePlan;
    base_amount: string;
    price_risk: string;
    risk_error: string;
    atr_error: string;
    atr_multiple: string;
    take_profit_multiple: string;
    quote_source: 'ask' | 'bid' | 'last';
    warnings: Warning[];
}
export type Confirmation = 'unconfirmed' | 'unfilled' | 'partially_filled' | 'filled' | 'open' | 'canceled' | 'closed' | 'rejected' | 'expired';
export interface Observation {
    confirmation: Confirmation;
    client_order_id: string;
    order_id: string | null;
    filled: string | null;
    average: string | null;
    error: Warning | null;
}
export interface LegResult extends Observation { write_state: 'not_sent' | 'rejected' | 'accepted' | 'unknown' }
export interface PositionRecord {
    side: 'long' | 'short' | null; contracts: string | null; entry_price: string | null;
}
export interface PositionSnapshot { identity: TradeIdentity; checked_at: number; positions: PositionRecord[] }
export interface Verification {
    checked_at: number;
    positions: PositionRecord[] | null;
    issues: Warning[];
}
export interface ExecutionResult {
    request_id: string;
    identity: TradeIdentity;
    submitted_plan: TradePlan | null;
    legs: Record<LegName, LegResult>;
    verification: Verification;
    warnings: Warning[];
}
export interface CheckRequest extends TradeIdentity {
    request_id: string;
    orders: Record<LegName, string | null>;
}
export interface CheckResult {
    request_id: string;
    identity: TradeIdentity;
    observations: Record<LegName, Observation>;
    verification: Verification;
}
export class TradingError extends Error {
    constructor(readonly code: string, message: string, readonly status = 503) { super(message); }
}
