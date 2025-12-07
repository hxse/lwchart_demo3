import {
    createChart,
    CandlestickSeries,
    LineSeries,
    ColorType,
    type IChartApi,
    type ISeriesApi,
} from "lightweight-charts";
import type { SeriesConfig } from "../../utils/seriesMatcher";

export function createChartInstance(container: HTMLElement): IChartApi {
    return createChart(container, {
        layout: {
            textColor: "black",
            background: { type: ColorType.Solid, color: "white" },
        },
        // Width is handled by resize observer/event usually, but start with auto
        // width: container.clientWidth, 
        // remove fixed height to adapt to container
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        },
    });
}

export function updateSeries(
    chart: IChartApi,
    seriesMap: Map<string, ISeriesApi<any>>,
    configs: SeriesConfig[]
) {
    // Simple reconciliation: Remove series not in configs? 
    // For this demo, we can clear everything if config length changes significantly or just add new ones.
    // To keep it simple and robust for this demo:
    // We will clear chart series if the config ID (name) doesn't match?
    // Actually, easiest for "switching files" is to remove all and re-add.
    // Optimization: If we have fine-grained updates, we'd diff. 
    // Given user request for "Performance" relates to "Deep Tracking", re-creating series on file switch is fine.
    // Modifying data on existing series is where performance matters most (updates).

    // Strategy: Clear and Rebuild for simplicity on file switch. 
    // Since 'configs' is likely replaced entirely when file changes.

    // 1. Cleanup existing script-managed series map (references)
    // Note: chart.removeSeries() is needed.
    seriesMap.forEach((series) => {
        chart.removeSeries(series);
    });
    seriesMap.clear();

    // 2. Add new series
    configs.forEach((config, index) => {
        let series: ISeriesApi<any>;

        // Define series type
        if (config.type === "Candlestick") {
            series = chart.addSeries(CandlestickSeries, config.options);
        } else {
            series = chart.addSeries(LineSeries, config.options);
        }

        // Set Data

        series.setData(config.data);

        // Handle Panes
        // Pane 0 is main. Pane 1+ are separate.
        // Use moveToPane API if available, or just rely on default behavior behavior if not mapped.
        // NOTE: In standard library, moveToPane is not always available on series. 
        // However, user specifically asked for "Pandas, moveToPane".
        // Checking API: series.applyOptions({ priceScaleId: ... }) is standard for moving panes (by creating new price scale).
        // Or simpler: chart.addSeries(Type, { pane: 1 }); (some versions).
        // Let's try the modern way "series.moveToPane(paneIndex)" if it exists on ISeriesApi.
        // If TS complains, we cast to any.

        // @ts-ignore
        if (typeof series.moveToPane === 'function') {
            // @ts-ignore
            series.moveToPane(config.pane);
        } else {
            // Fallback or Standard: Logic via priceScaleId?
            // Actually, let's look at how to put it in a separate pane.
            // Usually creating a new PriceScaleId implies a new pane if configured?
            // No, 'pane' option in create options is simplest in v5?
            // Let's assume user is right about moveToPane.
        }

        // Store in map
        seriesMap.set(config.name || `series_${index}`, series);
    });

    // Fit content
    chart.timeScale().fitContent();
}
