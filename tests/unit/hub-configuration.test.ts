import { expect, test } from 'bun:test';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import { parseIndicator } from '../../src/indicators/parameters';
import { candle, defaults, result } from '../fixtures/data';

test('MarketHub 新增指标初始化失败隔离单周期，其他周期提交新配置；移除问题配置恢复增量', async () => {
    let advance = false;
    const calls: Array<{ timeframe: string; limit: number }> = [];
    const hub = new MarketHub({ async latest(id, limit) {
        calls.push({ timeframe: id.timeframe, limit });
        const rows = [candle(0, 100), candle(1, id.timeframe === '30m' ? 200 : 100)];
        if (advance) rows.push(candle(2, id.timeframe === '30m' ? 210 : 100));
        return result(rows);
    } });
    const options = { ...defaults, indicators: [parseIndicator('sma,2')] };
    const overflow = parseIndicator('bbands,2,1e308');
    try {
        const streams = hub.configure(options); await Promise.all(streams.map(stream => stream.poll()));
        const committed = streams[0]!.store.snapshot();
        expect(() => hub.configure({ ...options, indicators: [...options.indicators, overflow] })).not.toThrow();
        expect(streams[0]!.status.phase).toBe('error');
        expect(streams[0]!.status.message).toContain('bbands,2,1e+308');
        expect(streams[0]!.store.snapshot()).toEqual(committed);
        for (const stream of streams.slice(1)) {
            expect(stream.status.phase).toBe('ready');
            expect([...stream.store.indicators.keys()]).toEqual(['sma,2', 'bbands,2,1e+308']);
        }
        advance = true; await Promise.all(streams.map(stream => stream.poll()));
        expect(calls.map(call => call.timeframe)).toEqual([...options.timeframes, ...options.timeframes.slice(1)]);
        expect(calls.map(call => call.limit)).toEqual([1000, 1000, 1000, 1000, 5, 5, 5]);
        expect(streams[0]!.store.rows).toHaveLength(2);
        expect(streams.slice(1).every(stream => stream.store.rows.length === 3)).toBe(true);
        expect(hub.configure(options)).toEqual(streams);
        await Promise.all(streams.map(stream => stream.poll()));
        expect(streams.every(stream => stream.status.phase === 'ready')).toBe(true);
        expect(streams[0]!.store.rows).toHaveLength(3);
        expect(streams[0]!.store.indicators.get('sma,2')!.outputs.get('value')!.at(-1)!.value).toBe(205);
        expect(streams.every(stream => [...stream.store.indicators.keys()].join() === 'sma,2')).toBe(true);
    } finally { hub.dispose(); }
});
