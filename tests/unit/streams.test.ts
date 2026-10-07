import { expect, test, spyOn } from 'bun:test';
import { MarketStream } from '../../src/crypto/data/MarketStream';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import type { OhlcvSource } from '../../src/crypto/data/client';
import type { OhlcvResult } from '../../src/crypto/data/ohlcv';
import { candle, result, identity, budget, defaults, deferred } from '../fixtures/data';

test('增量从真实末根重叠，断网超过十根串行补齐，预算跨轮继续', async () => {
    const rows = Array.from({ length: 27 }, (_, i) => candle(i));
    const requests: Array<[number, number]> = [];
    const source: OhlcvSource = {
        async history() { return result(rows.slice(0, 2)); },
        async increment(_identity, since, limit) {
            requests.push([since, limit]);
            return result(rows.filter(r => r[0] >= since).slice(0, limit));
        },
    };
    const stream = new MarketStream(identity, source, { ...budget, max_catchup_pages: 2 }, defaults.history_bars);
    stream.store.setIndicators([{ type: 'ema', period: 3 }]);
    await stream.poll();
    await stream.poll();
    expect(stream.store.tail).toBe(candle(19)[0]);
    expect(stream.status.phase).toBe('catching-up');
    await stream.poll();
    expect(requests).toEqual([[candle(1)[0], 10], [candle(10)[0], 10], [candle(19)[0], 10]]);
    expect(stream.store.rows).toEqual(rows);
    expect(stream.status.phase).toBe('ready');
    expect(new Set(stream.store.rows.map(r => r[0])).size).toBe(rows.length);
    stream.dispose();
});

test('单飞、失败不推进、已成功页保留、空增量不当成到达最新', async () => {
    let fail = false;
    let missing = false;
    let empty = false;
    const requests: number[] = [];
    const history = deferred<OhlcvResult>();
    const stream = new MarketStream(identity, {
        history: () => history.promise,
        async increment(_identity, since) {
            requests.push(since);
            if (fail) throw new Error('离线连接失败');
            if (missing) return result([candle(3)]);
            if (empty) return result([]);
            return result([candle(1, 150), candle(2)]);
        },
    }, budget, defaults.history_bars);
    const pending = stream.poll();
    expect(stream.poll()).toBe(pending);
    history.resolve(result([candle(0), candle(1)]));
    await pending;
    fail = true; await stream.poll();
    expect(stream.store.tail).toBe(candle(1)[0]);
    expect(stream.status.phase).toBe('error');
    fail = false; missing = true; await stream.poll();
    expect(stream.status.message).toContain('末根重叠');
    expect(stream.store.rows).toEqual([candle(0), candle(1)]);
    missing = false; await stream.poll();
    expect(stream.store.rows).toEqual([candle(0), candle(1, 150), candle(2)]);
    empty = true; await stream.poll();
    expect(stream.status.phase).toBe('error');
    expect(stream.store.tail).toBe(candle(2)[0]);
    expect(requests).toEqual([candle(1)[0], candle(1)[0], candle(1)[0], candle(2)[0]]);
    stream.dispose();
});

test('空历史下轮再请求；中途坏页保留前页', async () => {
    let initial = 0;
    let increments = 0;
    const rows = Array.from({ length: 15 }, (_, i) => candle(i));
    const stream = new MarketStream(identity, {
        async history() { return result(initial++ ? rows.slice(0, 2) : []); },
        async increment(_id, since, limit) {
            if (increments++ === 1) throw new Error('补齐中断');
            return result(rows.filter(r => r[0] >= since).slice(0, limit));
        },
    }, budget, defaults.history_bars);
    await stream.poll(); expect(stream.status.phase).toBe('empty');
    await stream.poll(); await stream.poll();
    expect(stream.store.tail).toBe(candle(10)[0]);
    expect(stream.status.phase).toBe('error');
    await stream.poll();
    expect(stream.store.rows).toEqual(rows);
    stream.dispose();
});

