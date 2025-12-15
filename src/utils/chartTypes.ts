/**
 * 图表相关的类型定义
 * 用于 LWChart 组件和 GridItemBuilder
 */

export interface SeriesConfig {
    type: "Candlestick" | "Line" | "Area" | "Baseline" | "Histogram" | "Bar";
    data: any[];
    pane: number; // 0 for main, 1+ for extra panes
    options?: any;
    name?: string;
    priceLines?: any[];
}

export interface ChartConfig {
    id: string;
    series: SeriesConfig[];
}
