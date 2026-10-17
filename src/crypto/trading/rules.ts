import { Decimal, zero } from './decimal';
import { intersectBounds, intersectGrids, type Bounds, type Grid } from './grid';
import { TradingError, type LegName, type PriceRules, type RuleValue, type TradeData, type TradeIdentity, type Warning } from './types';

export interface QuantityConstraints { grid: Grid; bounds: Bounds }
export interface ResolvedRules {
    price: Grid;
    priceBounds: Bounds;
    quantity: Record<LegName, QuantityConstraints>;
    size: Decimal;
    fee: Decimal;
    currency: string;
    warnings: Warning[];
}
const unavailable = (message: string) => new TradingError('TRADE_DATA_UNAVAILABLE', message);
export function assertTradeScope(identity: TradeIdentity) {
    if (identity.market !== 'future') throw new TradingError('NOT_SUPPORTED', '首版仅支持线性永续合约，暂不支持现货', 422);
    if (identity.exchange_name === 'kraken' && !identity.is_live) throw new TradingError('NOT_SUPPORTED', 'Kraken 模拟盘没有可用账户费率，本模式暂不支持', 422);
}
export function resolveRules(data: TradeData, identity: TradeIdentity): ResolvedRules {
    assertTradeScope(identity);
    const market = data.market_info, fee = data.trading_fee;
    if (market.symbol !== identity.symbol || fee.symbol !== identity.symbol || fee.exchange_name !== identity.exchange_name
        || fee.market !== 'future' || fee.mode !== (identity.is_live ? 'live' : 'sandbox') || fee.rate_unit !== 'fraction') throw unavailable('交易资料身份不一致');
    if (market.swap !== true || market.linear !== true || market.inverse !== false || market.active !== true
        || market.amount_unit !== 'contracts' || !market.base || !market.quote || market.settle !== market.quote
        || market.contract_size_currency !== market.base) throw new TradingError('NOT_SUPPORTED', '需要已启用、以报价币结算的线性永续合约', 422);
    if (!market.contract_size_decimal) throw unavailable('合约乘数未知，无法计算数量');
    const size = Decimal.parse(market.contract_size_decimal);
    if (size.cmp(zero) <= 0) throw unavailable('合约乘数无效');
    const warnings = new Map<string, Warning>((data.warnings ?? []).map(w => [w.code, w]));
    const warn = (code: string, message: string) => warnings.set(code, { code, message });
    if (data.position_evidence?.some(p => p.hedged === true)) throw new TradingError('NOT_SUPPORTED', '首版不支持已确认的双向持仓模式', 422);
    if (!data.position_evidence?.length || data.position_evidence.some(p => p.hedged !== false)) {
        warn('POSITION_MODE_UNVERIFIED', '账户模式尚未确认，将按单向模式提交，由交易所接受或拒绝');
    }
    const known = (value: RuleValue) => value.status === 'known' && value.value !== null ? Decimal.parse(value.value) : null;
    const bounds = (rules: Pick<PriceRules, 'minimum' | 'maximum'>): Bounds => {
        if (rules.minimum.status === 'unknown' || rules.maximum.status === 'unknown') {
            warn('LIMITS_UNVERIFIED', '部分价格或数量上下限未公开，仅检查已知限制，最终由交易所校验');
        }
        return { minimum: known(rules.minimum) ?? zero, maximum: known(rules.maximum) };
    };
    const grid = (rules: PriceRules): Grid | null => {
        if (rules.step_size.status === 'not_applicable') return null;
        const step = known(rules.step_size), origin = known(rules.grid_origin);
        if (!step || !origin || step.cmp(zero) <= 0) throw unavailable('价格或数量步长／网格起点未知，无法保证精度');
        return { step, origin };
    };
    const price = grid(market.price_rules);
    if (!price) throw unavailable('市场没有本模式所需的固定价格网格');
    const quantity = {} as ResolvedRules['quantity'];
    for (const [leg, kind] of [['entry', 'market'], ['stop_loss', 'stop_market'], ['take_profit', 'take_profit_market']] as const) {
        const matches = market.quantity_rules.filter(rule => rule.order_types.includes(kind) && (leg === 'entry' || rule.applies_to_reduce_only !== false));
        const grids: Grid[] = [];
        let limits: Bounds = { minimum: zero, maximum: null };
        for (const rule of matches) {
            if (leg !== 'entry' && rule.applies_to_reduce_only === null) warn('REDUCE_ONLY_RULES_UNVERIFIED', '保护单部分规则的只减仓适用性未知，将保守满足已知数量约束');
            const value = grid(rule);
            if (value) grids.push(value);
            limits = intersectBounds(limits, bounds(rule));
        }
        if (!grids.length) throw unavailable('缺少入场或保护单的数量步长');
        const common = intersectGrids(grids);
        if (!common) throw new TradingError('NO_FEASIBLE_ORDER', '数量网格起点不相容，无法同时满足订单精度', 422);
        quantity[leg] = { grid: common, bounds: limits };
        for (const rule of market.notional_rules) {
            if (!rule.order_types.includes(kind) || leg !== 'entry' && rule.applies_to_reduce_only === false) continue;
            if (rule.minimum.status === 'known' || rule.maximum.status === 'known' || rule.minimum.status === 'unknown'
                || rule.maximum.status === 'unknown' || rule.applies_to_reduce_only === null) {
                warn('NOTIONAL_UNVERIFIED', '名义金额规则缺少可用的实际参考价或完整适用范围，未完成此项预检，由交易所最终校验');
            }
        }
    }
    const priceBounds = bounds(market.price_rules);
    return { price, priceBounds, quantity, size, fee: Decimal.parse(fee.taker), currency: market.quote, warnings: [...warnings.values()] };
}
export function combinedQuantity(rules: ResolvedRules, protectionOnly = false): QuantityConstraints {
    const legs: LegName[] = protectionOnly ? ['stop_loss', 'take_profit'] : ['entry', 'stop_loss', 'take_profit'];
    const grid = intersectGrids(legs.map(leg => rules.quantity[leg].grid));
    if (!grid) throw new TradingError('NO_FEASIBLE_ORDER', '入场与保护单的数量网格无法同时满足', 422);
    const bounds = legs.reduce((value, leg) => intersectBounds(value, rules.quantity[leg].bounds), { minimum: zero, maximum: null } as Bounds);
    return { grid, bounds };
}
