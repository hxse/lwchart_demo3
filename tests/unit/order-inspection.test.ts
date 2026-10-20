import { expect, test, spyOn } from 'bun:test';
import { OrderExecution } from '../../src/crypto/trading/execution-state';
import { OrderHttpError } from '../../src/crypto/trading/client';
import type { CleanupResult } from '../../src/crypto/trading/inspection';
import { emptyInspection } from '../../src/crypto/trading/inspection';
import type { CheckResult, ExecutionResult, PositionSnapshot, TradeIdentity } from '../../src/crypto/trading/types';
import { createOrderMemory, changeOrderIdentity, resetOrderDraft } from '../../src/crypto/trading/memory';
import { runtime, deferred } from '../fixtures/data';
import { orderIdentity, orderRequest } from '../fixtures/orders';

const snapshot = (identity = orderIdentity): PositionSnapshot => ({ identity, checked_at: 1, positions: [] });
const result = (): CleanupResult => ({ identity: { ...orderIdentity }, checked_at: 2, snapshot: snapshot(),
    outcome: 'empty', message: '没有可清理的条件单', orders: [], issues: [] });
const executed = (): ExecutionResult => ({ request_id: orderRequest().request_id, identity: orderIdentity, submitted_plan: null,
    legs: Object.fromEntries(['entry', 'stop_loss', 'take_profit'].map(key => [key, { write_state: 'accepted', confirmation: 'open',
        order_id: key, client_order_id: key, filled: null, average: null, error: null }])) as ExecutionResult['legs'],
    verification: { checked_at: 1, positions: [], issues: [] }, warnings: [] });

function tradeClient() {
    let submitted = 0, checked = 0;
    return {
        get submitted() { return submitted; }, get checked() { return checked; },
        async execute() { submitted++; return executed(); },
        async check(): Promise<CheckResult> {
            checked++; return { request_id: orderRequest().request_id, identity: orderIdentity, observations: executed().legs, verification: executed().verification };
        },
    };
}

test('清理与本页入场／结果查询互斥且单飞，关闭不能取消，结果保留原身份并在完成后解锁', async () => {
    const done = deferred<CleanupResult>(), client = tradeClient(), identities: TradeIdentity[] = [];
    const execution = new OrderExecution(client, { positions: async () => snapshot(), cleanup: async identity => { identities.push(identity); return done.promise; } });
    execution.state.result = executed();
    const identity = { ...orderIdentity }, pending = execution.inspect(identity, true);
    identity.symbol = 'ETH/USDT:USDT';
    execution.cancelInspection(); await execution.inspect(identity, true);
    await execution.submit(orderRequest()); await execution.check();
    expect(identities).toEqual([orderIdentity]); expect(execution.cleaning).toBe(true);
    expect(client.submitted).toBe(0); expect(client.checked).toBe(0);
    done.resolve(result()); await pending;
    expect(execution.cleaning).toBe(false); expect(execution.state.inspection.result?.identity).toEqual(orderIdentity);
    execution.cancelInspection(); expect(execution.state.inspection.result).not.toBeNull();
    await execution.check(); expect(client.checked).toBe(1);
    await execution.submit(orderRequest()); expect(client.submitted).toBe(1);
});

test('纯持仓读取不阻止开仓，切身份取消并隔离晚到响应，不增加清理请求', async () => {
    const reads: Array<{ identity: TradeIdentity; signal: AbortSignal; done: ReturnType<typeof deferred<PositionSnapshot>> }> = [];
    const client = tradeClient(); let cleans = 0;
    const execution = new OrderExecution(client, {
        positions: (identity, signal) => { const done = deferred<PositionSnapshot>(); reads.push({ identity, signal, done }); return done.promise; },
        cleanup: async () => { cleans++; return result(); },
    });
    const first = execution.inspect(orderIdentity, false);
    await execution.inspect(orderIdentity, false); expect(reads).toHaveLength(1);
    await execution.submit(orderRequest()); expect(client.submitted).toBe(1);
    const other = { ...orderIdentity, symbol: 'ETH/USDT:USDT' };
    execution.syncInspectionIdentity(other); expect(reads[0]!.signal.aborted).toBe(true);
    const second = execution.inspect(other, false);
    reads[0]!.done.resolve(snapshot()); await first;
    expect(execution.state.inspection.pending).toBe(true); expect(execution.state.inspection.identity).toEqual(other);
    reads[1]!.done.resolve(snapshot(other)); await second;
    expect(execution.state.inspection.snapshot).toEqual(snapshot(other)); expect(cleans).toBe(0);
    execution.cancelInspection(); expect(execution.state.inspection.identity).toBeNull();
});