test('默认五秒、慢请求不重叠、卸载取消且丢弃旧响应', async () => {
    let callback!: () => void;
    let interval = 0;
    const timer = spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms: number) => {
        callback = fn; interval = ms; return 424242;
    }) as any);
    const history = deferred<OhlcvResult>();
    let calls = 0;
    let signal!: AbortSignal;
    const stream = new MarketStream(identity, {
        history(_id, _limit, received) { calls++; signal = received; return history.promise; },
        async increment() { return result([]); },
    }, budget, defaults.history_bars);
    try {
        stream.configure(defaults.indicators, 5);
        expect(interval).toBe(5000);
        const pending = stream.poll();
        callback(); callback();
        expect(calls).toBe(1);
        stream.dispose();
        expect(signal.aborted).toBe(true);
        history.resolve(result([candle(0)]));
        await pending;
        expect(stream.store.rows).toEqual([]);
    } finally { stream.dispose(); timer.mockRestore(); }
});

test('重复周期共享请求，失败隔离，变品种释放旧状态，改 EMA 与节拍不重载', async () => {
    const calls: string[] = [];
    const source: OhlcvSource = {
        async history(id) {
            calls.push(`${id.symbol}/${id.timeframe}`);
            if (id.timeframe === '4h') throw new Error('单周期失败');
            return result([candle(0), candle(1)]);
        },
        async increment() { return result([candle(1)]); },
    };
    const hub = new MarketHub(source, budget);
    try {
        const streams = hub.configure({ ...defaults, timeframes: ['30m', '30m', '4h', '1d'] });
        await Promise.all(streams.map(s => s.poll()));
        expect(streams[0]).toBe(streams[1]);
        expect(calls).toHaveLength(3);
        expect(streams[2]!.status.phase).toBe('error');
        expect(streams[0]!.status.phase).toBe('ready');
        hub.configure({ ...defaults, timeframes: ['30m', '30m', '4h', '1d'], indicators: [], refresh_seconds: 7 });
        expect(calls).toHaveLength(3);
        const changed = hub.configure({ ...defaults, symbol: 'ETH/USDT:USDT' });
        await Promise.all(changed.map(s => s.poll()));
        expect(changed[0]).not.toBe(streams[0]);
        expect(changed[0]!.identity.symbol).toBe('ETH/USDT:USDT');
        expect(streams[0]!.store.rows).toEqual([candle(0), candle(1)]);
    } finally { hub.dispose(); }
});

test('数量更改重取并取消旧请求，合法短历史仍成功，保留窗口遵循新数量', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => candle(index));
    const first = deferred<OhlcvResult>();
    const calls: Array<{ limit: number; signal: AbortSignal }> = [];
    const source: OhlcvSource = {
        async history(_id, limit, signal) {
            calls.push({ limit, signal });
            if (calls.length === 1) return first.promise;
            return result(rows.slice(-Math.min(limit, 10)));
        },
        async increment(_id, since, limit) { return result(rows.filter(row => row[0] >= since).slice(0, limit)); },
    };
    const hub = new MarketHub(source, budget);
    const options = { ...defaults, layout: '1x2' as const, timeframes: ['30m', '30m'] as typeof defaults.timeframes };
    try {
        const old = hub.configure(options);
        const oldRequest = old[0]!.poll();
        const next = hub.configure({ ...options, history_bars: 4 });
        expect(calls[0]!.signal.aborted).toBe(true);
        expect(next[0]).toBe(next[1]);
        expect(next[0]).not.toBe(old[0]);
        first.resolve(result(rows.slice(0, 10)));
        await Promise.all([oldRequest, next[0]!.poll()]);
        expect(old[0]!.store.rows).toEqual([]);
        expect(next[0]!.store.capacity).toBe(4);
        expect(next[0]!.store.rows).toEqual(rows.slice(-4));
        expect(next[0]!.status.phase).toBe('ready');
        const expanded = hub.configure(options);
        await expanded[0]!.poll();
        expect(expanded[0]!.store.rows).toHaveLength(10);
        expect(expanded[0]!.status.phase).toBe('ready');
        expect(calls.map(call => call.limit)).toEqual([1500, 4, 1500]);
        hub.configure({ ...options, indicators: [], refresh_seconds: 60 });
        expect(calls).toHaveLength(3);
    } finally { hub.dispose(); }
});
