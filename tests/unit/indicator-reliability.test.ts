import { expect, test } from 'bun:test';
import { MACD, EMA, ADX, DX, WSMA } from 'trading-signals';
import golden from '../fixtures/indicator-golden.json';
import { IndicatorStream, IndicatorCalculationError } from '../../src/indicators/IndicatorStream';
import { parseIndicator } from '../../src/indicators/parameters';
import { directResults, simulatedInputs } from '../fixtures/indicator-reference';
import type { IndicatorInput } from '../../src/indicators/types';

const prices = (values: number[]): IndicatorInput[] => values.map((close, index) => ({
    time: Date.UTC(2026, 0, 1) + index * 60000, close, high: close, low: close,
}));
for (const sample of golden.cases) test(`${sample.spec} 独立固定结果及原生直接读取`, () => {
    const spec = parseIndicator(sample.spec);
    const inputs = prices(sample.prices);
    const stream = new IndicatorStream(spec, inputs);
    const reference = directResults(spec, inputs);
    for (const [role, value] of Object.entries(sample.expected)) {
        if (value === undefined) continue;
        const point = stream.snapshot().outputs.get(role as any)!.at(-1)!;
        expect(point.state).toBe('value');
        expect(Object.is(point.value, value)).toBe(true);
        expect(Object.is(reference.get(role)!.at(-1)!.value, value)).toBe(true);
    }
});

test('根可用状态冻结首点，MACD 不等待内部 signal 独立预热', () => {
    const cases = [['sma,3',3], ['ema,3',3], ['dema,3',3], ['tema,3',7], ['rsi,3',4],
        ['cci,3',3], ['macd,2,3,9',3], ['atr,3',3], ['adx,3',5], ['er,3',3], ['bbands,3,2',3]] as const;
    for (const [text, count] of cases) {
        const inputs = simulatedInputs(count);
        const stream = new IndicatorStream(parseIndicator(text), inputs);
        for (const points of stream.snapshot().outputs.values()) {
            expect(points.slice(0, -1).every(point => point.state === 'warmup')).toBe(true);
            expect(points.at(-1)!.state).toBe('value');
        }
    }
    const native = new MACD(new EMA(2), new EMA(3), new EMA(9));
    for (const value of [1,2,3]) native.add(value);
    expect(native.isStable).toBe(true);
    expect(native.signal.isStable).toBe(false);
    expect(Number.isFinite(native.getResultOrThrow().signal)).toBe(true);
});

test('合法常量窗口、有效零及 CCI 未定义后的恢复不会补零或污染后值', () => {
    for (const name of ['sma','ema','dema','tema','rsi','atr','adx','er']) {
        const inputs = prices(Array(20).fill(100));
        const stream = new IndicatorStream(parseIndicator(`${name},3`), inputs);
        const actual = stream.snapshot().outputs.get('value')!.at(-1)!;
        expect(actual.state).toBe('value');
        expect(Number.isFinite(actual.value)).toBe(true);
        if (['atr','adx','er'].includes(name)) expect(Object.is(actual.value, 0)).toBe(true);
    }
    const inputs = prices([100,101]);
    const cci = new IndicatorStream(parseIndicator('cci,2'), inputs);
    expect(cci.snapshot().outputs.get('value')!.at(-1)!.state).toBe('value');
    inputs[1] = { ...inputs[1]!, high: 100, low: 100, close: 100 };
    cci.replace(inputs[1]);
    const point = cci.snapshot().outputs.get('value')!.at(-1)!;
    expect(point.state).toBe('undefined'); expect(Number.isNaN(point.value)).toBe(true);
    inputs.push(prices([100,100,102])[2]!); cci.add(inputs[2]!);
    expect(cci.snapshot().outputs.get('value')!.at(-1)!.state).toBe('value');
    expect(Object.is(cci.snapshot().outputs.get('value')!.at(-1)!.value,
        directResults(parseIndicator('cci,2'), inputs).get('value')!.at(-1)!.value)).toBe(true);
});

test('ADX 依赖补丁：原生 DX 平盘返回有效零，ADX 平滑恢复符合固定小样本', () => {
    const dx = new DX(2, WSMA);
    for (const input of prices([100,100,100])) dx.add(input);
    expect(dx.isStable).toBe(true);
    expect(Object.is(dx.getResultOrThrow(), 0)).toBe(true);
    expect(Object.is(dx.pdi, 0)).toBe(true); expect(Object.is(dx.mdi, 0)).toBe(true);
    const native = new ADX(2, WSMA);
    const inputs = prices([100,100,100,101,102,103,104]);
    const values: number[] = [];
    for (const input of inputs) { native.add(input); if (native.isStable) values.push(native.getResultOrThrow()); }
    const expected = [0,50,75,87.5,93.75];
    expect(values).toHaveLength(expected.length);
    values.forEach((value, index) => expect(Object.is(value, expected[index])).toBe(true));
    const points = new IndicatorStream(parseIndicator('adx,2'), inputs).snapshot().outputs.get('value')!;
    expect(points.slice(0,2).map(point => point.state)).toEqual(['warmup','warmup']);
    points.slice(2).forEach((point, index) => {
        expect(point.state).toBe('value'); expect(Object.is(point.value, expected[index])).toBe(true);
    });
});

test('有限行情导致不可表达结果时明确计算失败，不过滤 Infinity', () => {
    const stream = new IndicatorStream(parseIndicator('sma,2'));
    stream.add({ time: 1, high: 1e308, low: 1e308, close: 1e308 });
    expect(() => stream.add({ time: 2, high: 1e308, low: 1e308, close: 1e308 })).toThrow(IndicatorCalculationError);
    expect(stream.snapshot().outputs.get('value')).toEqual([{ time: 1, state: 'warmup' }]);
});

test('ADX 补丁只处理全零边界，其他非有限结果仍明确失败', () => {
    try {
        new IndicatorStream(parseIndicator('adx,2'), prices([-1e308,1e308,0]));
        throw new Error('应拒绝非有限 ADX 输出');
    } catch (error) {
        expect(error).toBeInstanceOf(IndicatorCalculationError);
        expect((error as IndicatorCalculationError).indicator).toBe('adx,2');
        expect((error as IndicatorCalculationError).output).toBe('value');
    }
});

test('零的符号参与末根输入和原始数值的严格对齐', () => {
    const stream = new IndicatorStream(parseIndicator('ema,1'), [{ time: 1, high: 0, low: 0, close: 0 }]);
    stream.replace({ time: 1, high: -0, low: -0, close: -0 });
    expect(Object.is(stream.snapshot().outputs.get('value')!.at(-1)!.value, -0)).toBe(true);
});