test('切完整身份清空持仓和清理显示，切回不恢复；同身份同步及交易日志保持', async () => {
    for (const next of [{ ...orderIdentity, symbol: 'ETH/USDT:USDT' }, { ...orderIdentity, exchange_name: 'kraken' as const },
        { ...orderIdentity, is_live: true }, { ...orderIdentity, market: 'spot' as const }, null]) {
        const client = tradeClient(), execution = new OrderExecution(client, { positions: async () => snapshot(), cleanup: async () => result() });
        execution.state.result = executed(); const trade = execution.state.result;
        await execution.inspect(orderIdentity, true);
        const before = execution.state.inspection;
        execution.syncInspectionIdentity({ ...orderIdentity }); expect(execution.state.inspection).toBe(before);
        execution.syncInspectionIdentity(next); expect(execution.state.inspection).toEqual(emptyInspection());
        execution.syncInspectionIdentity(orderIdentity); expect(execution.state.inspection).toEqual(emptyInspection());
        expect(execution.state.result).toBe(trade); expect(client.submitted).toBe(0);
    }
});

test('清理在途切品种立即清空显示，仍锁住开仓；晚到结果或错误不重新显示，结束后才解锁', async () => {
    for (const fail of [false, true]) {
        const done = deferred<CleanupResult>(), client = tradeClient(); let requests = 0;
        const execution = new OrderExecution(client, { positions: async () => snapshot(), cleanup: async () => { requests++; return done.promise; } });
        execution.state.result = executed(); const trade = execution.state.result;
        const pending = execution.inspect(orderIdentity, true);
        execution.syncInspectionIdentity({ ...orderIdentity, symbol: 'ETH/USDT:USDT' });
        expect(execution.state.inspection).toEqual({ ...emptyInspection(), pending: true, cleanup: true });
        execution.cancelInspection(); execution.syncInspectionIdentity(orderIdentity);
        await execution.submit(orderRequest()); await execution.check(); await execution.inspect(orderIdentity, true);
        expect(execution.cleaning).toBe(true); expect(client.submitted).toBe(0); expect(client.checked).toBe(0); expect(requests).toBe(1);
        if (fail) done.reject(new OrderHttpError('查询失败', 503, 'SERVICE_NOT_READY'));
        else done.resolve(result());
        await pending;
        expect(execution.cleaning).toBe(false); expect(execution.state.inspection).toEqual(emptyInspection());
        expect(execution.state.result).toBe(trade);
        await execution.submit(orderRequest()); expect(client.submitted).toBe(1);
    }
});

test('入场进行中不能发起清理，明确准入错误会结束单飞且不会自动重试', async () => {
    const done = deferred<ExecutionResult>(); let cleanups = 0;
    const execution = new OrderExecution({ ...tradeClient(), execute: () => done.promise }, {
        positions: async () => snapshot(), cleanup: async () => { cleanups++; throw new OrderHttpError('同源校验失败', 403, 'ORIGIN_NOT_ALLOWED'); },
    });
    const submitted = execution.submit(orderRequest()); await execution.inspect(orderIdentity, true); expect(cleanups).toBe(0);
    done.resolve(executed()); await submitted;
    await execution.inspect(orderIdentity, true); expect(cleanups).toBe(1);
    expect(execution.cleaning).toBe(false); expect(execution.state.inspection.error).toBe('同源校验失败');
    expect(execution.state.result?.request_id).toBe(orderRequest().request_id);
});

test('清理响应丢失时仍锁定至执行窗口结束，保留未知提示且不自动重试', async () => {
    let now = 100000, calls = 0;
    const clock = spyOn(performance, 'now').mockImplementation(() => now), client = tradeClient();
    const execution = new OrderExecution(client, { positions: async () => snapshot(), cleanup: async () => { calls++; throw new Error('断线'); } });
    let sawUnknownWhileLocked = false;
    const release = execution.subscribe(state => {
        if (state.inspection.error && state.inspection.pending) {
            sawUnknownWhileLocked = execution.cleaning;
            void execution.submit(orderRequest());
            now += 65000;
        }
    });
    try {
        await execution.inspect(orderIdentity, true);
        expect(sawUnknownWhileLocked).toBe(true); expect(client.submitted).toBe(0);
        expect(execution.cleaning).toBe(false); expect(execution.state.inspection.error).toContain('撤单可能已生效'); expect(calls).toBe(1);
    } finally { release(); clock.mockRestore(); }
});

test('两个查询偏好默认开启且只属于单页，切身份／参数重置保留，不影响待确认标记', () => {
    const memory = createOrderMemory(runtime.defaults);
    expect(memory.cleanupOnQuery).toBe(true); expect(memory.inspectBeforeSubmit).toBe(true);
    memory.cleanupOnQuery = false; memory.inspectBeforeSubmit = false;
    expect(memory.dirty).toBe(false);
    changeOrderIdentity(memory, { ...runtime.defaults, ccxt: { ...runtime.defaults.ccxt, symbol: 'ETH/USDT:USDT' } });
    resetOrderDraft(memory, runtime.defaults);
    expect(memory.cleanupOnQuery).toBe(false); expect(memory.inspectBeforeSubmit).toBe(false);
    const other = createOrderMemory(runtime.defaults); expect(other.cleanupOnQuery).toBe(true); expect(other.inspectBeforeSubmit).toBe(true);
});
