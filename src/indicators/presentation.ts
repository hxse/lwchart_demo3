import type { SeriesConfig } from '../utils/chartTypes';
import { indicatorDefinition } from './definitions';
import { marketSeriesKey } from './parameters';
import type { IndicatorFormat, IndicatorOutputDefinition, IndicatorResults, IndicatorSpec, IndicatorTheme } from './types';

export const movingAverageColors = ['#FF9800', '#4CAF50', '#2196F3'] as const;
const priceFormatter = new Intl.NumberFormat('en', { maximumSignificantDigits: 8 });
const numberFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const ratioFormatter = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 2 });
export function indicatorFormatter(format: IndicatorFormat) {
    return (value: number) => (format === 'price' ? priceFormatter : format === 'ratio' ? ratioFormatter : numberFormatter).format(value);
}
export function indicatorPriceFormat(format: IndicatorFormat) {
    return { type: 'custom', minMove: format === 'price' ? 1e-8 : format === 'ratio' ? 1e-4 : .01, formatter: indicatorFormatter(format) };
}
export function indicatorLabel(spec: IndicatorSpec) {
    const definition = indicatorDefinition(spec.type);
    const parameters = spec as unknown as Record<string, number>;
    const values = definition.parameters.map(p => parameters[p.name]);
    return `${definition.title}${values.length === 1 ? values[0] : `(${values.join(',')})`}`;
}
export function indicatorColor(role: IndicatorOutputDefinition['color'], index: number, theme: IndicatorTheme) {
    if (role === 'primary') return movingAverageColors[index % movingAverageColors.length];
    if (role === 'secondary') return theme === 'dark' ? '#b19cd9' : '#7952b3';
    if (role === 'lower') return theme === 'dark' ? '#66bb6a' : '#388e3c';
    return theme === 'dark' ? '#64b5f6' : '#1976d2';
}
export const indicatorStateLabels = { warmup: '预热', value: '', undefined: '未定义' } as const;
export function indicatorResultState(results: IndicatorResults | undefined) {
    const states = results ? [...results.outputs.values()].map(points => points.at(-1)?.state ?? 'warmup') : ['warmup'];
    return states.includes('undefined') ? 'undefined' : states.every(state => state === 'value') ? 'value' : 'warmup';
}
export function referenceLines(spec: IndicatorSpec, theme: IndicatorTheme) {
    return indicatorDefinition(spec.type).display.references.map(value => ({
        price: value, color: theme === 'dark' ? 'rgba(170,170,170,.5)' : 'rgba(100,100,100,.5)',
        lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '',
    }));
}
export function indicatorSeries(spec: IndicatorSpec, index: number, theme: IndicatorTheme, pane: number, hasCandles = true): SeriesConfig[] {
    const definition = indicatorDefinition(spec.type);
    const series: SeriesConfig[] = definition.outputs.map((role, outputIndex) => ({
        name: marketSeriesKey(spec, role.key), displayName: role.label ? `${indicatorLabel(spec)} ${role.label}` : indicatorLabel(spec),
        type: role.primitive, pane, data: [], showInLegend: definition.display.legend,
        valueFormatter: indicatorFormatter(definition.display.format), paneWeight: definition.display.paneWeight,
        options: { color: indicatorColor(role.color, index, theme), lineWidth: 1, visible: definition.display.visible,
            priceFormat: indicatorPriceFormat(definition.display.format), priceLineVisible: false },
        priceLines: outputIndex ? [] : referenceLines(spec, theme),
    }));
    for (const output of series) applyIndicatorCandleScale(output, spec, hasCandles ? ['right'] : []);
    return series;
}

/** 按最终轴关系应用元数据策略；显式回调优先，独立轴必须由指标自身缩放。 */
export function applyIndicatorCandleScale(series: SeriesConfig, spec: IndicatorSpec, candleScaleIds: readonly string[]) {
    if (indicatorDefinition(spec.type).display.autoscale !== 'candles' || series.options?.autoscaleInfoProvider !== undefined) return;
    const scale = series.options?.priceScaleId ?? 'right';
    if (scale !== '' && candleScaleIds.includes(scale)) series.options = { ...series.options, autoscaleInfoProvider: () => null };
}

/** 参考线参与可见轴范围；只处理描述中的价格，不识别指标名称。 */
export function includeReferenceRange(series: SeriesConfig) {
    const prices = (series.priceLines ?? []).map(line => line.price).filter(Number.isFinite);
    if (!prices.length || series.options?.autoscaleInfoProvider) return;
    series.options = { ...series.options, autoscaleInfoProvider: (base: () => any) => {
        const info = base();
        const min = Math.min(...prices, info?.priceRange.minValue ?? Infinity);
        const max = Math.max(...prices, info?.priceRange.maxValue ?? -Infinity);
        return { ...info, priceRange: { minValue: min, maxValue: max } };
    } };
}
