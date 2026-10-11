import { indicatorDefinition, indicatorDefinitions } from './definitions';
import type { IndicatorSpec, IndicatorType } from './types';

export const tradingSignalsVersion = '8.3.0';
// 不在运行时探测或过滤失败。能力变更必须先通过固定样本与严格对齐。
const unavailable: Partial<Record<IndicatorType, { reason: string; reproduction: string }>> = {
    adx: { reason: 'trading-signals 8.3.0 在连续零波幅后产生 NaN，后续平滑不能恢复',
        reproduction: 'tests/unit/indicator-reliability.test.ts' },
};
export function indicatorSupport(type: IndicatorType) {
    indicatorDefinition(type);
    const issue = unavailable[type];
    return issue ? { available: false, ...issue } : { available: true, reason: '', reproduction: '' };
}
export function assertComputable(spec: IndicatorSpec) {
    const support = indicatorSupport(spec.type);
    if (!support.available) throw new Error(`${indicatorDefinition(spec.type).title} 当前不支持 market 计算：${support.reason}`);
}
export function computableIndicatorTypes(): IndicatorType[] {
    return Object.values(indicatorDefinitions).filter(d => indicatorSupport(d.type).available).map(d => d.type);
}
export function unavailableIndicatorTypes(): IndicatorType[] {
    return Object.values(indicatorDefinitions).filter(d => !indicatorSupport(d.type).available).map(d => d.type);
}
