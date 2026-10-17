import type { MarketInfo, TradeData, TradeIdentity, TradingFee, TradeParameters, TradeRequest } from '../../src/crypto/trading/types';

export const orderIdentity: TradeIdentity = { exchange_name: 'binance', market: 'future', is_live: false, symbol: 'BTC/USDT:USDT' };
const known = (value: string) => ({ status: 'known', value } as const);
const unknown = () => ({ status: 'unknown', value: null } as const);
export const orderParameters: TradeParameters = {
    timeframe: '30m', atr_period: 14, risk_amount: '1', atr_multiplier: '2', risk_tolerance: '0.05',
    atr_tolerance: '0.05', take_profit_multiplier: '1',
};
// 保留真实路由中的未知规则，不能将此样本冒充完整预检已通过。
export function orderMarket(): MarketInfo {
    return { symbol: orderIdentity.symbol, base: 'BTC', quote: 'USDT', settle: 'USDT', swap: true, linear: true,
        inverse: false, active: true, amount_unit: 'contracts', contract_size_currency: 'BTC', contract_size_decimal: '1',
        contract_size: 1, precision_amount: 0.001, min_amount: 0.001, leverage: null,
        price_rules: { step_size: known('0.1'), grid_origin: known('0'), minimum: known('0'), maximum: known('1000000') },
        quantity_rules: [
            { source: 'LOT_SIZE', order_types: ['limit', 'market', 'stop_market', 'take_profit_market'], applies_to_reduce_only: true,
                step_size: known('0.001'), grid_origin: known('0.001'), minimum: known('0.001'), maximum: known('100') },
            { source: 'MARKET_LOT_SIZE', order_types: ['market'], applies_to_reduce_only: true,
                step_size: known('0.001'), grid_origin: known('0.001'), minimum: known('0.001'), maximum: known('10') },
        ],
        notional_rules: [
            { source: 'MIN_NOTIONAL', order_types: ['limit'], applies_to_reduce_only: false, minimum: known('5'), maximum: unknown(), currency: 'USDT', price_reference: 'order_price' },
            { source: 'MIN_NOTIONAL', order_types: ['market'], applies_to_reduce_only: false, minimum: known('5'), maximum: unknown(), currency: 'USDT', price_reference: 'mark_price' },
            { source: 'unavailable', order_types: ['stop_market', 'take_profit_market'], applies_to_reduce_only: null, minimum: unknown(), maximum: unknown(), currency: 'USDT', price_reference: 'unknown' },
        ],
    };
}
export function orderFee(): TradingFee {
    return { exchange_name: 'binance', market: 'future', mode: 'sandbox', symbol: orderIdentity.symbol,
        maker: '0.0002', taker: '0.0004', rate_unit: 'fraction', source: 'binance_commission_rate', updated_at: 1792230000000 };
}
// 请求形状样本用于校验，不表示当前市场能够通过其全部准入。
export function orderRequest(now = Date.now()): TradeRequest {
    return { ...orderIdentity, request_id: '11111111-1111-4111-8111-111111111111', mode: 'fixed-risk-atr', side: 'buy', order_type: 'market',
        parameters: { ...orderParameters }, atr_snapshot: { value: '100', bar_time: 1792229400000, history_bars: 1000 },
        quote_snapshot: { ticker: { symbol: orderIdentity.symbol, last: '10000', ask: null, bid: null, timestamp: null }, observed_at: now },
        expected: { amount: '0.0045', stop_price: '9800', take_profit_price: '10200', estimated_risk: '0.9891' } };
}
export function orderData(): TradeData {
    return { market_info: orderMarket(), trading_fee: orderFee(), position_evidence: [], warnings: [], observed_at: Date.now() };
}
export function arithmeticData(): TradeData {
    const value = orderData();
    value.trading_fee.taker = '0.001';
    value.market_info.precision_amount = 0.0001; value.market_info.min_amount = 0.0001;
    for (const rule of value.market_info.quantity_rules) {
        rule.step_size = known('0.0001'); rule.minimum = known('0.0001'); rule.grid_origin = known('0');
    }
    return value;
}
