import { expect, test } from 'bun:test';
import { EmaSeries } from '../../src/crypto/data/EmaSeries';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { candle } from '../fixtures/data';

test('EMA 使用 SMA 播种，周期一和不足预热', () => {
    const rows = [candle(0, 10), candle(1, 20), candle(2, 30), candle(3, 50)];
    expect(new EmaSeries(3, rows).points.map(p => p.value)).toEqual([20, 35]);
    expect(new EmaSeries(1, rows).points.map(p => p.value)).toEqual([10, 20, 30, 50]);
    expect(new EmaSeries(5, rows).points).toEqual([]);
});

test('覆盖活跃尾根多次不漂移，预热时覆盖也不重复计数', () => {
    const ema = new EmaSeries(3, [candle(0, 10), candle(1, 20), candle(2, 30)]);
    for (let i = 0; i < 5; i++) ema.update([candle(2, 60)]);
    expect(ema.points.map(p => p.value)).toEqual([30]);
    ema.update([candle(2, 60), candle(3, 50), candle(4, 70)]);
    expect(ema.points.map(p => p.value)).toEqual([30, 40, 55]);
    const warm = new EmaSeries(3, [candle(0, 10), candle(1, 20)]);
    warm.update([candle(1, 40)]);
    warm.update([candle(1, 50), candle(2, 60)]);
    expect(warm.points[0]!.value).toBe(40);
});

test('窗口裁剪与完整历史连续计算相同，未改 EMA 保留状态，新增周期从保留窗口播种', () => {
    const store = new CandleStore(7);
    store.setIndicators([{ type: 'ema', period: 4 }, { type: 'ema', period: 1 }]);
    let full = Array.from({ length: 7 }, (_, i) => candle(i, Math.sin(i) * 10 + i + 100));
    store.initialize(full);
    for (let index = 7; index < 32; index++) {
        const previous = full.at(-1)!;
        const changed = candle(index - 1, previous[4] + 2);
        const next = candle(index, Math.sin(index) * 10 + index + 100);
        full = [...full.slice(0, -1), changed, next];
        const delta = store.merge([changed, next]);
        expect(delta.kind).toBe('replace');
        expect(store.rows).toEqual(full.slice(-7));
        const reference = new EmaSeries(4, full).points.filter(p => p.time >= store.rows[0]![0]);
        expect(store.emas.get(4)!.points).toEqual(reference);
    }
    const stable = store.emas.get(4);
    store.setIndicators([{ type: 'ema', period: 4 }, { type: 'ema', period: 3 }]);
    expect(store.emas.get(4)).toBe(stable);
    expect(store.emas.has(1)).toBe(false);
    expect(store.emas.get(3)!.points).toEqual(new EmaSeries(3, store.rows).points);
    expect(store.tail).toBe(full.at(-1)![0]);
});
