/**
 * 网格项构建器
 * 负责将图表配置转换为网格布局所需的 GridItem 数组
 */

import type { GridItem, ChartConfigJSON, SeriesItemConfig } from "../chartDashboard.types";
import EmptyGridItem from "../../../components/EmptyGridItem.svelte";
import LWChart from "../../../components/lw-chart/LWChart.svelte";
import type { ParsedFileContent } from "../../../utils/zipParser";
import type { SeriesConfig } from "../../../utils/chartTypes";
import { mapSeriesType } from "../../../components/lw-chart/logic/SeriesTypeMapper";
import {
    getOptionsForType,
    applyDefaultScaleMargins,
    DEFAULT_SCALE_MARGIN_TOP,
} from "../../../components/lw-chart/logic/SeriesOptionsBuilder";

// 拆分模块导入
import { generatePositionMarkers } from "./PositionMarkerBuilder";
import { buildSlTpLines } from "./SlTpLineBuilder";
import { extractValueSeriesData, extractMultiKeySeriesData } from "./SeriesDataExtractor";
import { buildBottomRowGridItem, buildEmptyBottomRowGridItem } from "./BottomRowBuilder";

/** 同步处理器接口 */
interface SyncHandlers {
    onRegister: (id: string, api: any) => void;
    onSync: (id: string, param: any) => void;
    onBottomClick?: (time: number) => void;
}

/**
 * 处理单个 Pane 的系列配置
 * @param paneSeriesList Pane 中的系列配置列表
 * @param paneIdx Pane 索引
 * @param slotIdx Slot 索引
 * @param files 解析后的文件内容
 * @returns 系列配置数组
 */
function buildPaneSeries(
    paneSeriesList: SeriesItemConfig[],
    paneIdx: number,
    slotIdx: number,
    files: ParsedFileContent[],
    showRiskLegend?: [boolean, boolean, boolean]
): SeriesConfig[] {
    const paneSeries: SeriesConfig[] = [];

    // 分离普通系列和独立的HLine/VLine
    const seriesItems = paneSeriesList.filter(c => !["hline", "vline"].includes(c.type));
    const hLineOnlyItems = paneSeriesList.filter(c => c.type === "hline");

    // 处理普通系列
    seriesItems.forEach(itemConfig => {
        if (!itemConfig.show && !itemConfig.showInLegend) return;
        if (!itemConfig.fileName || !itemConfig.dataName) return;

        // 严格匹配文件
        const file = files.find(f => f.filename === itemConfig.fileName);
        if (!file) {
            console.warn(`[Config] File not found: ${itemConfig.fileName}`);
            return;
        }
        if (!Array.isArray(file.data)) return;

        // 提取数据（使用拆分模块）
        let extracted;
        if (typeof itemConfig.dataName === 'string') {
            extracted = extractValueSeriesData(file.data, itemConfig.dataName, itemConfig.type);
        } else if (Array.isArray(itemConfig.dataName)) {
            extracted = extractMultiKeySeriesData(file.data, itemConfig.dataName);
        } else {
            return;
        }

        // 获取选项
        const lwcType = mapSeriesType(itemConfig.type) as any;
        let options = {
            ...getOptionsForType(itemConfig),
            visible: !!itemConfig.show
        };

        // 处理附属的价格线
        const priceLines: any[] = [];
        if (itemConfig.hLineOpt) {
            priceLines.push({
                price: itemConfig.hLineOpt.value,
                color: itemConfig.hLineOpt.color,
                lineWidth: 1,
                lineStyle: 1,
                axisLabelVisible: true,
                title: itemConfig.hLineOpt.label || ''
            });
        }

        // 智能应用 scaleMargins
        const isVolume = itemConfig.type === 'volume';
        const isMainSeries = lwcType === 'Candlestick' || lwcType === 'Bar';
        const paneHasVolume = paneSeriesList.some(item => item.type === 'volume');

        let finalOptions = options;
        if (!isVolume && !(isMainSeries && paneHasVolume)) {
            finalOptions = applyDefaultScaleMargins(options);
        }

        // 生成仓位标记（仅对第一个主图）
        let markers: any[] | undefined = undefined;
        let backtestFile: ParsedFileContent | undefined = undefined;
        if (slotIdx === 0 && isMainSeries && file.data.length > 0) {
            // 查找 backtest_result 文件
            backtestFile = files.find(f => {
                const filename = f.filename.toLowerCase();
                return filename.endsWith('backtest_result.parquet') ||
                    filename.endsWith('backtest_result.csv');
            });

            if (backtestFile && Array.isArray(backtestFile.data) && backtestFile.data.length > 0) {
                const firstRow = backtestFile.data[0];
                const hasPositionFields =
                    'entry_long_price' in firstRow ||
                    'entry_short_price' in firstRow ||
                    'exit_long_price' in firstRow ||
                    'exit_short_price' in firstRow;

                if (hasPositionFields) {
                    markers = generatePositionMarkers(backtestFile.data);
                }
            }
        }

        paneSeries.push({
            type: lwcType,
            data: extracted.data,
            pane: paneIdx,
            options: finalOptions,
            priceLines: priceLines,
            markers: markers,
            name: extracted.name,
            showInLegend: itemConfig.showInLegend ?? false
        });

        // 添加 SL/TP/TSL 价格线（仅第一个主图，使用拆分模块）
        if (slotIdx === 0 && isMainSeries && backtestFile && Array.isArray(backtestFile.data)) {
            const slTpSeries = buildSlTpLines(backtestFile.data, paneIdx, showRiskLegend);
            paneSeries.push(...slTpSeries);
        }
    });

    // 处理独立的HLine（附加到第一个系列）
    if (paneSeries.length > 0) {
        const first = paneSeries[0];
        if (!first.priceLines) first.priceLines = [];

        hLineOnlyItems.forEach(hl => {
            if (hl.hLineOpt && hl.show) {
                const label = hl.hLineOpt.label || '';
                const isRSICenter = label.toLowerCase().includes('center') ||
                    label.toLowerCase().includes('rsi') && hl.hLineOpt.value === 50;

                first.priceLines!.push({
                    price: hl.hLineOpt.value,
                    color: hl.hLineOpt.color,
                    lineWidth: isRSICenter ? 2 : 1,
                    lineStyle: 0,
                    axisLabelVisible: true,
                    title: ''
                });
            }
        });
    }

    return paneSeries;
}

