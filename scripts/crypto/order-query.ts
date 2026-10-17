import { array, object, text } from '../../src/crypto/trading/wire';
import { type CheckRequest, type CheckResult, type LegName, type Observation, type PositionSnapshot, type Verification, type Warning } from '../../src/crypto/trading/types';
import { identityOf } from '../../src/crypto/trading/validation';
import { OrderSession, safeIssue } from './order-data';
import { numeric, observe, orderFacts, withTrades, type OrderFacts } from './order-facts';
import { clientOrderIds as clientIds, orderLegs as legs } from '../../src/crypto/trading/identity';

/** 手动查询与执行后核对共用同一份持仓归一规则。 */
export async function readPositions(session: OrderSession): Promise<PositionSnapshot> {
    const reply = await session.read('fetch_positions');
    const positions: PositionSnapshot['positions'] = array(object(reply).positions).map(object)
        .filter(p => text(p.symbol) === session.identity.symbol).map(p => ({
            side: p.side === 'long' || p.side === 'short' ? p.side : null,
            contracts: numeric(p.contracts), entry_price: numeric(p.entryPrice, true),
        }));
    return { identity: identityOf(session.identity), checked_at: Date.now(), positions };
}

export class OrderQueries {
    private open?: Promise<OrderFacts[]>;
    private closed?: Promise<OrderFacts[]>;
    constructor(readonly session: OrderSession) {}
    private list(method: 'fetch_open_orders' | 'fetch_closed_orders') {
        return this.session.read(method, { limit: '1000' }).then(reply => array(object(reply).orders).map(orderFacts));
    }
    openOrders() { return this.open ??= this.list('fetch_open_orders'); }
    closedOrders() { return this.closed ??= this.list('fetch_closed_orders'); }
    async find(id: string | null, clientId: string): Promise<OrderFacts | null> {
        if (id) {
            try {
                const facts = orderFacts(object(await this.session.read('fetch_order', { id })).order);
                if (facts.id !== id || facts.symbol !== this.session.identity.symbol || facts.clientId && facts.clientId !== clientId) throw new Error('订单身份不一致');
                return facts;
            } catch (error) {
                if (safeIssue(error).code !== 'ORDER_NOT_FOUND') throw error;
            }
        }
        const results = await Promise.allSettled([this.openOrders(), this.closedOrders()]);
        for (const result of results) if (result.status === 'fulfilled') {
            const matches = result.value.filter(order => order.symbol === this.session.identity.symbol && (id ? order.id === id : order.clientId === clientId));
            if (matches.length === 1 && (!matches[0]!.clientId || matches[0]!.clientId === clientId)) return matches[0]!;
            if (matches.length > 1) throw new Error('订单身份存在多个匹配');
        }
        const failed = results.find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
        return null;
    }
    async verification(): Promise<Verification> {
        const [positions, orders] = await Promise.allSettled([readPositions(this.session), this.openOrders()]);
        const issues: Warning[] = [];
        let output: Verification['positions'] = null;
        if (positions.status === 'fulfilled') output = positions.value.positions;
        else issues.push(safeIssue(positions.reason));
        if (orders.status === 'rejected') issues.push(safeIssue(orders.reason));
        return { checked_at: Date.now(), positions: output, issues };
    }
}
export async function checkOrders(session: OrderSession, request: CheckRequest): Promise<CheckResult> {
    const ids = clientIds(request.request_id), query = new OrderQueries(session);
    const observations = {} as Record<LegName, Observation>;
    const verification = query.verification();
    await Promise.all(legs.map(async leg => {
        let value = observe(null, ids[leg], leg, request.orders[leg]);
        try {
            let facts = await query.find(request.orders[leg], ids[leg]);
            if (leg === 'entry' && facts?.filled && !facts.average) facts = withTrades(facts, await session.read('fetch_my_trades', { limit: '1000' }), '');
            value = observe(facts, ids[leg], leg, request.orders[leg]);
            if (leg !== 'entry' && facts && (facts.reduceOnly !== true || !facts.side || !facts.amount || !facts.trigger)) {
                value.confirmation = 'unconfirmed';
                value.error = { code: 'PROTECTION_UNCONFIRMED', message: '查询到保护单，但方向、数量、触发价或只减仓属性未完整提供' };
            }
        } catch (error) { value.error = safeIssue(error); }
        observations[leg] = value;
    }));
    return { request_id: request.request_id, identity: identityOf(request), observations, verification: await verification };
}
