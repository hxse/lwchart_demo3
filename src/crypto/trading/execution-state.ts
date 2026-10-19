import { OrderClient, OrderHttpError } from './client';
import { clientOrderIds, orderLegs } from './identity';
import { identityOf } from './validation';
import type { ExecutionResult, LegName, LegResult, TradeIdentity, TradeRequest } from './types';
import { emptyInspection, type InspectionState } from './inspection';

export interface ExecutionState { pending: boolean; checking: boolean; result: ExecutionResult | null; error: string; inspection: InspectionState }
export class OrderExecution {
    state: ExecutionState = { pending: false, checking: false, result: null, error: '', inspection: emptyInspection() };
    private listeners = new Set<(value: ExecutionState) => void>();
    private inspectionAbort?: AbortController;
    constructor(private client: Pick<OrderClient, 'execute' | 'check'> = new OrderClient(),
        private inspectionClient: Pick<OrderClient, 'positions' | 'cleanup'> = new OrderClient()) {}
    get cleaning() { return this.state.inspection.pending && this.state.inspection.cleanup; }
    subscribe(listener: (value: ExecutionState) => void) {
        this.listeners.add(listener); listener(this.state);
        return () => { this.listeners.delete(listener); };
    }
    private publish(patch: Partial<ExecutionState>) {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) listener(this.state);
    }
    private inspection(patch: Partial<InspectionState>) {
        this.publish({ inspection: { ...this.state.inspection, ...patch } });
    }
    cancelInspection() {
        // 清理独立于面板生命周期；纯读取取消后不允许旧回包改写新身份。
        if (this.state.inspection.cleanup) return;
        this.inspectionAbort?.abort(); this.inspectionAbort = undefined;
        this.publish({ inspection: emptyInspection() });
    }
    async inspect(value: TradeIdentity, cleanup: boolean) {
        if (this.state.pending || this.state.checking || this.state.inspection.pending) return;
        const identity = identityOf(value), deadline = performance.now() + 65000;
        const abort = new AbortController(); this.inspectionAbort = abort;
        this.publish({ inspection: { ...emptyInspection(), identity, pending: true, cleanup } });
        try {
            if (cleanup) {
                const result = await this.inspectionClient.cleanup(identity);
                this.inspection({ result, snapshot: result.snapshot });
            } else {
                const snapshot = await this.inspectionClient.positions(identity, abort.signal);
                if (!abort.signal.aborted) this.inspection({ snapshot });
            }
        } catch (error) {
            if (abort.signal.aborted) return;
            const known = error instanceof OrderHttpError && error.status !== 0;
            this.inspection({ error: known ? error.message : cleanup
                ? '清理结果未收到，撤单可能已生效；等待执行窗口结束后解锁，请到交易所核对，不会自动重试'
                : '持仓查询未完成，请到交易所核对' });
            // 丢失响应不代表服务端停止，执行窗口内仍与本页入场互斥。
            if (cleanup && !known) await new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - performance.now())));
        } finally {
            if (!abort.signal.aborted) { this.inspectionAbort = undefined; this.inspection({ pending: false }); }
        }
    }
    async submit(input: Omit<TradeRequest, 'request_id'>) {
        if (this.state.pending || this.state.checking || this.cleaning) return;
        const request = { ...input, request_id: crypto.randomUUID() };
        this.publish({ pending: true, result: null, error: '' });
        try { this.publish({ result: await this.client.execute(request) }); }
        catch (error) {
            if (error instanceof OrderHttpError && error.status !== 0) this.publish({ error: error.message });
            else {
                const ids = clientOrderIds(request.request_id);
                const legs = Object.fromEntries(orderLegs.map(leg => [leg, { write_state: 'unknown', confirmation: 'unconfirmed',
                    order_id: null, client_order_id: ids[leg], filled: null, average: null, error: null }])) as Record<LegName, LegResult>;
                this.publish({ result: { request_id: request.request_id, identity: identityOf(request), submitted_plan: null, legs,
                    verification: { checked_at: Date.now(), positions: null, issues: [] },
                    warnings: [{ code: 'RESPONSE_UNKNOWN', message: '执行结果未收到，交易可能已生效；请查询结果或到交易所核对，不要重复入场' }] } });
            }
        } finally { this.publish({ pending: false }); }
    }
    async check() {
        const result = this.state.result;
        if (!result || this.state.pending || this.state.checking || this.cleaning) return;
        this.publish({ checking: true, error: '' });
        try {
            const next = await this.client.check({ ...result.identity, request_id: result.request_id,
                orders: Object.fromEntries(orderLegs.map(leg => [leg, result.legs[leg].order_id])) as Record<LegName, string | null> });
            const legs = { ...result.legs };
            const issues = [...next.verification.issues];
            for (const leg of orderLegs) {
                const observation = next.observations[leg], old = legs[leg];
                if (observation.error) issues.push(observation.error);
                legs[leg] = { ...old, ...observation, error: old.error, order_id: observation.order_id ?? old.order_id,
                    filled: observation.filled ?? old.filled, average: observation.average ?? old.average };
                if (old.write_state === 'rejected' && ['open', 'filled', 'partially_filled'].includes(observation.confirmation)) {
                    legs[leg].confirmation = 'unconfirmed';
                    issues.push({ code: 'ORDER_FACTS_CONFLICT', message: '新查询与原拒单回执不一致，请到交易所核对' });
                }
            }
            const warnings = [...result.warnings];
            if (['filled', 'partially_filled'].includes(legs.entry.confirmation)
                && [legs.stop_loss, legs.take_profit].some(leg => leg.write_state === 'not_sent' || leg.confirmation === 'unconfirmed')
                && !warnings.some(w => w.code === 'PROTECTION_UNCONFIRMED' || w.code === 'PROTECTION_NOT_SENT')) {
                warnings.push({ code: 'PROTECTION_UNCONFIRMED', message: '已查询到入场成交，保护单尚未完整确认；查询不会补单，请手动处理' });
            }
            this.publish({ result: { ...result, legs, warnings, verification: { ...next.verification, issues } } });
        } catch (error) { this.publish({ error: error instanceof Error ? error.message : '查询失败，原回执已保留' }); }
        finally { this.publish({ checking: false }); }
    }
}
