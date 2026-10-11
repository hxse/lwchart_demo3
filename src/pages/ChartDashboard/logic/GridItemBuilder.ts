import type { GridItem, ChartConfigJSON } from '../chartDashboard.types';
import type { ParsedFileContent } from '../../../utils/zipParser';
import type { SeriesConfig } from '../../../utils/chartTypes';
import { legacyGroups } from '../../../indicators/legacy';
import { buildLegacyPane } from './LegacyPaneBuilder';
import LWChart from '../../../components/lw-chart/LWChart.svelte';
import EmptyGridItem from '../../../components/EmptyGridItem.svelte';
import { buildBottomRowGridItem, buildEmptyBottomRowGridItem } from './BottomRowBuilder';

/** 同步处理器接口 */
interface SyncHandlers {
    onRegister: (id: string, api: any) => void;
    onSync: (id: string, param: any) => void;
    onBottomClick?: (time: number) => void;
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
        const groups = legacyGroups(slotPanes, 'chart slot ' + slotIdx);

        // 遍历 Panes
        slotPanes.forEach((paneSeriesList, paneIdx) => {
            const paneSeries = buildLegacyPane(paneSeriesList, paneIdx, slotIdx, files, groups, config.showRiskLegend);


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
                    showLegendInAll: config.showLegendInAll ?? true,
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
            const bottomItems = buildBottomRowGridItem(config.bottomRowChart, files, config.showLegendInAll, syncHandlers);
            gridItems.push(...bottomItems);
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
