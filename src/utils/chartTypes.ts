/**
 * 图表相关的类型定义
 * 用于 LWChart 组件和 GridItemBuilder
 */

import type { CandlestickData, LineData, UTCTimestamp, ChartOptions, DeepPartial } from 'lightweight-charts';

export interface SeriesDataPatch {
    name: string;
    data: CandlestickData<UTCTimestamp>[] | LineData<UTCTimestamp>[];
}

export type SeriesMode = 'replace' | 'reconcile';

export interface ChartApi {
    setCrosshair: (param: any) => void;
    clearCrosshair: () => void;
    scrollToTime: (time: number) => void;
    resetTimeScale: () => void;
    fitContent: () => void;
    applyOptions: (options: DeepPartial<ChartOptions>) => void;
    replaceSeriesData: (patches: SeriesDataPatch[]) => void;
    updateSeriesData: (patches: SeriesDataPatch[]) => void;
}

export interface SeriesConfig {
    type: "Candlestick" | "Line" | "Area" | "Baseline" | "Histogram" | "Bar" | "SlTpLine" | "PositionArrow";
    data: any[];
    pane: number; // 0 for main, 1+ for extra panes
    options?: any;
    name?: string;
    priceLines?: any[];
    markers?: any[];  // 仓位进出场标记
    showInLegend?: boolean;
}

export interface ChartConfig {
    id: string;
    series: SeriesConfig[];
}
