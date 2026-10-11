import { expect, test } from 'bun:test';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { parseIndicator, indicatorKey } from '../../src/indicators/parameters';
import { IndicatorCalculationError } from '../../src/indicators/IndicatorStream';
import { assertComputable, computableIndicatorTypes, tradingSignalsVersion } from '../../src/indicators/support';
import { directResults } from '../fixtures/indicator-reference';
import { candle } from '../fixtures/data';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';
import type { IndicatorSpec } from '../../src/indicators/types';
import manifest from '../../package.json';

const input = (row: OhlcvRow) => ({ time: row[0], high: row[2], low: row[3], close: row[4] });
function matches(store: CandleStore, spec: IndicatorSpec, history: OhlcvRow[]) {
    const reference = directResults(spec, history.map(input));
    const actual = store.indicators.get(indicatorKey(spec))!.outputs;
    for (const [role, points] of reference) {
        const expected = points.filter(point => point.time >= store.rows[0]![0]);
        const values = actual.get(role as any)!;
        expect(values.length).toBe(expected.length);
        values.forEach((point, index) => {
            expect(point.time).toBe(expected[index]!.time);
            expect(point.state).toBe(expected[index]!.state);
            expect(Object.is(point.value, expected[index]!.value)).toBe(true);
        });
    }
}

test('只覆盖旧末根并追加；十种可计算指标持续裁剪与同起点原生重放严格一致', () => {
    const specs = ['sma,3','ema,3','dema,3','tema,3','rsi,3','cci,3','macd,2,4,2','atr,3','er,3','bbands,3,2'].map(parseIndicator);
    const history = Array.from({ length: 7 }, (_, i) => candle(i));
    const store = new CandleStore(5); store.setIndicators(specs); store.initialize(history);
    for (let next = 7; next < 24; next += 2) {
        history[history.length - 1] = candle(history.length - 1, 110 + next);
        history.push(candle(next), candle(next + 1));
        const change = store.merge(history.slice(-5));
        expect(change.kind).toBe('replace'); expect(store.rows).toEqual(history.slice(-5));
        for (const spec of specs) matches(store, spec, history);
    }
});

test('没有旧末根，即使存在其它重叠也必须重载；校验前不更新原生状态', () => {
    const rows = Array.from({ length: 5 }, (_, i) => candle(i));
    const spec = parseIndicator('ema,3');
    const store = new CandleStore(20); store.setIndicators([spec]); store.initialize(rows);
    const snapshot = store.snapshot();
    expect(store.merge([rows[2]!, rows[3]!, candle(5)] )).toEqual({ kind: 'reload', reason: 'missing-tail', oldTail: rows[4]![0] });
    expect(store.snapshot()).toEqual(snapshot);
    expect(store.merge([rows[2]!, candle(3, 110), candle(4, 130), candle(5)]).kind).toBe('reload');
    expect(store.snapshot()).toEqual(snapshot);
    const updated = [...rows.slice(0, -1), candle(4, 135), candle(5)];
    expect(store.merge(updated.slice(-5)).kind).toBe('update'); matches(store, spec, updated);
});

test('所有历史 OHLCV 字段和未知历史插入均属于防御性重载', () => {
    const rows = Array.from({ length: 5 }, (_, i) => candle(i));
    for (const column of [1,2,3,4,5]) {
        const store = new CandleStore(5); store.initialize(rows);
        const changed = [...rows[2]!] as OhlcvRow; changed[column]! += column === 3 ? -1 : 1;
        const result = store.merge([changed, rows[3]!, rows[4]!]);
        expect(result.kind).toBe('reload');
        if (result.kind === 'reload') {
            expect(result.reason).toBe('history-mismatch'); expect(result.differences).toHaveLength(1);
        }
        expect(store.rows).toEqual(rows);
    }
    const store = new CandleStore(5); store.initialize(rows);
    const insertion = [...rows[2]!] as OhlcvRow; insertion[0] += 1000;
    expect(store.merge([insertion, rows[4]!])).toMatchObject({ kind: 'reload', reason: 'history-insertion', time: insertion[0] });
});

test('容量一仍比较最近收到的五根，忽略尚不可比较的更早数据；成交量不重算指标', () => {
    const rows = Array.from({ length: 5 }, (_, i) => candle(i));
    const store = new CandleStore(1); store.setIndicators([parseIndicator('ema,1')]); store.initialize(rows.slice(-1));
    expect(store.merge(rows).kind).toBe('update');
    expect(store.rows).toEqual(rows.slice(-1));
    const result = store.merge([candle(2, 110), rows[3]!, rows[4]!]);
    expect(result.kind).toBe('reload');
    const volume = [...rows[4]!] as OhlcvRow; volume[5] += 1;
    const onlyVolume = store.merge([volume]);
    expect(onlyVolume.kind).toBe('update');
    if (onlyVolume.kind !== 'reload') expect(onlyVolume.indicators.size).toBe(0);
    expect(store.rows).toEqual([volume]);
});

test('配置增删只初始化变化实例，全量重载重置全部起点，重复批次不计算', () => {
    const original = Array.from({ length: 7 }, (_, i) => candle(i));
    const ema = parseIndicator('ema,3'); const sma = parseIndicator('sma,2');
    const store = new CandleStore(3); store.setIndicators([ema]); store.initialize(original);
    const result = store.merge(original.slice(-5));
    if (result.kind !== 'reload') { expect(result.rows).toEqual([]); expect(result.indicators.size).toBe(0); }
    else throw new Error('重复窗口不应重载');
    store.setIndicators([sma, ema]); matches(store, ema, original); matches(store, sma, original.slice(-3));
    expect(store.setIndicators([sma, ema])).toBe(false);
    store.setIndicators([sma]); expect(store.indicators.has('ema,3')).toBe(false);
    const fresh = [candle(20),candle(21),candle(22)]; store.initialize(fresh); matches(store, sma, fresh);
});

test('原子提交：后续一根计算失败时行情和展示都保持；更改配置可恢复', () => {
    const rows = [candle(0),candle(1)];
    const store = new CandleStore(10); store.setIndicators([parseIndicator('sma,2'),parseIndicator('ema,2')]); store.initialize(rows);
    const before = store.snapshot();
    const huge = (index: number): OhlcvRow => [candle(index)[0],1e308,1e308,1e308,1e308,10];
    expect(() => store.merge([rows[0]!,huge(1),huge(2)])).toThrow(IndicatorCalculationError);
    expect(store.snapshot()).toEqual(before);
    store.setIndicators([parseIndicator('ema,2')]); matches(store, parseIndicator('ema,2'), rows);
    expect(store.merge([rows[1]!,candle(2)]).kind).toBe('update');
});

test('不合格 ADX 明确拒绝，其余十种支持且库精确锁定；没有旧算法回退', () => {
    expect(manifest.dependencies['trading-signals']).toBe(tradingSignalsVersion);
    expect(computableIndicatorTypes()).toEqual(['sma','ema','dema','tema','rsi','cci','macd','atr','er','bbands']);
    const spec = parseIndicator('adx,14');
    expect(() => assertComputable(spec)).toThrow('ADX 当前不支持');
    expect(() => new CandleStore(10).setIndicators([spec])).toThrow('后续平滑不能恢复');
});
