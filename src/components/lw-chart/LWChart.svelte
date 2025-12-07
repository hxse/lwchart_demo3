<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import {
        createChart,
        type IChartApi,
        type ISeriesApi,
    } from "lightweight-charts";
    import type { SeriesConfig } from "../../utils/seriesMatcher";
    import { createChartInstance, updateSeries } from "./chart-logic.svelte";

    // Props
    interface Props {
        series: SeriesConfig[]; // Configuration for all series in this chart
        template?: string; // Optional identifier for template logic if needed
        fitContent?: boolean; // New prop: Auto-fit content
        chartOptions?: Record<string, any>; // New prop: Custom chart options (e.g. handleScale)
        onCrosshairMove?: (param: any) => void; // New prop: Sync callback
        onRegister?: (api: { setCrosshair: (param: any) => void }) => void; // Sync registration
    }

    let {
        series,
        fitContent = false,
        chartOptions = {},
        onCrosshairMove,
        onRegister,
    }: Props = $props();

    // State
    let chartContainer = $state<HTMLDivElement>();
    let chart: IChartApi | null = null;
    let seriesMap = new Map<string, ISeriesApi<any>>(); // Map to hold created series instances

    // Exported method for external sync
    export const setCrosshair = (param: any) => {
        if (!chart || !param || !param.time || seriesMap.size === 0) {
            chart?.clearCrosshairPosition(); // Clear if invalid
            return;
        }

        // We need a series instance to set the vertical crosshair.
        // Use the first available series (usually OHLCV or main indicator).
        const firstSeries = seriesMap.values().next().value;
        if (firstSeries) {
            // Price is irrelevant for pure time sync if scales differ, but LWC requires a price.
            // If we don't have matching price, we can try to find a price for this time in our own data?
            // Or just pass 0/NaN? LWC v4+ might be lenient.
            // Proper way: "To show the crosshair, you should pass a price and a time... "
            // If we only want vertical, use `chart.setCrosshairPosition(0, time, series)` but this might set horizontal line at 0.
            // Let's try passing provided price, if manageable.
            // But syncing horizontal line across different indicators (RSI vs Price) is bad.
            // We usually only want Vertical.
            // Strategy: Pass a price that is likely off-screen or try strictly generic API?
            // Actually, LWC `setCrosshairPosition` will show BOTH lines.
            // To hide horizontal, one might need to set `crosshair: { horzLine: { visible: false } }`?
            // But we don't want to disable it permanently.

            // For now, let's just pass the time. The API signature is (price, time, series).
            // We'll pass `NaN` for price and see if it hides horizontal.
            // If not, we'll iterate through `seriesMap` to find a valid price for that time if requested,
            // OR just accept that vertical sync is the main goal.

            // LWC doesn't officially support "vertical only" sets easily without toggling options.
            // We'll trust standard behavior: setCrosshairPosition(NaN, time, series) -> Vertical line at Time, Horizontal at NaN (hidden?).
            chart.setCrosshairPosition(NaN, param.time, firstSeries);
        }
    };

    onMount(() => {
        if (!chartContainer) return;

        // 1. Initialize Chart
        chart = createChartInstance(chartContainer);

        // Apply custom options
        if (Object.keys(chartOptions).length > 0) {
            chart.applyOptions(chartOptions);
        }

        // Register API if requested
        if (onRegister) {
            onRegister({ setCrosshair });
        }

        // Subscribe to Crosshair Move
        chart.subscribeCrosshairMove((param) => {
            if (onCrosshairMove) {
                // Pass the raw param or just the time?
                // Raw param contains { time, point, seriesData... }
                // We pass it up.
                onCrosshairMove(param);
            }
        });

        // 2. Window Resize Handler with Throttle
        let resizeTimeout: number;
        const handleResize = () => {
            console.log("📏 [LWChart] Window resize event caught!");
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (chart && chartContainer) {
                    const fault = 1;
                    const width = chartContainer.clientWidth - fault;
                    const height = chartContainer.clientHeight - fault;

                    if (width > 0 && height > 0) {
                        chart.applyOptions({ width, height });
                        chart.timeScale().fitContent();
                    }
                }
            }, 100) as unknown as number;
        };

        window.addEventListener("resize", handleResize);

        // 3. ResizeObserver
        const resizeObserver = new ResizeObserver((entries) => {
            if (!chart || !chartContainer) return;
            const rect = chartContainer.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                chart.applyOptions({ width: rect.width, height: rect.height });
                if (fitContent) {
                    chart.timeScale().fitContent();
                }
            }
        });
        resizeObserver.observe(chartContainer);

        // Initial Resize triggers
        handleResize();

        // Cleanup
        return () => {
            window.removeEventListener("resize", handleResize);
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeObserver.disconnect();
            if (chart) {
                chart.unsubscribeCrosshairMove(() => {}); // Optional formal cleanup
                chart.remove();
                chart = null;
            }
        };
    });

    // React to series config changes
    $effect(() => {
        const currentSeriesConfig = series;

        untrack(() => {
            if (!chart || !chartContainer) return;

            const rect = chartContainer.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                chart.applyOptions({ width: rect.width, height: rect.height });
            }

            updateSeries(chart, seriesMap, currentSeriesConfig);

            if (fitContent) {
                chart.timeScale().fitContent();
            }
        });
    });
</script>

<div class="chart-wrapper">
    <div bind:this={chartContainer} class="chart-container"></div>
</div>

<style>
    .chart-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .chart-container {
        flex: 1;
        width: 100%;
        height: 100%;
        background: white;
        overflow: hidden;
    }
</style>
