import type { GridItem } from "./types";
import EmptyGridItem from "../../components/EmptyGridItem.svelte";
import LWChart from "../../components/lw-chart/LWChart.svelte";
import type { ParsedFileContent } from "../../utils/zipParser";
import type { SeriesConfig } from "../../utils/seriesMatcher";

export function calculateGridItems(
    finalTemplate: any,
    showBottomRow: boolean,
    baseChartItems: GridItem[],
    backtestSeriesConfig: SeriesConfig[],
    bottomRowData: ParsedFileContent | null,
    syncHandlers?: {
        onRegister: (id: string, api: any) => void;
        onSync: (id: string, param: any) => void;
    }
): GridItem[] {
    const config = finalTemplate as any;
    let mainSlotCount = config.slots;
    if (!mainSlotCount) {
        mainSlotCount = showBottomRow ? 3 : 4;
    }

    const finalItems: GridItem[] = [];

    // Fill Main Slots with Base Charts
    for (let i = 0; i < mainSlotCount; i++) {
        if (i < baseChartItems.length) {
            finalItems.push(baseChartItems[i]);
        } else {
            finalItems.push({
                id: `empty-slot-${i}`,
                component: EmptyGridItem,
                props: {},
            });
        }
    }

    // Append Bottom Row if Enabled
    if (showBottomRow) {
        if (backtestSeriesConfig.length > 0) {
            finalItems.push({
                id: "bottom-row-chart",
                component: LWChart,
                props: {
                    series: backtestSeriesConfig,
                    fitContent: true,
                    chartOptions: {
                        handleScroll: false,
                        handleScale: false,
                        timeScale: {
                            minBarSpacing: 0.001,
                        },
                    },
                    onRegister: syncHandlers ? (api: any) => syncHandlers.onRegister("bottom-row-chart", api) : undefined,
                    onCrosshairMove: syncHandlers ? (p: any) => syncHandlers.onSync("bottom-row-chart", p) : undefined,
                },
            });
        } else if (bottomRowData) {
            finalItems.push({
                id: "bottom-row-empty-data",
                component: EmptyGridItem,
                props: {},
            });
        } else {
            finalItems.push({
                id: "bottom-row-empty-file",
                component: EmptyGridItem,
                props: {},
            });
        }
    }

    return finalItems;
}
