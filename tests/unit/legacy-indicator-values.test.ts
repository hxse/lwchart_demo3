import { expect, test } from 'bun:test';
import { parseIndicator } from '../../src/indicators/parameters';
import { legacyGroups } from '../../src/indicators/legacy';
import { buildLegacyPane } from '../../src/pages/ChartDashboard/logic/LegacyPaneBuilder';
import type { SeriesItemConfig } from '../../src/pages/ChartDashboard/chartDashboard.types';
import type { ParsedFileContent } from '../../src/utils/zipParser';

const files: ParsedFileContent[] = [{ filename: 'data.json', type: 'json', preview: '', data: [90, 100, NaN, 120].map((cci, index) => ({
    time: 1718000000 + index * 60, open: 100, high: 110, low: 90, close: 100, ema: 5000 + index, cci,
})) }];
const candle = (priceScaleId = 'right', type: 'candle' | 'bar' = 'candle'): SeriesItemConfig => ({
    type, show: true, fileName: 'data.json', dataName: ['open', 'high', 'low', 'close'],
    ...(type === 'candle' ? { candleOpt: { priceScaleId } } : { barOpt: { priceScaleId } }),
});
const tagged = (type = 'ema'): SeriesItemConfig => ({ type: 'line', show: true, showInLegend: true,
    fileName: 'data.json', dataName: type, indicator: { id: type, spec: parseIndicator(`${type},2`), output: 'value' } });
const render = (items: SeriesItemConfig[], data = files) => buildLegacyPane(items, 0, 0, data, legacyGroups([items], 'chart slot 0'));

test('均线只在最终与可见蜡烛共享价格轴时退出缩放，left／overlay 和显式回调覆盖成立', () => {
    const ema = tagged();
    expect(render([candle(), ema])[1]!.options.autoscaleInfoProvider()).toBeNull();
    const left = { ...ema, lineOpt: { priceScaleId: 'left' } };
    expect(render([candle(), left])[1]!.options.autoscaleInfoProvider).toBeUndefined();
    expect(render([candle('left', 'bar'), left])[1]!.options.autoscaleInfoProvider()).toBeNull();
    expect(render([candle('left'), ema])[1]!.options.autoscaleInfoProvider).toBeUndefined();
    expect(render([candle(''), { ...ema, lineOpt: { priceScaleId: '' } }])[1]!.options.autoscaleInfoProvider).toBeUndefined();
    const explicit = () => ({ priceRange: { minValue: 0, maxValue: 6000 } });
    expect(render([candle(), { ...ema, lineOpt: { autoscaleInfoProvider: explicit } }])[1]!.options.autoscaleInfoProvider).toBe(explicit);
    expect(render([{ ...candle(), show: false }, ema])[0]!.options.autoscaleInfoProvider).toBeUndefined();
    expect(render([candle(), ema], [{ ...files[0]!, data: [] }])[1]!.options.autoscaleInfoProvider).toBeUndefined();
});

test('注记导入值保留 NaN／null／缺列的缺口和未定义文本，普通无注记系列保持原过滤', () => {
    const cci = tagged('cci');
    const points = render([cci])[0]!.data;
    expect(points).toEqual([{ time: 1718000000, value: 90 }, { time: 1718000060, value: 100 },
        { time: 1718000120, customValues: { displayValue: '未定义' } }, { time: 1718000180, value: 120 }]);
    expect(render([{ ...cci, indicator: undefined }])[0]!.data).toEqual(points.filter(point => 'value' in point));
    const missing: ParsedFileContent[] = [{ ...files[0]!, data: [{ time: 1718000000, cci: null }, { time: 1718000060 }, { time: 1718000120, cci: 0 }] }];
    expect(render([cci], missing)[0]!.data).toEqual([{ time: 1718000000, customValues: { displayValue: '未定义' } },
        { time: 1718000060, customValues: { displayValue: '未定义' } }, { time: 1718000120, value: 0 }]);
});
