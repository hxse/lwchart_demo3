/**
 * 底部栏图表构建器
 * 负责构建底部栏（Bottom Row）的图表 GridItem
 */

import type { GridItem, SeriesItemConfig } from "../chartDashboard.types";
import type { ParsedFileContent } from "../../../utils/zipParser";
import type { SeriesConfig } from "../../../utils/chartTypes";
import { mapSeriesType } from "../../../components/lw-chart/logic/SeriesTypeMapper";
import { getOptionsForType } from "../../../components/lw-chart/logic/SeriesOptionsBuilder";
import { extractValueSeriesData, extractMultiKeySeriesData } from "./SeriesDataExtractor";
import LWChart from "../../../components/lw-chart/LWChart.svelte";
import EmptyGridItem from "../../../components/EmptyGridItem.svelte";

/** 同步处理器接口 */
interface SyncHandlers {
    onRegister: (id: string, api: any) => void;
    onSync: (id: string, param: any) => void;
    onBottomClick?: (time: number) => void;
}

/**
 * 从配置构建底部栏系列
 * @param paneSeriesList 单个 Pane 的系列配置列表
 * @param files 解析后的文件内容
 * @param paneIdx Pane 索引
 * @returns 系列配置数组
 */
function buildBottomRowPaneSeries(
    paneSeriesList: SeriesItemConfig[],
    files: ParsedFileContent[],
    paneIdx: number
): SeriesConfig[] {
    const paneSeries: SeriesConfig[] = [];

    paneSeriesList.forEach(itemConfig => {
        if (!itemConfig.show) return;
        if (!itemConfig.fileName || !itemConfig.dataName) return;

        const file = files.find(f => f.filename === itemConfig.fileName);
        if (!file) {
            console.warn(`[BottomRow] File not found: ${itemConfig.fileName}`);
            return;
        }
        if (!Array.isArray(file.data)) return;

        // 提取数据
        let extracted;
        if (typeof itemConfig.dataName === 'string') {
            extracted = extractValueSeriesData(file.data, itemConfig.dataName);
        } else if (Array.isArray(itemConfig.dataName)) {
            extracted = extractMultiKeySeriesData(file.data, itemConfig.dataName);
        } else {
            return;
        }

        const lwcType = mapSeriesType(itemConfig.type) as any;
        const options = getOptionsForType(itemConfig);

        paneSeries.push({
            type: lwcType,
            data: extracted.data,
            pane: paneIdx,
            options: options,
            name: extracted.name
        });
    });

    return paneSeries;
}

/**
 * 构建底部栏 GridItem
 * @param bottomRowConfig 底部栏配置（二维数组：[Panes][Series]）
 * @param files 解析后的文件内容
 * @param syncHandlers 可选的同步处理器
 * @returns 底部栏 GridItem
 */
export function buildBottomRowGridItem(
    bottomRowConfig: SeriesItemConfig[][],
    files: ParsedFileContent[],
    syncHandlers?: SyncHandlers
): GridItem {
    const allPaneSeries: SeriesConfig[][] = [];

    bottomRowConfig.forEach((paneSeriesList, paneIdx) => {
        const paneSeries = buildBottomRowPaneSeries(paneSeriesList, files, paneIdx);
        if (paneSeries.length > 0) {
            allPaneSeries.push(paneSeries);
        }
    });

    if (allPaneSeries.length > 0) {
        return {
            id: "bottom-row-chart",
            component: LWChart,
            props: {
                series: allPaneSeries.flat(),
                fitContent: true,
                fitContentOnDblClick: true,
                chartOptions: {
                    handleScroll: true,
                    handleScale: true,
                    timeScale: { minBarSpacing: 0.001 }
                },
                onClick: syncHandlers?.onBottomClick ? (param: any) => {
                    if (param.time) {
                        syncHandlers.onBottomClick!(param.time);
                    } else {
                        console.warn('[底栏点击] param.time为空，无法跳转');
                    }
                } : undefined,
                onRegister: syncHandlers ? (api: any) => syncHandlers.onRegister("bottom-row-chart", api) : undefined,
                onCrosshairMove: syncHandlers ? (p: any) => syncHandlers.onSync("bottom-row-chart", p) : undefined,
            }
        };
    } else {
        // 配置了底部栏但没有有效系列
        return {
            id: "bottom-empty-series",
            component: EmptyGridItem,
            props: {}
        };
    }
}

/**
 * 创建空底部栏 GridItem（当 showBottomRow 为 true 但 bottomRowChart 未定义时）
 * @returns 空的 GridItem
 */
export function buildEmptyBottomRowGridItem(): GridItem {
    console.warn('[BottomRow] showBottomRow is true but bottomRowChart is not defined');
    return {
        id: "bottom-no-config",
        component: EmptyGridItem,
        props: {}
    };
}
