import { expect, test, spyOn } from 'bun:test';
import { MarketStream } from '../../src/crypto/data/MarketStream';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import type { MarketSource } from '../../src/crypto/data/client';
import type { CandleBatch } from '../../src/crypto/data/ohlcv';
import { activeOptions } from '../../src/crypto/options';
import { candle, result, identity, defaults, runtime, deferred } from '../fixtures/data';

const windowRows = (count: number) => Array.from({ length: count }, (_, index) => candle(index));

test('最新五根覆盖和追加；无交集时仅一次重载，旧窗口不参与拼接', async () => {
    let rows = windowRows(3);
    const limits: number[] = [];
    const stream = new MarketStream(identity, { async latest(_id, limit) { limits.push(limit); return result(rows.slice(-limit)); } }, 1500);
    stream.store.setIndicators([{ type: 'ema', period: 3 }]);
    try {
        await stream.poll();
        rows = [candle(0), candle(1, 110), candle(2, 130), candle(3), candle(4)];
        await stream.poll();
        expect(stream.store.rows).toEqual(rows);
        expect(stream.store.emas.get(3)!.points.at(-1)!.value).toBeCloseTo(106.0833333333);
        rows = Array.from({ length: 6 }, (_, index) => candle(20 + index));
        await stream.poll();
        expect(limits).toEqual([1500, 5, 5, 1500]);
        expect(stream.store.rows).toEqual(rows);
        expect(stream.status.phase).toBe('ready');
    } finally { stream.dispose(); }
});

test('重载失败保留旧窗口，下一轮直接完整重载，不再尝试旧数据拼接', async () => {
    const limits: number[] = [];
    let data = windowRows(3);
    let failFull = false;
    const stream = new MarketStream(identity, { async latest(_id, limit) {
        limits.push(limit);
        if (failFull && limit === 1500) throw new Error('离线重载失败');
        return result(data.slice(-limit));
    } }, 1500);
    try {
        await stream.poll();
        data = [candle(30), candle(31), candle(32)]; failFull = true;
        await stream.poll();
        expect(stream.status.phase).toBe('error');
        expect(stream.store.rows).toEqual(windowRows(3));
        failFull = false; await stream.poll();
        expect(limits).toEqual([1500, 5, 1500, 1500]);
        expect(stream.store.rows).toEqual(data);
    } finally { stream.dispose(); }
});

test('短历史成功，空小窗口重载为空则清空，下一轮仍取完整窗口', async () => {
    let data: ReturnType<typeof windowRows> = [];
    const limits: number[] = [];
    const stream = new MarketStream(identity, { async latest(_id, limit) { limits.push(limit); return result(data.slice(-limit)); } }, 1500);
    try {
        await stream.poll(); expect(stream.status.phase).toBe('empty');
        data = windowRows(3); await stream.poll();
        expect(stream.status.phase).toBe('ready'); expect(stream.store.rows).toHaveLength(3);
        data = []; await stream.poll();
        expect(stream.store.rows).toEqual([]); expect(stream.status.phase).toBe('empty');
        data = windowRows(2); await stream.poll();
        expect(limits).toEqual([1500, 1500, 5, 1500, 1500]);
        expect(stream.store.rows).toEqual(data);
    } finally { stream.dispose(); }
});

test('过期窗口和网络失败保留时间真值；重复的小窗口不提交数据', async () => {
    let data = windowRows(6);
    let fail = false;
    const stream = new MarketStream(identity, { async latest(_id, limit) {
        if (fail) throw new Error('离线故障');
        return result(data.slice(-limit));
    } }, 1500);
    const events: string[] = [];
    const unsubscribe = stream.subscribe(event => events.push(event.kind));
    try {
        await stream.poll(); events.length = 0;
        await stream.poll();
        expect(events).toEqual(['status']);
        data = windowRows(2); await stream.poll();
        expect(stream.status.message).toContain('早于已有行情');
        expect(stream.store.rows).toEqual(windowRows(6));
        fail = true; await stream.poll();
        expect(stream.status.phase).toBe('error'); expect(stream.store.tail).toBe(candle(5)[0]);
    } finally { unsubscribe(); stream.dispose(); }
});

