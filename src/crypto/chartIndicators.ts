import { parseIndicatorList, indicatorListString } from '../indicators/parameters';
import { assertComputable } from '../indicators/support';
import type { IndicatorSpec } from '../indicators/types';
import type { DashboardOptions, DashboardSettings } from './options';

export type ChartIndicatorOverrides = Record<string,IndicatorSpec[]>;
export interface ChartIndicatorDraft { mode: 'inherit' | 'custom' | 'none'; value: string; customized: boolean }

export function parseIndicators(input: unknown): IndicatorSpec[] {
    const result = parseIndicatorList(input);
    result.forEach(assertComputable);
    return result;
}
export function parseChartIndicators(input: unknown, slots: number): ChartIndicatorOverrides {
    if (input === undefined) return {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('窗口指标覆盖必须是对象');
    return Object.fromEntries(Object.entries(input).map(([key,value]) => {
        if (!/^[1-9]\d*$/.test(key) || Number(key)>slots) throw new Error('窗口指标编号必须在当前布局范围内');
        try { return [key,parseIndicators(value)]; }
        catch (error) { throw new Error(`窗口 ${key} 指标：${(error as Error).message}`); }
    }));
}
export function chartIndicators(settings: Pick<DashboardOptions,'indicators'|'chart_indicators'>, index: number): IndicatorSpec[] {
    return settings.chart_indicators[String(index+1)] ?? settings.indicators;
}
export function trimChartIndicators(overrides: ChartIndicatorOverrides, slots: number): ChartIndicatorOverrides {
    return Object.fromEntries(Object.entries(overrides).filter(([key]) => Number(key)<=slots));
}
export function chartIndicatorDrafts(settings: Pick<DashboardSettings,'timeframes'|'indicators'|'chart_indicators'>): ChartIndicatorDraft[] {
    return settings.timeframes.map((_,index) => {
        const explicit = settings.chart_indicators[String(index+1)];
        return { mode: explicit ? (explicit.length ? 'custom' : 'none') : 'inherit',
            value: indicatorListString(explicit ?? settings.indicators), customized: !!explicit?.length };
    });
}
export function resizeChartIndicatorDrafts(drafts: ChartIndicatorDraft[], slots: number, common: string): ChartIndicatorDraft[] {
    const result = drafts.slice(0,slots);
    while (result.length<slots) result.push({mode:'inherit',value:common,customized:false});
    return result;
}
export function parseChartIndicatorDrafts(drafts: ChartIndicatorDraft[]): ChartIndicatorOverrides {
    const overrides: ChartIndicatorOverrides = {};
    drafts.forEach((draft,index) => {
        if (draft.mode==='inherit') return;
        if (draft.mode==='none') { overrides[String(index+1)]=[]; return; }
        if (draft.mode!=='custom') throw new Error(`窗口 ${index+1} 指标模式无效`);
        try { overrides[String(index+1)]=parseIndicators(draft.value); }
        catch (error) { throw new Error(`窗口 ${index+1} 指标：${(error as Error).message}`); }
    });
    return overrides;
}
