import type { SeriesConfig } from '../utils/chartTypes';
import type { SeriesStyle } from '../utils/seriesStyles';
import type { IndicatorAnnotation, IndicatorSpec, IndicatorTheme } from './types';
import { parseIndicatorAnnotation, indicatorKey, legacySeriesKey } from './parameters';
import { indicatorDefinition } from './definitions';
import { indicatorSeries, referenceLines, includeReferenceRange } from './presentation';

export interface LegacyDisplayInput extends SeriesStyle {
    show: boolean;
    showInLegend?: boolean;
    indicator?: IndicatorAnnotation;
    referenceFor?: string;
}
export interface LegacyIndicatorGroup {
    spec: IndicatorSpec; pane: number; index: number;
    items: Array<{ index: number; output: string; show: boolean }>;
}

/** 每个 chart 独立校验文件组，不套用 market 的配置去重或计算能力限制。 */
export function legacyGroups(panes: LegacyDisplayInput[][], scope: string): Map<string, LegacyIndicatorGroup> {
    const groups = new Map<string, LegacyIndicatorGroup>();
    const located = (pane: number, item: number) => `${scope} pane ${pane} item ${item}`;
    panes.forEach((items, pane) => items.forEach((item, index) => {
        if (!item.indicator) return;
        try {
            const annotation = parseIndicatorAnnotation(item.indicator);
            const role = indicatorDefinition(annotation.spec.type).outputs.find(output => output.key === annotation.output)!;
            if (item.type !== role.primitive.toLowerCase()) throw new Error('输出角色与系列 type 不匹配');
            const group = groups.get(annotation.id) ?? { spec: annotation.spec, pane, index: groups.size, items: [] };
            if (group.pane !== pane || indicatorKey(group.spec) !== indicatorKey(annotation.spec)) throw new Error('同组参数与 Pane 必须一致');
            if (group.items.some(entry => entry.output === annotation.output)) throw new Error('同组输出角色不能重复');
            group.items.push({ index, output: annotation.output, show: item.show });
            groups.set(annotation.id, group);
        } catch (error) { throw new Error(`${located(pane,index)}: ${(error as Error).message}`); }
    }));
    panes.forEach((items,pane) => items.forEach((item,index) => {
        if (item.referenceFor === undefined) return;
        const group = typeof item.referenceFor === 'string' ? groups.get(item.referenceFor) : undefined;
        if (item.type !== 'hline' || !group || group.pane !== pane || !Number.isFinite(item.hLineOpt?.value)) {
            throw new Error(`${located(pane,index)}: referenceFor 必须关联同 Pane 的已有指标组，且只用于有效 hline`);
        }
    }));
    return groups;
}
export function validateLegacyIndicators(charts: LegacyDisplayInput[][][], name: string) {
    charts.forEach((panes, slot) => { legacyGroups(panes, `${name} slot ${slot}`); });
}

export function legacyIndicatorSeries(item: LegacyDisplayInput, group: LegacyIndicatorGroup, theme: IndicatorTheme): SeriesConfig {
    const annotation = item.indicator!;
    const definitions = indicatorDefinition(group.spec.type).outputs;
    const role = definitions.findIndex(output => output.key === annotation.output);
    const descriptor = indicatorSeries(group.spec, group.index, theme, group.pane, false)[role]!;
    const explicit = item.type === 'line' ? item.lineOpt : item.histogramOpt;
    const options = Object.fromEntries(Object.entries(explicit ?? {}).filter(([,value]) => value !== undefined));
    return { ...descriptor, name: legacySeriesKey(annotation.id, annotation.output), priceLines: [],
        valueFormatter: options.priceFormat === undefined ? descriptor.valueFormatter : undefined,
        options: { ...descriptor.options, ...options, visible: !!item.show }, showInLegend: item.showInLegend ?? false };
}

function explicitReference(item: LegacyDisplayInput, inline: boolean) {
    const { value, color, label, showLabel, ...options } = item.hLineOpt!;
    return { price: value, color, lineWidth: 1, lineStyle: inline ? 1 : 0, axisLabelVisible: true,
        title: inline || showLabel ? label ?? '' : '', ...options };
}

/** 隐藏项也参与默认线抑制；可见线最后再按归属附到现有系列。 */
export function applyLegacyReferences(items: LegacyDisplayInput[], pane: number, groups: Map<string, LegacyIndicatorGroup>,
    records: Map<number, SeriesConfig>, fallback: SeriesConfig | undefined, theme: IndicatorTheme) {
    const explicit = items.flatMap((item,index) => item.hLineOpt
        ? [{ item, index, group: item.referenceFor ?? item.indicator?.id, value: item.hLineOpt.value }] : []);
    const owners = new Map<string, SeriesConfig>();
    for (const [id, group] of groups) {
        if (group.pane !== pane) continue;
        const visible = group.items.find(entry => entry.show && records.has(entry.index));
        if (!visible) continue;
        const owner = records.get(visible.index)!; owners.set(id,owner);
        owner.priceLines = referenceLines(group.spec,theme).filter(line => !explicit.some(entry =>
            entry.value === line.price && (entry.group === undefined || entry.group === id)));
    }
    for (const entry of explicit) {
        if (!entry.item.show) continue;
        const target = entry.item.type === 'hline' ? (entry.group ? owners.get(entry.group) : fallback) : records.get(entry.index);
        if (!target) continue;
        target.priceLines = [...(target.priceLines ?? []), explicitReference(entry.item,entry.item.type !== 'hline')];
    }
    for (const record of new Set([...records.values(), ...(fallback ? [fallback] : [])])) includeReferenceRange(record);
}
