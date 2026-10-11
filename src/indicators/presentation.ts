import type { SeriesConfig } from '../utils/chartTypes';
import { indicatorDefinition } from './definitions';
import { marketSeriesKey } from './parameters';
import type { IndicatorFormat, IndicatorOutputDefinition, IndicatorSpec, IndicatorTheme } from './types';

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
export function indicatorSeries(spec: IndicatorSpec, index: number, theme: IndicatorTheme, pane: number): SeriesConfig[] {
    const definition = indicatorDefinition(spec.type);
    return definition.outputs.map((role, outputIndex) => ({
        name: marketSeriesKey(spec, role.key), displayName: role.label ? `${indicatorLabel(spec)} ${role.label}` : indicatorLabel(spec),
        type: role.primitive, pane, data: [], showInLegend: definition.display.legend,
        options: { color: indicatorColor(role.color, index, theme), lineWidth: 1, visible: definition.display.visible,
            priceFormat: indicatorPriceFormat(definition.display.format), priceLineVisible: false,
            ...(definition.display.autoscale === 'candles' ? { autoscaleInfoProvider: () => null } : {}) },
        priceLines: outputIndex ? [] : definition.display.references.map(value => ({
            price: value, color: theme === 'dark' ? 'rgba(170,170,170,.5)' : 'rgba(100,100,100,.5)',
            lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(value),
        })),
    }));
}
