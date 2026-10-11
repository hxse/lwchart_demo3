import type { SeriesStyle } from '../../utils/seriesStyles';
export type { CandleOption, BarOption, LineOption, HistogramOption, VolumeOption, AreaOption, BaselineOption, HorizontalLine, VerticalLine } from '../../utils/seriesStyles';

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

    // 风险线 Legend 显示控制: "sl,tp,tsl,psar" (1=显示, 0=隐藏)
    // 例如 "1,1,0,1" 表示显示 SL、TP、PSAR，隐藏 TSL
    showRiskLegend?: string;

    // 是否在所有图表中显示 Legend (默认 false，只在鼠标激活的图表显示)
    showLegendInAll?: boolean;
}

// --- Chart Config & Series Options ---

// 文件配置在通用样式之上只增加数据源与覆盖字段。
export interface SeriesItemConfig extends SeriesStyle {
    idx?: number;
    fileName?: string;
    dataName?: string | string[];
    show: boolean;
    showInLegend?: boolean;
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
    bottomRowChart?: SeriesItemConfig[][][];  // [Slots][Panes][Series]

    // 风险线 Legend 显示设置 (从 override 传递给 GridItemBuilder)
    // [sl, tp, tsl, psar]
    showRiskLegend?: [boolean, boolean, boolean, boolean];

    // 是否在所有图表中同时显示 Legend (默认 false)
    showLegendInAll?: boolean;
}