/**
 * 调整 Pane 内的 Volume 与主系列边距
 * @param paneSeries Pane 中的系列配置
 * @param paneSeriesList 原始配置（用于读取 volumeOpt）
 */
function adjustVolumeMargins(
    paneSeries: SeriesConfig[],
    paneSeriesList: SeriesItemConfig[]
): void {
    const volumeSeriesInPane = paneSeries.find(s =>
        s.name && typeof s.name === 'string' && s.name.toLowerCase().includes('volume')
    );

    if (volumeSeriesInPane && volumeSeriesInPane.options) {
        const volumeConfig = paneSeriesList.find(item => item.type === 'volume');
        const needAdjust = volumeConfig?.volumeOpt?.adjustMainSeries !== false;

        if (needAdjust) {
            const volumeMarginTop = volumeSeriesInPane.options.priceScaleMarginTop || 0.7;
            const seriesBottom = 1 - volumeMarginTop;

            paneSeries.forEach(series => {
                if (series !== volumeSeriesInPane) {
                    if (!series.options) series.options = {};
                    series.options.scaleMargins = {
                        top: DEFAULT_SCALE_MARGIN_TOP,
                        bottom: seriesBottom
                    };
                }
            });
        }
    }
}

/**
 * 从配置生成网格项数组
 * @param config 图表配置 JSON
 * @param files 解析后的文件内容数组
 * @param syncHandlers 可选的同步处理器（用于图表间的十字线同步等）
 * @returns 网格项数组
 */
export function generateGridItemsFromConfig(
    config: ChartConfigJSON,
    files: ParsedFileContent[],
    syncHandlers?: SyncHandlers
): GridItem[] {
    const perfStart = performance.now();
    const gridItems: GridItem[] = [];
    const { chart: chartConfigs, showBottomRow } = config;

    // 三维遍历: [Grid Slots][Panes][Series]
    chartConfigs.forEach((slotPanes, slotIdx) => {
        const allPaneSeries: SeriesConfig[][] = [];

        // 遍历 Panes
        slotPanes.forEach((paneSeriesList, paneIdx) => {
            const paneSeries = buildPaneSeries(paneSeriesList, paneIdx, slotIdx, files, config.showRiskLegend);

            // 调整 Volume 边距
            adjustVolumeMargins(paneSeries, paneSeriesList);

            if (paneSeries.length > 0) {
                allPaneSeries.push(paneSeries);
            }
        });

        // 为每个 Slot 创建 GridItem
        if (allPaneSeries.length > 0) {
            const chartId = `chart-slot-${slotIdx}`;
            const flatSeries = allPaneSeries.flat();

            gridItems.push({
                id: chartId,
                component: LWChart,
                props: {
                    series: flatSeries,
                    fitContent: false,
                    fitContentOnDblClick: true,
                    chartOptions: {
                        timeScale: { timeVisible: true, secondsVisible: false }
                    },
                    onRegister: syncHandlers ? (api: any) => syncHandlers.onRegister(chartId, api) : undefined,
                    onCrosshairMove: syncHandlers ? (p: any) => syncHandlers.onSync(chartId, p) : undefined,
                    enableLegend: true,
                }
            });
        } else {
            gridItems.push({
                id: `empty-slot-${slotIdx}`,
                component: EmptyGridItem,
                props: {}
            });
        }
    });

    // 底部栏处理（使用拆分模块）
    if (showBottomRow) {
        if (config.bottomRowChart && config.bottomRowChart.length > 0) {
            gridItems.push(buildBottomRowGridItem(config.bottomRowChart, files, syncHandlers));
        } else {
            gridItems.push(buildEmptyBottomRowGridItem());
        }
    }

    // 性能统计
    const perfEnd = performance.now();
    const totalTime = perfEnd - perfStart;
    const totalSeries = gridItems.reduce((sum, item) => {
        if (item.props?.series) {
            return sum + item.props.series.length;
        }
        return sum;
    }, 0);

    console.log(`[Performance] Grid generation: ${totalTime.toFixed(2)}ms - ${gridItems.length} grids, ${totalSeries} series`);

    return gridItems;
}
