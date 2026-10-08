import { expect, test } from 'bun:test';
import { EmaSeries, type EmaPoint } from '../../src/crypto/data/EmaSeries';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { candle } from '../fixtures/data';

type Pair = [number, number];
type Expected = Record<string, Pair[]>;
interface ReferenceCase {
    name: string; capacity: number; periods: number[]; initial: Pair[]; expected: Expected;
    steps: { kind: 'merge' | 'reload'; rows: Pair[]; expected: Expected }[];
}
interface Reference {
    reference: { absolute_tolerance: number; relative_tolerance: number };
    cases: ReferenceCase[];
}
// 独立参考值来自固定版本的 pandas-ta-classic，运行测试时不执行 Python 或联网。
const fixture: Reference = await Bun.file(new URL('../fixtures/ema-reference.json', import.meta.url)).json();
const toRows = (pairs: Pair[]) => pairs.map(([index, close]) => candle(index, close));

function compare(actual: EmaPoint[], expected: EmaPoint[]) {
    expect(actual.map(point => point.time)).toEqual(expected.map(point => point.time));
    expected.forEach((point, index) => {
        const tolerance = fixture.reference.absolute_tolerance + fixture.reference.relative_tolerance * Math.abs(point.value);
        expect(Math.abs(actual[index]!.value - point.value)).toBeLessThanOrEqual(tolerance);
    });
}

for (const sample of fixture.cases) test(`EMA 独立标准对照：${sample.name}`, () => {
    const store = new CandleStore(sample.capacity);
    store.setIndicators(sample.periods.map(period => ({ type: 'ema', period })));
    let full = new Map<number, number>(sample.initial.slice(-sample.capacity));
    const history = () => [...full.entries()].sort(([a], [b]) => a - b);
    store.initialize(toRows(history()));

    function verify(expected: Expected) {
        const rows = toRows(history());
        expect(store.rows).toEqual(rows.slice(-sample.capacity));
        const firstTime = store.rows[0]![0];
        for (const period of sample.periods) {
            const golden = expected[String(period)]!.map(([index, value]) => ({ time: candle(index)[0], value }));
            const incremental = store.emas.get(period)!.points;
            // 完整模拟历史包含已经裁掉的旧根，全量计算与增量始终使用相同初始化起点。
            const batch = new EmaSeries(period, rows).points.filter(point => point.time >= firstTime);
            compare(incremental, golden);
            compare(batch, golden);
            compare(incremental, batch);
        }
    }

    verify(sample.expected);
    for (const step of sample.steps) {
        if (step.kind === 'reload') {
            full = new Map(step.rows.slice(-sample.capacity));
            store.initialize(toRows(history()));
        } else {
            expect(store.merge(toRows(step.rows))).not.toBeNull();
            for (const [index, close] of step.rows) full.set(index, close);
        }
        verify(step.expected);
    }
});
