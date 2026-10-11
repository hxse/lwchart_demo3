/**
 * 底部栏图表构建器
 * 负责构建底部栏（Bottom Row）的图表 GridItem
 */

import type { GridItem, SeriesItemConfig } from "../chartDashboard.types";
import type { ParsedFileContent } from "../../../utils/zipParser";
import type { SeriesConfig } from "../../../utils/chartTypes";
import { legacyGroups } from '../../../indicators/legacy';
import { buildLegacyPane } from './LegacyPaneBuilder';
import LWChart from "../../../components/lw-chart/LWChart.svelte";
import EmptyGridItem from "../../../components/EmptyGridItem.svelte";

/** 同步处理器接口 */
interface SyncHandlers {
    onRegister: (id: string, api: any) => void;
    onSync: (id: string, param: any) => void;
    onBottomClick?: (time: number) => void;
}

/**
 * 构建底部栏 GridItem 数组
 * @param bottomRowConfig 底部栏配置（三维数组：[Slots][Panes][Series]）
 * @param files 解析后的文件内容
 * @param showLegendInAll 是否在所有同步图表中显示 Legend
 * @param syncHandlers 可选的同步处理器
 * @returns 底部栏 GridItem 数组
 */
export function buildBottomRowGridItem(
    bottomRowConfig: SeriesItemConfig[][][],
    files: ParsedFileContent[],
    showLegendInAll: boolean = true,
    syncHandlers?: SyncHandlers
): GridItem[] {
    const gridItems: GridItem[] = [];

    bottomRowConfig.forEach((slotPanes, slotIdx) => {
        const allPaneSeries: SeriesConfig[][] = [];
        const groups = legacyGroups(slotPanes, 'bottomRowChart slot ' + slotIdx);

        // 遍历 Panes
        slotPanes.forEach((paneSeriesList, paneIdx) => {
            const paneSeries = buildLegacyPane(paneSeriesList, paneIdx, slotIdx, files, groups, undefined, false);
            if (paneSeries.length > 0) {
                allPaneSeries.push(paneSeries);
            }
        });

        if (allPaneSeries.length > 0) {
            const chartId = `bottom-row-chart-${slotIdx}`;
            gridItems.push({
                id: chartId,
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
                    onRegister: syncHandlers ? (api: any) => syncHandlers.onRegister(chartId, api) : undefined,
                    onCrosshairMove: syncHandlers ? (p: any) => syncHandlers.onSync(chartId, p) : undefined,
                    enableLegend: true, // 启用图例显示
                    showLegendInAll: showLegendInAll,
                }
            });
        }
    });

    if (gridItems.length === 0) {
        // 配置了底部栏但没有有效系列
        gridItems.push({
            id: "bottom-empty-series",
            component: EmptyGridItem,
            props: {}
        });
    }

    return gridItems;
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
