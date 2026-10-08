import { expect, test, spyOn } from 'bun:test';
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
        expect(delta!.kind).toBe('replace');
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

test('最近五根多处修正与连续参考一致，重复窗口不重复递推，成交量变化不重算', () => {
    const store = new CandleStore(40);
    store.setIndicators([{ type: 'ema', period: 14 }, { type: 'ema', period: 50 }]);
    const original = Array.from({ length: 30 }, (_, index) => candle(index, 100 + Math.sin(index) * 8));
    store.initialize(original);
    const revised = [...original.slice(0, 26), candle(26, 130), candle(27, 140), original[28]!, candle(29, 150)];
    const delta = store.merge(revised.slice(-5))!;
    expect(delta.kind).toBe('update'); expect(delta.rows).toHaveLength(3);
    expect(store.emas.get(14)!.points).toEqual(new EmaSeries(14, revised).points);
    const update = spyOn(store.emas.get(14)!, 'update');
    try {
        expect(store.merge(revised.slice(-5))!.rows).toEqual([]);
        const volume = [...revised[29]!] as ReturnType<typeof candle>; volume[5] += 2;
        expect(store.merge([...revised.slice(-5, -1), volume])!.rows).toEqual([volume]);
        expect(update).not.toHaveBeenCalled();
        expect(store.emas.get(14)!.points).toEqual(new EmaSeries(14, revised).points);
    } finally { update.mockRestore(); }
});

test('保留一根时忽略窗口外旧行，覆盖及新增参与 EMA；无法插入历史点则返回重载', () => {
    const store = new CandleStore(1);
    store.setIndicators([{ type: 'ema', period: 3 }]); store.initialize([candle(0, 10)]);
    store.merge([candle(-2), candle(-1), candle(0, 20), candle(1, 30), candle(2, 40)]);
    expect(store.rows).toEqual([candle(2, 40)]);
    expect(store.emas.get(3)!.points).toEqual([{ time: candle(2)[0], value: 30 }]);
    const missing = new CandleStore(20); missing.initialize([candle(0), candle(2)]);
    expect(missing.merge([candle(0), candle(1), candle(2)])).toBeNull();
    expect(missing.rows).toEqual([candle(0), candle(2)]);
});
