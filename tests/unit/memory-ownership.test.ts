import { expect, test } from 'bun:test';
import { validateBatch } from '../../src/crypto/data/ohlcv';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { IndicatorStream } from '../../src/indicators/IndicatorStream';
import { parseIndicator } from '../../src/indicators/parameters';
import { candle } from '../fixtures/data';

test('借用校验接受冻结输入，状态取得所有权后不受输入修改影响', () => {
    const frozen = Object.freeze([Object.freeze(candle(0)), Object.freeze(candle(1))]);
    expect(validateBatch({ rows: frozen }, 2).rows).toEqual([candle(0), candle(1)]);
    const rows = [candle(0), candle(1)];
    const store = new CandleStore(3);
    store.setIndicators([parseIndicator('ema,2')]);
    store.initialize(validateBatch({ rows }, 3).rows);
    const initial = store.snapshot();
    const initialValue = structuredClone(initial);
    rows[0]![4] = -100;
    rows.length = 0;
    expect(store.snapshot()).toEqual(initialValue);

    const batch = [candle(1, 120), candle(2), candle(3)];
    expect(store.merge(validateBatch({ rows: batch }, 3).rows).kind).toBe('replace');
    const updated = structuredClone(store.snapshot());
    batch[0]![4] = -200;
    batch[2]![5] = -1;
    expect(store.snapshot()).toEqual(updated);
    expect(initial).toEqual(initialValue);
    expect(store.merge([candle(2), candle(3)]).kind).toBe('update');
});

test('无变化批次仍学习显示窗口外的 recent，后续能识别历史改写', () => {
    const rows = Array.from({ length: 5 }, (_, i) => candle(i));
    const store = new CandleStore(1);
    store.initialize(rows.slice(-1));
    const before = structuredClone(store.snapshot());
    expect(store.merge(rows)).toEqual({ kind: 'update', rows: [], indicators: new Map() });
    rows[1]![5] += 1;
    expect(store.merge(rows)).toMatchObject({ kind: 'reload', reason: 'history-mismatch', time: rows[1]![0] });
    expect(store.snapshot()).toEqual(before);
});

test('多角色快照跨批内覆盖、追加和裁剪保持不变，保留裁剪前参考点', () => {
    const input = (i: number) => ({ time: i + 1, high: 105 + i, low: 99 + i, close: 101 + i });
    const engine = new IndicatorStream(parseIndicator('macd,2,4,2'), Array.from({ length: 8 }, (_, i) => input(i)));
    const first = engine.snapshot();
    const expected = structuredClone(first);
    engine.replace({ ...input(7), close: 109 });
    engine.add(input(8)); engine.add(input(9)); engine.trim(4);
    const second = engine.snapshot();
    const secondExpected = structuredClone(second);
    engine.replace({ ...input(9), close: 112 });
    engine.add(input(10)); engine.trim(6);
    expect(first).toEqual(expected);
    expect(second).toEqual(secondExpected);
    for (const [role, points] of second.outputs) {
        expect(points[0]!.time).toBe(4);
        expect(second.previous!.get(role)).toEqual(first.outputs.get(role)![2]);
    }
    expect(engine.inputCount).toBe(11);
    expect([...engine.snapshot().outputs.values()].map(points => points.at(-1)!.time)).toEqual([11, 11, 11]);
});
