import { Decimal, one, zero } from './decimal';
import { gridValue, inBounds, upperIndex } from './grid';
import type { ResolvedRules } from './rules';
import { TradingError, type Preview, type Side, type TradeParameters, type TradePlan } from './types';

export interface RiskInput { rules: ResolvedRules; parameters: TradeParameters; atr: Decimal; entry: Decimal; side: Side }
export interface Candidate { amount: Decimal; stop: Decimal; takeProfit: Decimal; risk: Decimal; distanceError: Decimal; riskError: Decimal }
/** 以该计划的入场价估算名义价值，不代替交易所指定参考价的额度预检。 */
export function planNotionalValue(plan: Pick<TradePlan, 'amount' | 'contract_size' | 'entry_price'>): string {
    return Decimal.parse(plan.amount).mul(Decimal.parse(plan.contract_size)).mul(Decimal.parse(plan.entry_price)).toString();
}
export function unitRisk(input: RiskInput, stop: Decimal) {
    const { entry, rules } = input;
    return entry.sub(stop).abs().add(entry.mul(rules.fee)).add(stop.mul(rules.fee)).mul(rules.size);
}
export function targetStop(input: RiskInput) {
    const distance = input.atr.mul(Decimal.parse(input.parameters.atr_multiplier));
    return input.side === 'buy' ? input.entry.sub(distance) : input.entry.add(distance);
}
export function profitTarget(input: RiskInput, stop: Decimal) {
    const distance = input.entry.sub(stop).abs().mul(Decimal.parse(input.parameters.take_profit_multiplier));
    return input.side === 'buy' ? input.entry.add(distance) : input.entry.sub(distance);
}
export function takeProfits(input: RiskInput, stop: Decimal) {
    const target = profitTarget(input, stop), grid = input.rules.price;
    const index = upperIndex(grid, target);
    return [gridValue(grid, index), gridValue(grid, index + 1n)]
        .filter(value => inBounds(value, input.rules.priceBounds) && (input.side === 'buy' ? value.cmp(input.entry) > 0 : value.cmp(input.entry) < 0))
        .sort((a, b) => a.sub(target).abs().cmp(b.sub(target).abs()) || b.sub(input.entry).abs().cmp(a.sub(input.entry).abs()));
}
export function prefer(a: Candidate, b: Candidate | null, budget: Decimal) {
    if (!b) return true;
    return (a.distanceError.cmp(b.distanceError) || a.riskError.cmp(b.riskError)
        || Number(a.risk.cmp(budget) > 0) - Number(b.risk.cmp(budget) > 0)
        || a.amount.cmp(b.amount) || a.stop.cmp(b.stop)) < 0;
}
export function describePlan(input: RiskInput, candidate: Candidate, source: Preview['quote_source'], openingFee?: Decimal): Preview {
    const { rules, entry, atr, parameters } = input;
    const { amount, stop, takeProfit } = candidate;
    const base = amount.mul(rules.size), distance = entry.sub(stop).abs();
    const priceRisk = base.mul(distance);
    const open = openingFee ?? base.mul(entry).mul(rules.fee);
    const stopFee = base.mul(stop).mul(rules.fee), profitFee = base.mul(takeProfit).mul(rules.fee);
    const risk = priceRisk.add(open).add(stopFee), budget = Decimal.parse(parameters.risk_amount);
    const atrMultiple = distance.div(atr), targetMultiple = Decimal.parse(parameters.atr_multiplier);
    const netProfit = base.mul(takeProfit.sub(entry).abs()).sub(open).sub(profitFee);
    const warnings = [...rules.warnings];
    if (netProfit.cmp(zero) <= 0) warnings.push({ code: 'NON_POSITIVE_TAKE_PROFIT', message: '预计止盈扣费后收益不为正，请留意止盈倍数' });
    return { plan: { amount: amount.toString(), contract_size: rules.size.toString(), risk_currency: rules.currency,
        entry_price: entry.toString(), stop_price: stop.toString(), take_profit_price: takeProfit.toString(), estimated_risk: risk.toString(),
        opening_fee: open.toString(), opening_fee_source: openingFee === undefined ? 'estimated' : 'reported', estimated_stop_fee: stopFee.toString(),
        estimated_take_profit_fee: profitFee.toString(), estimated_take_profit_net: netProfit.toString() },
        base_amount: base.toString(), price_risk: priceRisk.toString(), risk_error: risk.sub(budget).abs().div(budget).toString(),
        atr_error: atrMultiple.div(targetMultiple).sub(one).abs().toString(), atr_multiple: atrMultiple.toString(),
        take_profit_multiple: takeProfit.sub(entry).abs().div(distance).toString(), quote_source: source, warnings };
}
export const noPlan = () => new TradingError('NO_FEASIBLE_ORDER', '当前参数没有同时满足数量、价格规则和两项容差的订单', 422);
