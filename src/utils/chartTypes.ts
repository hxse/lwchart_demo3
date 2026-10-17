/**
 * 图表相关的类型定义
 * 用于 LWChart 组件和 GridItemBuilder
 */

import type { CandlestickData, LineData, HistogramData, WhitespaceData, UTCTimestamp, ChartOptions, DeepPartial, LineStyle, LineWidth } from 'lightweight-charts';

export interface ChartPriceLine {
    id: string; price: number; color: string; title: string;
    lineStyle?: LineStyle; lineWidth?: LineWidth; axisLabelVisible?: boolean;
}
export interface PriceLineGroup {
    series: string; id: string; lines: ChartPriceLine[]; autoscale?: boolean;
    labelPosition?: 'axis' | 'left';
}

export interface SeriesDataPatch {
    name: string;
    data: (CandlestickData<UTCTimestamp> | LineData<UTCTimestamp> | HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[];
}

export type SeriesMode = 'replace' | 'reconcile';
export type PaneWeightMode = 'initial' | 'preset';

export interface ChartApi {
    setCrosshair: (param: any) => void;
    clearCrosshair: () => void;
    getCrosshairTime: () => number | undefined;
    scrollToTime: (time: number) => void;
    resetTimeScale: () => void;
    fitContent: () => void;
    applyOptions: (options: DeepPartial<ChartOptions>) => void;
    replaceSeriesData: (patches: SeriesDataPatch[]) => void;
    updateSeriesData: (patches: SeriesDataPatch[]) => void;
    setPriceLineGroup: (group: PriceLineGroup) => void;
    clearPriceLineGroup: (series: string, id: string) => void;
}

export interface SeriesConfig {
    type: "Candlestick" | "Line" | "Area" | "Baseline" | "Histogram" | "Bar" | "SlTpLine" | "PositionArrow";
    data: any[];
    pane: number; // 0 for main, 1+ for extra panes
    options?: any;
    name?: string;
    displayName?: string;
    valueFormatter?: (value: number) => string;
    paneWeight?: number;
    priceLines?: any[];
    markers?: any[];  // 仓位进出场标记
    showInLegend?: boolean;
}

export interface ChartConfig {
    id: string;
    series: SeriesConfig[];
}
