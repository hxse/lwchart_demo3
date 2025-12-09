import {
    createChart,
    CandlestickSeries,
    LineSeries,
    ColorType,
    type IChartApi,
    type ISeriesApi,
} from "lightweight-charts";
import type { SeriesConfig } from "../../../utils/seriesMatcher";

export class ChartController {
    private chart: IChartApi | null = null;
    private seriesMap = new Map<string, ISeriesApi<any>>();

    init(container: HTMLElement, options?: Record<string, any>) {
        this.chart = createChart(container, {
            layout: {
                textColor: "black",
                background: { type: ColorType.Solid, color: "white" },
                attributionLogo: false
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
            ...options
        });
    }

    updateSeries(configs: SeriesConfig[]) {
        if (!this.chart) return;

        const startTime = performance.now();

        // 1. Cleanup existing script-managed series map (references)
        this.seriesMap.forEach((series) => {
            this.chart!.removeSeries(series);
        });
        this.seriesMap.clear();

        // 2. Add new series
        configs.forEach((config, index) => {
            let series: ISeriesApi<any>;

            // Define series type
            if (config.type === "Candlestick") {
                series = this.chart!.addSeries(CandlestickSeries, config.options);
            } else {
                series = this.chart!.addSeries(LineSeries, config.options);
            }

            // Set Data
            series.setData(config.data);

            // Handle Panes - attempting to use moveToPane or fallback
            // @ts-ignore
            if (typeof series.moveToPane === 'function') {
                // @ts-ignore
                series.moveToPane(config.pane);
            }

            // Handle Price Lines
            if (config.priceLines && Array.isArray(config.priceLines)) {
                config.priceLines.forEach(lineOptions => {
                    series.createPriceLine(lineOptions);
                });
            }

            // Store in map
            this.seriesMap.set(config.name || `series_${index}`, series);
        });

        // Calculate data points per series for performance tracking
        const seriesInfo = configs.map(config => {
            const points = Array.isArray(config.data) ? config.data.length : 0;
            return `${config.name || 'unnamed'}: ${points} points`;
        }).join(', ');

        console.log(`[Performance] Chart series update: ${(performance.now() - startTime).toFixed(2)}ms (${configs.length} series) - ${seriesInfo}`);
    }

    resize(width: number, height: number, forceFit: boolean = false) {
        if (!this.chart) return;
        this.chart.applyOptions({ width, height });
        if (forceFit) {
            this.chart.timeScale().fitContent();
        }
    }

    fitContent() {
        this.chart?.timeScale().fitContent();
    }

    setCrosshair(param: any) {
        if (!this.chart || !param || !param.time || this.seriesMap.size === 0) {
            this.chart?.clearCrosshairPosition();
            return;
        }

        const firstSeries = this.seriesMap.values().next().value;
        if (firstSeries) {
            this.chart.setCrosshairPosition(NaN, param.time, firstSeries);
        }
    }

    subscribeCrosshairMove(callback: (param: any) => void) {
        this.chart?.subscribeCrosshairMove(callback);
    }

    unsubscribeCrosshairMove(callback: (param: any) => void) {
        this.chart?.unsubscribeCrosshairMove(callback);
    }

    subscribeDblClick(callback: (param: any) => void) {
        this.chart?.subscribeDblClick(callback);
    }

    unsubscribeDblClick(callback: (param: any) => void) {
        this.chart?.unsubscribeDblClick(callback);
    }

    applyOptions(options: any) {
        this.chart?.applyOptions(options);
    }

    destroy() {
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        this.seriesMap.clear();
    }
}
