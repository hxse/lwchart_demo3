/** 共享系列样式，不依赖文件配置或入口页面。 */
// Candle & Bar 选项（共享相同的选项）
export interface CandleOption {
    [key: string]: any;
    upColor?: string;
    downColor?: string;
    wickUpColor?: string;
    wickDownColor?: string;
    borderVisible?: boolean;
    borderColor?: string;
    borderUpColor?: string;
    borderDownColor?: string;
    wickVisible?: boolean;
    wickColor?: string;
}

export interface BarOption extends CandleOption {
    [key: string]: any;
    openVisible?: boolean;
    thinBars?: boolean;
}

// Line 选项
export interface LineOption {
    [key: string]: any;
    color?: string;
    lineWidth?: number;
    lineStyle?: number; // 0=Solid, 1=Dotted, 2=Dashed, 3=LargeDashed, 4=SparseDotted
    lineType?: number; // 0=Simple, 1=WithSteps, 2=Curved
    lineVisible?: boolean;
    pointMarkersVisible?: boolean;
    pointMarkersRadius?: number;
    crosshairMarkerVisible?: boolean;
    crosshairMarkerRadius?: number;
    crosshairMarkerBorderColor?: string;
    crosshairMarkerBackgroundColor?: string;
    crosshairMarkerBorderWidth?: number;
    lastPriceAnimation?: number;
}

// Histogram 选项（简化，移除volume专用字段）
export interface HistogramOption {
    [key: string]: any;
    color?: string;
    base?: number;
}

// Volume 选项（独立类型）
export interface VolumeOption {
    [key: string]: any;
    // 布局控制（用户可配置）
    priceScaleMarginTop?: number;  // 叠加层顶部边距 (0-1)，默认0.7
    adjustMainSeries?: boolean;     // 是否自动调整同Pane主系列，默认true

    // 以下字段由前端自动处理，用户无需配置
    priceFormat?: { type: 'volume' };
    priceScaleId?: string;
}

// Area 选项
export interface AreaOption {
    [key: string]: any;
    topColor?: string;
    bottomColor?: string;
    lineColor?: string;
    lineWidth?: number;
    lineStyle?: number;
    lineType?: number;
    lineVisible?: boolean;
    pointMarkersVisible?: boolean;
    crosshairMarkerVisible?: boolean;
}

// Baseline 选项
export interface BaselineOption {
    [key: string]: any;
    baseValue?: number;
    topLineColor?: string;
    bottomLineColor?: string;
    topFillColor1?: string;
    topFillColor2?: string;
    bottomFillColor1?: string;
    bottomFillColor2?: string;
    lineWidth?: number;
    lineStyle?: number;
}

export interface HorizontalLine {
    [key: string]: any;
    color: string;
    value: number;
    label?: string;
    showLabel?: boolean; // 是否在图表线上显示标签文本
}

// 垂直参考线
export interface VerticalLine {
    [key: string]: any;
    color: string;
    value: number | string; // Timestamp 或日期字符串
    label?: string;
}

export interface SeriesStyle {
    type: 'candle' | 'line' | 'histogram' | 'volume' | 'area' | 'baseline' | 'bar' | 'hline' | 'vline';
    candleOpt?: CandleOption;
    barOpt?: BarOption;
    lineOpt?: LineOption;
    histogramOpt?: HistogramOption;
    volumeOpt?: VolumeOption;
    areaOpt?: AreaOption;
    baselineOpt?: BaselineOption;
    hLineOpt?: HorizontalLine;
    vLineOpt?: VerticalLine;
}
