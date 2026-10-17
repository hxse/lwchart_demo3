import { Decimal, zero } from '../../src/crypto/trading/decimal';
import { array, object, text } from '../../src/crypto/trading/wire';
import { TradingError, type Confirmation, type LegName, type Observation, type Side } from '../../src/crypto/trading/types';

export interface OrderFacts {
    id: string; clientId: string | null; symbol: string; side: Side | null; status: string | null;
    amount: string | null; filled: string | null; average: string | null; trigger: string | null;
    reduceOnly: boolean | null; fee: unknown;
}
const invalid = () => new TradingError('BACKEND_INVALID_RESPONSE', '订单或成交字段无效，不能确认交易结果', 502);
export function numeric(value: unknown, positive = false): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid();
    if (positive && value === 0) return null;
    return String(value);
}
export function orderFacts(input: unknown): OrderFacts {
    const value = object(input);
    if (value.status !== null && typeof value.status !== 'string') throw invalid();
    if (value.side != null && value.side !== 'buy' && value.side !== 'sell') throw invalid();
    if (value.reduceOnly != null && typeof value.reduceOnly !== 'boolean') throw invalid();
    const amount = numeric(value.amount), filled = numeric(value.filled);
    if (amount && filled && Decimal.parse(filled).cmp(Decimal.parse(amount)) > 0) throw invalid();
    return { id: text(value.id), symbol: text(value.symbol), clientId: value.clientOrderId == null ? null : text(value.clientOrderId),
        side: (value.side ?? null) as Side | null, status: value.status as string | null, amount, filled,
        average: numeric(value.average, true), trigger: numeric(value.triggerPrice, true), reduceOnly: (value.reduceOnly ?? null) as boolean | null, fee: value.fee };
}
export function mergeFacts(old: OrderFacts | null, next: OrderFacts): OrderFacts {
    if (!old || old.id !== next.id) return next;
    if (old.symbol !== next.symbol || old.side && next.side && old.side !== next.side
        || isTerminal(old) && old.filled !== null && next.filled !== null && old.filled !== next.filled) {
        throw new TradingError('ORDER_FACTS_CONFLICT', '同一订单的方向或最终成交数量出现矛盾，请手动核对');
    }
    const changedFill = next.filled !== null && next.filled !== old.filled;
    return { ...next, clientId: next.clientId ?? old.clientId, side: next.side ?? old.side, status: next.status ?? old.status,
        amount: next.amount ?? old.amount, filled: next.filled ?? old.filled, average: next.average ?? (changedFill ? null : old.average),
        trigger: next.trigger ?? old.trigger, reduceOnly: next.reduceOnly ?? old.reduceOnly, fee: next.fee ?? (changedFill ? null : old.fee) };
}
export function feeInQuote(input: unknown, currency: string): string | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const fee = input as Record<string, unknown>;
    if (fee.currency !== currency || !['number', 'string'].includes(typeof fee.cost)) return undefined;
    try { return Decimal.parse(String(fee.cost)).toString(); } catch { return undefined; }
}
export function withTrades(facts: OrderFacts, input: unknown, currency: string): OrderFacts {
    if (facts.filled === null || Decimal.parse(facts.filled).cmp(zero) <= 0) return facts;
    const matches = array(object(input).trades).map(object).filter(trade => trade.order === facts.id && trade.symbol === facts.symbol);
    const seen = new Set<string>();
    let quantity = zero, cost = zero, fees = zero, completeFees = true, side = facts.side;
    for (const trade of matches) {
        const id = text(trade.id);
        if (seen.has(id)) continue;
        seen.add(id);
        if (trade.side !== 'buy' && trade.side !== 'sell' || side && trade.side !== side) throw invalid();
        side = trade.side as Side;
        const amount = numeric(trade.amount, true), price = numeric(trade.price, true);
        if (!amount || !price) throw invalid();
        quantity = quantity.add(Decimal.parse(amount)); cost = cost.add(Decimal.parse(amount).mul(Decimal.parse(price)));
        const fee = feeInQuote(trade.fee, currency);
        if (fee === undefined) completeFees = false;
        else fees = fees.add(Decimal.parse(fee));
    }
    if (quantity.cmp(Decimal.parse(facts.filled)) !== 0) return facts;
    return { ...facts, side, average: facts.average ?? cost.div(quantity).toString(),
        fee: feeInQuote(facts.fee, currency) !== undefined ? facts.fee : completeFees ? { cost: fees.toString(), currency } : facts.fee };
}
export function isTerminal(facts: OrderFacts) { return ['closed', 'canceled', 'expired', 'rejected'].includes(facts.status ?? ''); }
export function confirmation(facts: OrderFacts, leg: LegName): Confirmation {
    if (facts.status === 'open') return 'open';
    if (!isTerminal(facts)) return 'unconfirmed';
    if (facts.filled !== null) {
        const filled = Decimal.parse(facts.filled);
        if (filled.cmp(zero) > 0) {
            if (leg === 'entry' && (!facts.average || !facts.side)) return 'unconfirmed';
            return facts.amount && filled.cmp(Decimal.parse(facts.amount)) < 0 ? 'partially_filled' : 'filled';
        }
        if (leg === 'entry') return 'unfilled';
    }
    if (leg === 'entry') return 'unconfirmed';
    return facts.status as Confirmation;
}
export function observe(facts: OrderFacts | null, clientId: string, leg: LegName, fallbackId: string | null = null): Observation {
    return { confirmation: facts ? confirmation(facts, leg) : 'unconfirmed', order_id: facts?.id ?? fallbackId,
        client_order_id: clientId, filled: facts?.filled ?? null, average: facts?.average ?? null, error: null };
}
