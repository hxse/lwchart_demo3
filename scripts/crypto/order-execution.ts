import { BackendWriteError } from './backend';
import { OrderSession, readTradeData, safeIssue } from './order-data';
import { OrderQueries } from './order-query';
import { clientOrderIds as clientIds, orderLegs as legs } from '../../src/crypto/trading/identity';
import { feeInQuote, isTerminal, mergeFacts, observe, orderFacts, withTrades, type OrderFacts } from './order-facts';
import { Decimal, zero } from '../../src/crypto/trading/decimal';
import { calculatePreview, calculateProtection } from '../../src/crypto/trading/calculate';
import { assertFreshQuote, identityOf } from '../../src/crypto/trading/validation';
import { object } from '../../src/crypto/trading/wire';
import { TradingError, type ExecutionResult, type LegName, type LegResult, type TradeRequest } from '../../src/crypto/trading/types';

function sameNumber(a: string | null, b: string) { return a !== null && Decimal.parse(a).cmp(Decimal.parse(b)) === 0; }
export async function executeOrder(session: OrderSession, request: TradeRequest): Promise<ExecutionResult> {
    assertFreshQuote(request.quote_snapshot, Date.now());
    const data = await readTradeData(session);
    const preview = calculatePreview(data, request, request.parameters, request.atr_snapshot.value, request.quote_snapshot, request.side);
    for (const key of ['amount', 'stop_price', 'take_profit_price', 'estimated_risk'] as const) {
        if (!sameNumber(preview.plan[key], request.expected[key])) throw new TradingError('TRADE_PLAN_CHANGED', '规则或费率已变化，请刷新预览后重新选择', 409);
    }
    assertFreshQuote(request.quote_snapshot, Date.now());
    const ids = clientIds(request.request_id), identity = identityOf(request);
    const result: ExecutionResult = { request_id: request.request_id, identity, submitted_plan: null,
        legs: Object.fromEntries(legs.map(leg => [leg, { ...observe(null, ids[leg], leg), write_state: 'not_sent' }])) as Record<LegName, LegResult>,
        verification: { checked_at: Date.now(), positions: null, issues: [] }, warnings: [...preview.warnings] };
    const facts: Record<LegName, OrderFacts | null> = { entry: null, stop_loss: null, take_profit: null };
    const provider = identity.exchange_name === 'binance' ? { positionSide: 'BOTH' } : {};
    const opposite = request.side === 'buy' ? 'sell' : 'buy';
    const applyFacts = (leg: LegName, value: OrderFacts) => {
        if (value.symbol !== identity.symbol || value.clientId && value.clientId !== ids[leg]) throw new TradingError('ORDER_IDENTITY_MISMATCH', '回执身份与本次订单不一致');
        facts[leg] = mergeFacts(facts[leg], value);
        const old = result.legs[leg];
        result.legs[leg] = { ...observe(facts[leg], ids[leg], leg), write_state: old.write_state === 'unknown' ? 'accepted' : old.write_state };
    };
    async function write(leg: LegName, method: string, body: Record<string, unknown>) {
        const output = result.legs[leg];
        try {
            const reply = await session.write(method, { ...identity, ...provider, ...body, clientOrderId: ids[leg] });
            const raw = object(object(reply).order);
            if (typeof raw.id === 'string' && raw.id) output.order_id = raw.id;
            output.write_state = 'accepted';
            applyFacts(leg, orderFacts(raw));
            const value = facts[leg]!;
            if (value.status === 'rejected' && (!value.filled || Decimal.parse(value.filled).cmp(zero) === 0)) {
                result.legs[leg].write_state = 'rejected';
                result.legs[leg].error = { code: 'ORDER_REJECTED', message: '交易所回执明确拒绝该订单' };
            }
        } catch (error) {
            result.legs[leg].write_state = error instanceof BackendWriteError ? error.writeState : 'unknown';
            result.legs[leg].error = safeIssue(error);
        }
    }
    const finalize = async () => {
        const query = new OrderQueries(session);
        const verification = query.verification();
        await Promise.all(legs.map(async leg => {
            if (!['accepted', 'unknown'].includes(result.legs[leg].write_state)) return;
            try {
                const current = await query.find(result.legs[leg].order_id, ids[leg]);
                if (current) applyFacts(leg, current);
                else if (leg !== 'entry' || !facts[leg]) {
                    result.legs[leg].confirmation = 'unconfirmed';
                    result.legs[leg].error = { code: 'ORDER_NOT_FOUND', message: '此次核对未找到订单，保留原始回执，请手动检查' };
                }
                if (leg !== 'entry' && facts[leg] && result.submitted_plan) {
                    const value = facts[leg]!, plan = result.submitted_plan;
                    const price = leg === 'stop_loss' ? plan.stop_price : plan.take_profit_price;
                    if (value.side !== opposite || !sameNumber(value.amount, plan.amount) || !sameNumber(value.trigger, price) || value.reduceOnly !== true) {
                        result.legs[leg].confirmation = 'unconfirmed';
                        result.legs[leg].error = { code: 'PROTECTION_UNCONFIRMED', message: '保护单方向、数量、触发价或只减仓属性未完整确认，请手动核对' };
                    }
                }
            } catch (error) {
                result.legs[leg].error = safeIssue(error);
                if (safeIssue(error).code === 'ORDER_FACTS_CONFLICT' || leg !== 'entry' && (!facts[leg] || !isTerminal(facts[leg]!))) result.legs[leg].confirmation = 'unconfirmed';
            }
        }));
        result.verification = await verification;
        if (['filled', 'partially_filled'].includes(result.legs.entry.confirmation)
            && result.legs.stop_loss.write_state === 'not_sent' && result.legs.take_profit.write_state === 'not_sent') {
            result.warnings = result.warnings.filter(w => w.code !== 'ENTRY_UNCONFIRMED');
            if (!result.warnings.some(w => w.code === 'PROTECTION_NOT_SENT')) result.warnings.push({ code: 'PROTECTION_NOT_SENT', message: '查询已发现入场成交，本轮未继续挂保护，请手动处理' });
        }
        const stop = result.legs.stop_loss.confirmation, takeProfit = result.legs.take_profit.confirmation;
        if (stop === 'filled' && takeProfit === 'open' || takeProfit === 'filled' && stop === 'open') {
            result.warnings.push({ code: 'REMAINING_PROTECTION', message: '一张保护单已成交，另一张仍挂着，请手动检查剩余订单' });
        }
        return result;
    };

    await write('entry', 'create_market_order', { side: request.side, amount: preview.plan.amount });
    if (['rejected', 'not_sent'].includes(result.legs.entry.write_state)) return finalize();
    let entry = facts.entry;
    if (!entry || !isTerminal(entry) || entry.filled === null || !entry.average || !entry.side) {
        try {
            const current = await new OrderQueries(session).find(result.legs.entry.order_id, ids.entry);
            if (current) applyFacts('entry', current);
            entry = facts.entry;
            if (entry && entry.filled && Decimal.parse(entry.filled).cmp(zero) > 0 && (!entry.average || !entry.side)) {
                applyFacts('entry', withTrades(entry, await session.read('fetch_my_trades', { limit: '1000' }), data.market_info.quote!));
            }
        } catch (error) { result.legs.entry.error = safeIssue(error); }
        entry = facts.entry;
    }
    if (entry && isTerminal(entry) && entry.filled !== null && Decimal.parse(entry.filled).cmp(zero) === 0) return finalize();
    if (!entry || !isTerminal(entry) || !entry.filled || Decimal.parse(entry.filled).cmp(zero) <= 0 || !entry.average || entry.side !== request.side) {
        result.warnings.push({ code: 'ENTRY_UNCONFIRMED', message: '入场最终成交数量或均价尚未确认，保护未提交，请手动核对；本流程不会重试' });
        return finalize();
    }
    if (Decimal.parse(entry.filled).cmp(Decimal.parse(preview.plan.amount)) < 0) result.warnings.push({ code: 'PARTIAL_FILL', message: '入场部分成交，仅保护已确认的成交数量，不自动补足' });
    try {
        const protection = calculateProtection(data, request, request.parameters, request.atr_snapshot.value, request.side,
            entry.filled, entry.average, feeInQuote(entry.fee, data.market_info.quote!));
        result.submitted_plan = protection.plan;
        result.warnings = [...new Map([...result.warnings, ...protection.warnings].map(w => [w.code, w])).values()];
    } catch (error) {
        const issue = safeIssue(error);
        result.warnings.push({ code: 'PROTECTION_NOT_SENT', message: `入场已成交，保护未提交：${issue.message}；请手动处理` });
        result.legs.stop_loss.error = issue; result.legs.take_profit.error = issue;
        return finalize();
    }
    const plan = result.submitted_plan;
    const trigger = identity.exchange_name === 'binance' ? { workingType: 'CONTRACT_PRICE' } : { triggerSignal: 'last' };
    await Promise.allSettled([
        write('stop_loss', 'create_stop_market_order', { side: opposite, amount: plan.amount, triggerPrice: plan.stop_price, reduceOnly: true, ...trigger }),
        write('take_profit', 'create_take_profit_market_order', { side: opposite, amount: plan.amount, triggerPrice: plan.take_profit_price, reduceOnly: true, ...trigger }),
    ]);
    return finalize();
}
