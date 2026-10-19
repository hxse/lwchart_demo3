import { positionKind, type CleanupOrder, type CleanupResult } from '../../src/crypto/trading/inspection';
import { TradingError } from '../../src/crypto/trading/types';
import { identityOf } from '../../src/crypto/trading/validation';
import { array, object } from '../../src/crypto/trading/wire';
import { BackendWriteError } from './backend';
import { OrderSession, safeIssue } from './order-data';
import { isTerminal, orderFacts, type OrderFacts } from './order-facts';
import { readPositions } from './order-query';

const conditionalTypes = new Set(['stop', 'stop_market', 'stop_loss', 'stop_loss_limit', 'take_profit',
    'take_profit_market', 'take_profit_limit', 'trailing_stop_market', 'stp', 'trailing_stop']);
async function openOrders(session: OrderSession): Promise<OrderFacts[]> {
    // 清理需要完整的新列表，不能复用执行核对的缓存或截取前 1000 条。
    const reply = await session.read('fetch_open_orders');
    const orders = array(object(reply).orders).map(orderFacts).filter(order => order.symbol === session.identity.symbol);
    const ids = new Set<string>();
    for (const order of orders) {
        if (ids.has(order.id)) throw new TradingError('ORDER_FACTS_CONFLICT', '挂单编号重复，无法安全清理', 502);
        ids.add(order.id);
    }
    return orders;
}

export async function cleanupOrders(session: OrderSession): Promise<CleanupResult> {
    const identity = identityOf(session.identity);
    const result: CleanupResult = { identity, checked_at: Date.now(), snapshot: null, outcome: 'failed',
        message: '清理未完成', orders: [], issues: [] };
    const skip = (message: string) => { result.outcome = 'skipped'; result.message = message; return result; };
    try {
        result.snapshot = await readPositions(session);
        const kind = positionKind(result.snapshot);
        if (kind !== 'flat') return skip(kind === 'held' ? '当前仍有仓位，已跳过清理' : '持仓数量未能确认，已跳过清理');
        const open = (await openOrders(session)).filter(order => !isTerminal(order));
        if (open.some(order => order.status !== 'open')) return skip('挂单状态未能确认，无法排除开仓挂单，已跳过清理');
        if (open.some(order => order.reduceOnly === false)) return skip('存在开仓挂单，已跳过清理');
        if (open.some(order => order.reduceOnly !== true)) return skip('挂单只减仓属性未能确认，无法排除开仓挂单，已跳过清理');
        const candidates = open.filter(order => order.trigger !== null || conditionalTypes.has(order.type ?? ''));
        if (!candidates.length) {
            result.outcome = 'empty'; result.message = '没有可清理的只减仓条件单；普通或类型不明的挂单保留';
            return result;
        }
        result.snapshot = null;
        result.snapshot = await readPositions(session);
        if (positionKind(result.snapshot) !== 'flat') return skip('撤单前复查未能确认空仓，已跳过清理');
        result.orders = candidates.map(order => ({ id: order.id, write_state: 'not_sent', confirmation: 'unknown', error: null }));
        const canceled = new Set<string>();
        let cursor = 0;
        const worker = async () => {
            while (cursor < result.orders.length) {
                const output = result.orders[cursor++]!;
                await cancel(session, output, canceled);
            }
        };
        await Promise.all([worker(), worker()]);
        try {
            const latest = new Map((await openOrders(session)).filter(order => !isTerminal(order)).map(order => [order.id, order]));
            for (const output of result.orders) {
                const remaining = latest.get(output.id);
                output.confirmation = remaining ? remaining.status === 'open' ? 'open' : 'unknown'
                    : canceled.has(output.id) ? 'canceled' : 'absent';
                if (remaining && canceled.has(output.id)) output.error = { code: 'ORDER_FACTS_CONFLICT', message: '取消回执与最新挂单列表矛盾，请到交易所核对' };
            }
        } catch (error) { result.issues.push(safeIssue(error)); }
        result.outcome = 'completed'; result.message = '清理及核对已结束，请查看逐项结果';
    } catch (error) {
        result.issues.push(safeIssue(error)); result.message = '查询或清理资格检查失败，未执行撤单';
    } finally { result.checked_at = Date.now(); }
    return result;
}

async function cancel(session: OrderSession, output: CleanupOrder, canceled: Set<string>) {
    try {
        const reply = await session.write('cancel_order', { ...identityOf(session.identity), id: output.id });
        const receipt = orderFacts(object(reply).order);
        if (receipt.id !== output.id || receipt.symbol !== session.identity.symbol) {
            throw new TradingError('ORDER_FACTS_CONFLICT', '撤单回执身份不一致，请到交易所核对', 502);
        }
        output.write_state = 'accepted';
        if (receipt.status === 'canceled') canceled.add(output.id);
    } catch (error) {
        output.write_state = error instanceof BackendWriteError ? error.writeState : 'unknown';
        output.error = safeIssue(error);
    }
}
