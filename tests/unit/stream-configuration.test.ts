import { expect, test } from 'bun:test';
import { MarketStream } from '../../src/crypto/data/MarketStream';
import { parseIndicator } from '../../src/indicators/parameters';
import type { CandleBatch } from '../../src/crypto/data/ohlcv';
import { candle, deferred, identity, result } from '../fixtures/data';

const overflow = parseIndicator('bbands,2,1e308');

test('新增指标初始化失败保留提交快照并停止取数，删除失败配置即使未改变旧实例也能恢复', async () => {
    let rows = [candle(0, 100), candle(1, 200)];
    const limits: number[] = [];
    const stream = new MarketStream(identity, { async latest(_id, limit) { limits.push(limit); return result(rows); } }, 20);
    const events: string[] = [];
    stream.subscribe(event => events.push(event.kind));
    try {
        stream.configure([], 60); await stream.poll();
        const committed = stream.store.snapshot(); events.length = 0;
        expect(() => stream.configure([overflow], 60)).not.toThrow();
        expect(stream.status).toMatchObject({ phase: 'error', count: 2 });
        expect(stream.status.message).toContain('bbands,2,1e+308');
        expect(stream.status.message).toContain('自动更新已暂停');
        expect(stream.store.snapshot()).toEqual(committed);
        expect(events).toEqual(['status']);
        await stream.poll(); await stream.poll(); expect(limits).toEqual([20]);
        stream.configure([], 60);
        expect(stream.status.phase).toBe('ready');
        rows = [...rows, candle(2, 210)]; await stream.poll();
        expect(limits).toEqual([20, 5]); expect(stream.store.rows).toEqual(rows);
        stream.configure([parseIndicator('bbands,2,2')], 60);
        expect(stream.status.phase).toBe('ready');
        expect([...stream.store.indicators.keys()]).toEqual(['bbands,2,2']);
    } finally { stream.dispose(); }
});

test('配置初始化失败取消旧请求，忽略随后到达的成功响应，修正参数后恢复', async () => {
    const initial = [candle(0, 100), candle(1, 200)];
    const pending = deferred<CandleBatch>();
    let calls = 0;
    let signal!: AbortSignal;
    const stream = new MarketStream(identity, { latest(_id, _limit, received) {
        signal = received; return ++calls === 2 ? pending.promise : Promise.resolve(result(initial));
    } }, 20);
    try {
        stream.configure([], 60); await stream.poll();
        const snapshot = stream.store.snapshot(); const request = stream.poll();
        stream.configure([overflow], 60);
        expect(signal.aborted).toBe(true);
        pending.resolve(result([...initial, candle(2, 210)])); await request;
        expect(stream.status.phase).toBe('error'); expect(stream.store.snapshot()).toEqual(snapshot);
        stream.configure([parseIndicator('bbands,2,2')], 60); await stream.poll();
        expect(calls).toBe(3); expect(stream.status.phase).toBe('ready');
        expect([...stream.store.indicators.keys()]).toEqual(['bbands,2,2']);
    } finally { stream.dispose(); }
});

