import { Decimal, maxDecimal, minDecimal, numberPreserves, one, zero } from './decimal';
import { gridInterval, gridValue, inBounds, lowerIndex, onGrid, upperIndex } from './grid';
import { combinedQuantity, resolveRules } from './rules';
import { describePlan, noPlan, prefer, profitTarget, takeProfits, targetStop, unitRisk, type Candidate, type RiskInput } from './risk-model';
import { TradingError, type Preview, type Quote, type Side, type TradeData, type TradeIdentity, type TradeParameters } from './types';

const clampIndex = (n: bigint, lo: bigint, hi: bigint) => n < lo ? lo : n > hi ? hi : n;
function stopInterval(input: RiskInput): [bigint, bigint] {
    const { atr, entry, rules, parameters, side } = input;
    const distance = atr.mul(Decimal.parse(parameters.atr_multiplier)), tolerance = Decimal.parse(parameters.atr_tolerance);
    const near = distance.mul(one.sub(tolerance)), far = distance.mul(one.add(tolerance));
    let low = side === 'buy' ? entry.sub(far) : entry.add(near);
    let high = side === 'buy' ? entry.sub(near) : entry.add(far);
    low = maxDecimal(low, rules.priceBounds.minimum);
    if (rules.priceBounds.maximum) high = minDecimal(high, rules.priceBounds.maximum);
    const a = lowerIndex(rules.price, low), b = upperIndex(rules.price, zero) + 1n;
    const lo = a > b ? a : b, hi = upperIndex(rules.price, high);
    if (lo > hi) throw noPlan();
    return [lo, hi];
}
function solve(input: RiskInput, filled?: Decimal): Candidate {
    const { rules, parameters } = input;
    const quantity = combinedQuantity(rules, filled !== undefined);
    if (filled && (!inBounds(filled, quantity.bounds) || !onGrid(filled, quantity.grid))) throw new TradingError('INVALID_PROTECTION_AMOUNT', '实际成交数量不符合已知保护单数量规则', 422);
    const budget = Decimal.parse(parameters.risk_amount), tolerance = Decimal.parse(parameters.risk_tolerance);
    const minimumRisk = budget.mul(one.sub(tolerance)), maximumRisk = budget.mul(one.add(tolerance));
    const target = targetStop(input), priceGrid = rules.price;
    const pending: Array<[bigint, bigint]> = [stopInterval(input)];
    let best: Candidate | null = null;
    const distanceTo = ([lo, hi]: [bigint, bigint]) => maxDecimal(gridValue(priceGrid, lo).sub(target), maxDecimal(target.sub(gridValue(priceGrid, hi)), zero));
    const quantityInterval = (low: Decimal, high: Decimal) => {
        low = maxDecimal(low, quantity.bounds.minimum);
        if (quantity.bounds.maximum) high = minDecimal(high, quantity.bounds.maximum);
        const interval = gridInterval(quantity.grid, low, high);
        if (!interval) return null;
        const positive = upperIndex(quantity.grid, zero) + 1n;
        interval[0] = interval[0] > positive ? interval[0] : positive;
        return interval[0] <= interval[1] ? interval : null;
    };
    while (pending.length) {
        // 区间二分及不可行范围剪枝，不分配整个价格网格数组。
        pending.sort((a, b) => distanceTo(b).cmp(distanceTo(a)));
        const segment = pending.pop()!;
        if (best && distanceTo(segment).cmp(best.distanceError) > 0) continue;
        const [lo, hi] = segment;
        const left = gridValue(priceGrid, lo), right = gridValue(priceGrid, hi);
        const profitLeft = profitTarget(input, left), profitRight = profitTarget(input, right);
        if (maxDecimal(profitLeft, profitRight).add(priceGrid.step).cmp(maxDecimal(rules.priceBounds.minimum, zero)) <= 0) continue;
        if (rules.priceBounds.maximum && minDecimal(profitLeft, profitRight).sub(priceGrid.step).cmp(rules.priceBounds.maximum) > 0) continue;
        if (!filled) {
            const first = unitRisk(input, left), last = unitRisk(input, right);
            const minRisk = minDecimal(first, last), maxRisk = maxDecimal(first, last);
            if (maxRisk.cmp(zero) <= 0) continue;
            if (minRisk.cmp(zero) > 0 && !quantityInterval(minimumRisk.div(maxRisk), maximumRisk.div(minRisk))) continue;
        }
        const mid = (lo + hi) >> 1n;
        const stop = gridValue(priceGrid, mid), profit = takeProfits(input, stop)[0];
        const cost = unitRisk(input, stop);
        if (profit && (filled || cost.cmp(zero) > 0)) {
            let quantities: Decimal[] = filled ? [filled] : [];
            if (!filled) {
                const interval = quantityInterval(minimumRisk.div(cost), maximumRisk.div(cost));
                if (interval) {
                    const ideal = budget.div(cost).sub(quantity.grid.origin).div(quantity.grid.step).floor();
                    quantities = [gridValue(quantity.grid, clampIndex(ideal, ...interval)), gridValue(quantity.grid, clampIndex(ideal + 1n, ...interval))];
                }
            }
            for (const amount of quantities) {
                const risk = amount.mul(cost);
                const candidate = { amount, stop, takeProfit: profit, risk, distanceError: stop.sub(target).abs(), riskError: risk.sub(budget).abs() };
                if (prefer(candidate, best, budget)) best = candidate;
            }
        }
        if (lo < mid) pending.push([lo, mid - 1n]);
        if (mid < hi) pending.push([mid + 1n, hi]);
    }
    if (!best) throw noPlan();
    if (![best.amount, best.stop, best.takeProfit].every(numberPreserves)) throw new TradingError('NO_FEASIBLE_ORDER', '计划精度无法通过后端 number 接口完整保留', 422);
    return best;
}
export function quotePrice(quote: Quote, side: Side): { price: Decimal; source: Preview['quote_source'] } {
    const source = side === 'buy' && quote.ticker.ask ? 'ask' : side === 'sell' && quote.ticker.bid ? 'bid' : 'last';
    const value = quote.ticker[source];
    if (!value) throw new TradingError('TRADE_DATA_UNAVAILABLE', '当前方向没有有效参考报价');
    return { price: Decimal.parse(value), source };
}
export function calculatePreview(data: TradeData, identity: TradeIdentity, parameters: TradeParameters, atr: string, quote: Quote, side: Side): Preview {
    const rules = resolveRules(data, identity), reference = quotePrice(quote, side);
    const input = { rules, parameters, atr: Decimal.parse(atr), entry: reference.price, side };
    if (input.atr.cmp(zero) <= 0 || input.entry.cmp(zero) <= 0) throw new TradingError('TRADE_DATA_UNAVAILABLE', 'ATR 或参考报价不可用');
    return describePlan(input, solve(input), reference.source);
}
export function calculateProtection(data: TradeData, identity: TradeIdentity, parameters: TradeParameters, atr: string, side: Side,
    filled: string, average: string, openingFee?: string): Preview {
    const input = { rules: resolveRules(data, identity), parameters, atr: Decimal.parse(atr), entry: Decimal.parse(average), side };
    const preview = describePlan(input, solve(input, Decimal.parse(filled)), 'last', openingFee === undefined ? undefined : Decimal.parse(openingFee));
    const budget = Decimal.parse(parameters.risk_amount);
    if (Decimal.parse(preview.plan.estimated_risk).sub(budget).abs().cmp(budget.mul(Decimal.parse(parameters.risk_tolerance))) > 0) {
        preview.warnings.push({ code: 'FILLED_RISK_CHANGED', message: '实际成交后的预计风险超出金额容差，已按实际数量生成保护，请手动核对' });
    }
    return preview;
}
