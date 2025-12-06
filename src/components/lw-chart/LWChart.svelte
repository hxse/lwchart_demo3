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
    }

    let { series, fitContent = false, chartOptions = {} }: Props = $props();

    // State
    let chartContainer = $state<HTMLDivElement>();
    let chart: IChartApi | null = null;
    let seriesMap = new Map<string, ISeriesApi<any>>(); // Map to hold created series instances

    onMount(() => {
        if (!chartContainer) return;

        // 1. Initialize Chart
        chart = createChartInstance(chartContainer);

        // Apply custom options if provided (e.g. disable scroll)
        if (Object.keys(chartOptions).length > 0) {
            chart.applyOptions(chartOptions);
        }

        // 2. Setup Resize Observer
        const resizeObserver = new ResizeObserver((entries) => {
            if (!chart || !chartContainer) return;

            const rect = chartContainer.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                chart.applyOptions({ width: rect.width, height: rect.height });
            }
        });

        resizeObserver.observe(chartContainer);

        // Cleanup
        return () => {
            resizeObserver.disconnect();
            if (chart) {
                chart.remove();
                chart = null;
            }
        };
    });

    // React to series config changes
    $effect(() => {
        const currentSeriesConfig = series;

        // Use untrack to prevent deep reactivity on the data itself if it's large,
        // though here 'series' itself is the trigger.
        untrack(() => {
            if (!chart || !chartContainer) return;

            // Re-apply options to ensure dimensions are correct after possible layout change
            // or ensure chart exists
            const rect = chartContainer.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                chart.applyOptions({ width: rect.width, height: rect.height });
            }

            // Update or Create Series
            updateSeries(chart, seriesMap, currentSeriesConfig);

            // Fit content if requested (e.g. for bottom row)
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
        /* min-height removed to allow small charts */
        background: white;
        overflow: hidden;
    }
</style>
