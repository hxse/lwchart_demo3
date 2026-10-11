import { expect, test } from 'bun:test';
import { IndicatorStream } from '../../src/indicators/IndicatorStream';
import { parseIndicator } from '../../src/indicators/parameters';
import { directResults, simulatedInputs } from '../fixtures/indicator-reference';
import type { IndicatorInput, IndicatorSpec } from '../../src/indicators/types';

const candidates = ['sma,5','ema,5','dema,5','tema,5','rsi,5','cci,5','macd,3,7,4','atr,5','adx,5','er,5','bbands,5,2'];
function identical(stream: IndicatorStream, spec: IndicatorSpec, full: IndicatorInput[], firstTime = -Infinity) {
    const expected = directResults(spec, full);
    const actual = stream.snapshot().outputs;
    expect([...actual.keys()]).toEqual([...expected.keys()] as any);
    for (const [role, values] of expected) {
        const points = actual.get(role as any)!;
        const reference = values.filter(point => point.time >= firstTime);
        expect(points.length).toBe(reference.length);
        points.forEach((point, index) => {
            const other = reference[index]!;
            expect(point.time).toBe(other.time);
            expect(point.state).toBe(other.state);
            expect(Object.is(point.value, other.value)).toBe(true);
        });
    }
}
for (const candidate of candidates) test(`${candidate} 原生完整重放与末根覆盖／批量追加／裁剪严格相同`, () => {
    const spec = parseIndicator(candidate);
    const data = simulatedInputs(96);
    const full = data.slice(0, 1).map(input => ({ ...input }));
    const stream = new IndicatorStream(spec, full);
    identical(stream, spec, full);
    for (let pass = 0; pass < 4; pass++) {
        full[0] = { ...full[0]!, high: full[0]!.high + .37, close: full[0]!.close + .11 };
        stream.replace(full[0]); identical(stream, spec, full);
    }
    let firstTime = -Infinity;
    for (let index = 1; index < data.length; index++) {
        full.push({ ...data[index]! }); stream.add(full.at(-1)!);
        for (let pass = 0; pass < 3; pass++) {
            full[full.length - 1] = { ...full.at(-1)!, high: full.at(-1)!.high + .09, close: full.at(-1)!.close - .03 };
            stream.replace(full.at(-1)!);
            identical(stream, spec, full, firstTime);
        }
        firstTime = full[Math.max(0, full.length - 17)]!.time;
        stream.trim(firstTime); identical(stream, spec, full, firstTime);
    }
});

test('仅覆盖当前末根；当前窗口一根不改变累计输入数量', () => {
    const spec = parseIndicator('ema,3');
    const data = simulatedInputs(20);
    const stream = new IndicatorStream(spec, data);
    stream.trim(data.at(-1)!.time);
    expect(stream.inputCount).toBe(20);
    expect(() => stream.replace(data[0]!)).toThrow('当前末根');
    expect(() => stream.add(data.at(-1)!)).toThrow('晚于末根');
    expect(() => new IndicatorStream({ type: 'ema', period: 0 })).toThrow('EMA 周期');
});

test('完整最大窗口初始化后，后续更新不改写已发布快照', () => {
    const data = simulatedInputs(10001);
    const stream = new IndicatorStream(parseIndicator('ema,14'), data.slice(0,10000));
    const old = stream.snapshot();
    stream.add(data[10000]!);
    expect(old.outputs.get('value')).toHaveLength(10000);
    expect(stream.snapshot().outputs.get('value')).toHaveLength(10001);
    expect(stream.inputCount).toBe(10001);
});