test('默认五秒、请求单飞、卸载取消并拒绝迟到结果', async () => {
    let callback!: () => void;
    let interval = 0;
    const timer = spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms: number) => {
        callback = fn; interval = ms; return 424242;
    }) as any);
    const waiting = deferred<CandleBatch>();
    let calls = 0;
    let signal!: AbortSignal;
    const stream = new MarketStream(identity, { latest(_id, _limit, received) { calls++; signal = received; return waiting.promise; } }, 1500);
    try {
        stream.configure(defaults.indicators, 5);
        expect(interval).toBe(5000);
        const pending = stream.poll(); callback(); callback();
        expect(calls).toBe(1); expect(stream.poll()).toBe(pending);
        stream.dispose(); expect(signal.aborted).toBe(true);
        waiting.resolve(result(windowRows(2))); await pending;
        expect(stream.store.rows).toEqual([]);
    } finally { stream.dispose(); timer.mockRestore(); }
});

test('四个不同周期在任何响应前全部发出，重复槽只取一次', async () => {
    const pending = new Map<string, ReturnType<typeof deferred<CandleBatch>>>();
    const source: MarketSource = { latest(id) {
        const request = deferred<CandleBatch>(); pending.set(id.timeframe, request); return request.promise;
    } };
    const hub = new MarketHub(source);
    try {
        const streams = hub.configure(defaults);
        expect([...pending.keys()]).toEqual(defaults.timeframes);
        for (const request of pending.values()) request.resolve(result(windowRows(2)));
        await Promise.all(streams.map(stream => stream.poll()));
        expect(streams.every(stream => stream.status.phase === 'ready')).toBe(true);
        const shared = hub.configure({ ...defaults, timeframes: ['30m','30m','30m','30m'] });
        expect(shared.every(stream => stream === streams[0])).toBe(true);
    } finally { hub.dispose(); }
});

test('身份隔离、单周期故障；指标、主题、时区与节拍不重取历史', async () => {
    const calls: string[] = [];
    const source: MarketSource = { async latest(id) {
        calls.push(`${id.source}/${id.symbol}/${id.timeframe}`);
        if (id.timeframe === '4h') throw new Error('单周期失败');
        return result(windowRows(2));
    } };
    const hub = new MarketHub(source);
    try {
        const configuration = { ...defaults, timeframes: ['30m', '30m', '4h', '1d'] as typeof defaults.timeframes };
        const streams = hub.configure(configuration);
        await Promise.all(streams.map(stream => stream.poll()));
        expect(streams[0]).toBe(streams[1]); expect(calls).toHaveLength(3);
        expect(streams[2]!.status.phase).toBe('error'); expect(streams[0]!.status.phase).toBe('ready');
        const themed = hub.configure({ ...configuration, theme: 'light', timezone: 'UTC', indicators: [], refresh_seconds: 7 });
        expect(themed).toEqual(streams); expect(calls).toHaveLength(3);
        const changed = hub.configure(activeOptions({ ...runtime.defaults, source: 'tq' }));
        await Promise.all(changed.map(stream => stream.poll()));
        expect(changed[0]).not.toBe(streams[0]); expect(changed[0]!.identity.source).toBe('tq');
        expect(streams[0]!.store.rows).toEqual(windowRows(2));
    } finally { hub.dispose(); }
});

test('数量改变取消旧请求并按新数量加载，N 小于五也保留窗口上限', async () => {
    const data = windowRows(12);
    const first = deferred<CandleBatch>();
    const calls: Array<{ limit: number; signal: AbortSignal }> = [];
    const hub = new MarketHub({ async latest(_id, limit, signal) {
        calls.push({ limit, signal });
        return calls.length === 1 ? first.promise : result(data.slice(-limit));
    } });
    const options = { ...defaults, layout: '1x1' as const, timeframes: ['30m'] as typeof defaults.timeframes };
    try {
        const old = hub.configure(options)[0]!; const oldRequest = old.poll();
        const next = hub.configure({ ...options, history_bars: 1 })[0]!;
        expect(calls[0]!.signal.aborted).toBe(true);
        first.resolve(result(data)); await Promise.all([oldRequest, next.poll()]);
        expect(old.store.rows).toEqual([]); expect(next.store.rows).toEqual(data.slice(-1));
        await next.poll();
        expect(next.store.rows).toEqual(data.slice(-1));
        expect(calls.map(call => call.limit)).toEqual([1000, 1, 5]);
    } finally { hub.dispose(); }
});
