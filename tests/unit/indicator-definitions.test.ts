import { describe, expect, test } from 'bun:test';
import { indicatorDefinitions, indicatorDefinition } from '../../src/indicators/definitions';
import { parseIndicator, parseIndicatorList, defaultIndicator, indicatorListString, indicatorKey,
    parseIndicatorAnnotation, marketSeriesKey, legacySeriesKey } from '../../src/indicators/parameters';
import { indicatorLabel, indicatorSeries, indicatorFormatter } from '../../src/indicators/presentation';
import { parseIndicators } from '../../src/crypto/options';

describe('共享指标定义与参数', () => {
    test('十一指标各自具有完整构造、输入、根可用状态和显示定义', () => {
        expect(Object.keys(indicatorDefinitions)).toEqual(['sma','ema','dema','tema','rsi','cci','macd','atr','adx','er','bbands']);
        for (const definition of Object.values(indicatorDefinitions)) {
            const spec = defaultIndicator(definition.type);
            expect(parseIndicator(indicatorKey(spec))).toEqual(spec);
            expect(definition.native.constructor).toBeTruthy();
            expect(['close', 'hlc']).toContain(definition.native.input);
            expect(definition.native.availability).toBe('root-stable');
            expect(definition.outputs.length).toBeGreaterThan(0);
            expect(new Set(definition.outputs.map(o => o.key)).size).toBe(definition.outputs.length);
            const series = indicatorSeries(spec, 0, 'dark', definition.display.placement === 'main' ? 0 : 1);
            expect(series.map(s => s.type)).toEqual(definition.outputs.map(o => o.primitive));
            expect(series.map(s => s.name)).toEqual(definition.outputs.map(o => marketSeriesKey(spec, o.key)));
            expect(series[0]!.priceLines!.map(l => l.price)).toEqual([...definition.display.references]);
            expect(series.every(s => typeof s.options.priceFormat.formatter === 'function')).toBe(true);
        }
        expect(indicatorDefinition('macd').native.movingAverage).toBe('EMA');
        expect(indicatorDefinition('rsi').native.smoothing).toBe('WSMA');
        expect(indicatorDefinition('cci').native.allowNaN).toBe(true);
        expect(indicatorDefinition('adx').native.allowNaN).toBe(false);
        expect(() => indicatorDefinition('constructor')).toThrow('未知指标');
    });
    test('完整 DSL、对象、空列表和规范化键往返', () => {
        const input = 'sma,20;ema,14;dema,20;tema,20;rsi,14;cci,20;macd,12,26,9;atr,14;adx,14;er,10;bbands,20,2';
        const values = parseIndicatorList(input);
        expect(indicatorListString(values)).toBe(input);
        expect(parseIndicatorList(values)).toEqual(values);
        expect(parseIndicatorList('none')).toEqual([]);
        expect(indicatorListString([])).toBe('none');
        expect(parseIndicatorList('sma,14;ema,14;ema,50')).toHaveLength(3);
        expect(parseIndicator('bbands,2,1e-7')).toEqual({ type: 'bbands', period: 2, deviation: 1e-7 });
        expect(indicatorLabel(parseIndicator('bbands,20,2'))).toBe('BBANDS(20,2)');
        expect(indicatorLabel(parseIndicator('ema,14'))).toBe('EMA14');
    });
    test('边界、重复和非法字段在统一解析阶段明确拒绝', () => {
        for (const type of ['sma', 'ema', 'dema', 'tema', 'atr'] as const) {
            expect(parseIndicator(`${type},1`)).toEqual({ type, period: 1 });
            expect(parseIndicator(`${type},100000`)).toEqual({ type, period: 100000 });
        }
        for (const type of ['rsi','cci','adx','er']) expect(() => parseIndicator(`${type},1`)).toThrow('周期');
        for (const input of ['ema', 'EMA,14', 'ema,01', 'ema,0', 'ema,-1', 'ema,1.2', 'ema,100001',
            'macd,26,12,9', 'macd,12,26', 'bbands,20,0', 'bbands,20,Infinity', 'ema,14,50']) {
            expect(() => parseIndicator(input)).toThrow();
        }
        expect(() => parseIndicator({ type: 'ema', period: 14, extra: 1 })).toThrow('未知字段');
        expect(() => parseIndicator({ type: 'ema', period: NaN })).toThrow('EMA 周期');
        expect(() => parseIndicatorList('ema,14;ema,14')).toThrow('重复');
        expect(() => parseIndicatorList(Array.from({ length: 13 }, (_, i) => `ema,${i + 1}`))).toThrow('12');
        expect(parseIndicatorList(Array.from({ length: 12 }, (_, i) => `ema,${i + 1}`))).toHaveLength(12);
    });
    test('文件组与市场计算身份分开，参数及输出校验共用', () => {
        const spec = parseIndicator('macd,12,26,9');
        const a = parseIndicatorAnnotation({ id: 'macd-a', spec, output: 'histogram' });
        const b = parseIndicatorAnnotation({ id: 'macd-b', spec, output: 'histogram' });
        expect(a.spec).toEqual(b.spec);
        expect(legacySeriesKey(a.id, a.output)).not.toBe(legacySeriesKey(b.id, b.output));
        expect(marketSeriesKey(spec, 'histogram')).toBe('market/macd,12,26,9/histogram');
        expect(() => parseIndicatorAnnotation({ id: '1-bad', spec, output: 'histogram' })).toThrow('id');
        expect(() => parseIndicatorAnnotation({ id: 'a', spec, output: 'value' })).toThrow('输出角色');
        expect(() => parseIndicators('rsi,14')).toThrow('当前阶段');
        expect(parseIndicators('ema,14;ema,50')).toEqual([{ type: 'ema', period: 14 }, { type: 'ema', period: 50 }]);
    });
    test('显示、格式和主题来自定义，不以名称影响系列身份', () => {
        const ema = parseIndicator('ema,14');
        const dark = indicatorSeries(ema, 0, 'dark', 0)[0]!;
        const light = indicatorSeries(ema, 0, 'light', 0)[0]!;
        expect(dark.name).toBe(light.name);
        expect(dark.displayName).toBe('EMA14');
        expect(dark.options.color).toBe('#FF9800');
        expect(dark.options.autoscaleInfoProvider()).toBeNull();
        expect(indicatorSeries(parseIndicator('bbands,20,2'), 0, 'dark', 0)[0]!.options.autoscaleInfoProvider).toBeUndefined();
        expect(indicatorFormatter('ratio')(.5)).toBe('50%');
        expect(indicatorFormatter('price')(.00001234567)).toBe('0.00001234567');
    });
});
