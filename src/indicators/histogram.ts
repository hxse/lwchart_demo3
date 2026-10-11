import type { HistogramData, UTCTimestamp, WhitespaceData } from 'lightweight-charts';
import type { IndicatorTheme } from './types';

/** 只解析颜色；不重新计算输入中的指标值。 */
export function histogramColors<T extends { time: unknown; value?: number; color?: string }>(points: T[], theme: IndicatorTheme,
    fixedColor?: string, previous = 0): (T & { color?: string })[] {
    const palette = theme === 'dark' ? ['#26a69a','#b2dfdb','#ef5350','#ffcdd2'] : ['#00897b','#80cbc4','#e53935','#ef9a9a'];
    return points.map(point => {
        const { color: _automaticColor, ...rest } = point;
        if (point.value === undefined) return rest as T;
        const increasing = point.value >= previous;
        previous = point.value;
        return fixedColor !== undefined ? rest as T : { ...rest,
            color: point.value >= 0 ? palette[increasing ? 0 : 1] : palette[increasing ? 3 : 2] } as T;
    });
}
export type IndicatorPlotPoint = HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;
