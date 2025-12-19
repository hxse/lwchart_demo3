export interface GridItem {
    id: string;
    component: any;
    props: any;
}

// --- Dashboard Props & Override ---

export interface DashboardProps {
    zipData?: string | ArrayBuffer | Blob;
    config?: DashboardOverride;
}

export interface DashboardOverride {
    template?: string;
    showBottomRow?: boolean;
    viewMode?: "chart" | "table";
    selectedInternalFileName?: string;

    // 浏览器模式专用: 指定自动加载的 ZIP 文件名
    selectedZipFileName?: string;

    // 指标显隐覆盖: 使用三维坐标 "slotIdx,paneIdx,seriesIdx,show"
    // 例: ["0,0,0,1", "0,1,0,0"] 表示 Slot0-Pane0-Series0显示, Slot0-Pane1-Series0隐藏
    show?: string[];

    // Legend 显示覆盖: 使用三维坐标 "slotIdx,paneIdx,seriesIdx,show"
    showInLegend?: string[];

    // 风险线 Legend 显示控制: "sl,tp,tsl" (1=显示, 0=隐藏)
    // 例如 "1,1,0" 表示显示 SL 和 TP，隐藏 TSL
    showRiskLegend?: string;
}

// --- Chart Config & Series Options ---

// Candle & Bar 选项（共享相同的选项）
export interface CandleOption {
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
    openVisible?: boolean;
    thinBars?: boolean;
}

// Line 选项
export interface LineOption {
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
    color?: string;
    base?: number;
}

// Volume 选项（独立类型）
export interface VolumeOption {
    // 布局控制（用户可配置）
    priceScaleMarginTop?: number;  // 叠加层顶部边距 (0-1)，默认0.7
    adjustMainSeries?: boolean;     // 是否自动调整同Pane主系列，默认true

    // 以下字段由前端自动处理，用户无需配置
    priceFormat?: { type: 'volume' };
    priceScaleId?: string;
}

// Area 选项
export interface AreaOption {
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

// 水平参考线
export interface HorizontalLine {
    color: string;
    value: number;
    label?: string;
}

// 垂直参考线
export interface VerticalLine {
    color: string;
    value: number | string; // Timestamp 或日期字符串
    label?: string;
}

// Series 配置项
export interface SeriesItemConfig {
    // 运行时自动分配的顺序索引（从0开始）
    idx?: number;

    // 数据源（hline/vline 类型时可选）
    fileName?: string;
    dataName?: string | string[];

    // 图表类型
    type: "candle" | "line" | "histogram" | "volume" | "area" | "baseline" | "bar" | "hline" | "vline";

    // 是否显示
    show: boolean;

    // 是否在 Legend 中显示
    showInLegend?: boolean;

    // 各类型专用选项（根据 type 只填写对应的选项）
    candleOpt?: CandleOption;
    lineOpt?: LineOption;
    histogramOpt?: HistogramOption;
    volumeOpt?: VolumeOption;
    areaOpt?: AreaOption;
    baselineOpt?: BaselineOption;
    barOpt?: BarOption;
    hLineOpt?: HorizontalLine;
    vLineOpt?: VerticalLine;
}

// Chart 配置 JSON
export interface ChartConfigJSON {
    template: string; // 例如 "single", "vertical-1x3"
    showBottomRow: boolean;
    viewMode: "chart" | "table";
    selectedInternalFileName: string;

    // 三维数组: [Grid Slots][Panes][Series]
    chart: SeriesItemConfig[][][];

    // 底部栏图表配置（可选）
    // 如果 showBottomRow 为 true 但此字段为空，显示空白
    bottomRowChart?: SeriesItemConfig[][];  // [Panes][Series]

    // 风险线 Legend 显示设置 (从 override 传递给 GridItemBuilder)
    showRiskLegend?: [boolean, boolean, boolean];
}
