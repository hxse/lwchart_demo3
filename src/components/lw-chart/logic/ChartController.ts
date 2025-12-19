import {
    createChart,
    CandlestickSeries,
    LineSeries,
    BarSeries,
    HistogramSeries,
    AreaSeries,
    BaselineSeries,
    ColorType,
    type IChartApi,
    type ISeriesApi,
    createSeriesMarkers,
} from "lightweight-charts";
import type { SeriesConfig } from "../../../utils/chartTypes";
import { LegendManager } from "./LegendManager";
import { SlTpLineSeries } from "../plugins/SlTpLineSeries";
import { findClosestTime, calculateCenteredRange } from "./TimeScaleHelper";

export class ChartController {
    private chart: IChartApi | null = null;
    private seriesMap = new Map<string, ISeriesApi<any>>();
    private legendManager: LegendManager | null = null;

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
        const perfStats = { add: 0, data: 0, markers: 0, options: 0 };
        const typeCount: Record<string, number> = {};

        // 1. Cleanup existing script-managed series map (references)
        this.seriesMap.forEach((series) => {
            this.chart!.removeSeries(series);
        });
        this.seriesMap.clear();

        // 2. Add new series
        configs.forEach((config, index) => {
            let series: ISeriesApi<any>;

            // 统计类型
            typeCount[config.type] = (typeCount[config.type] || 0) + 1;

            // 添加系列计时
            const addStart = performance.now();

            // Define series type
            switch (config.type) {
                case "Candlestick":
                    series = this.chart!.addSeries(CandlestickSeries, config.options);
                    break;
                case "Bar":
                    series = this.chart!.addSeries(BarSeries, config.options);
                    break;
                case "Line":
                    series = this.chart!.addSeries(LineSeries, config.options);
                    break;
                case "Area":
                    series = this.chart!.addSeries(AreaSeries, config.options);
                    break;
                case "Baseline":
                    series = this.chart!.addSeries(BaselineSeries, config.options);
                    break;
                case "Histogram":
                    series = this.chart!.addSeries(HistogramSeries, config.options);
                    break;
                case "SlTpLine":
                    // @ts-ignore
                    series = this.chart!.addCustomSeries(new SlTpLineSeries(), config.options);
                    break;
                default:
                    series = this.chart!.addSeries(LineSeries, config.options);
            }
            perfStats.add += performance.now() - addStart;

            // Set Data 计时
            const dataStart = performance.now();
            series.setData(config.data);
            perfStats.data += performance.now() - dataStart;

            // Set Markers 计时
            if (config.markers && Array.isArray(config.markers) && config.markers.length > 0) {
                const markersStart = performance.now();
                createSeriesMarkers(series, config.markers);
                perfStats.markers += performance.now() - markersStart;
            }

            // Handle Panes
            // @ts-ignore
            if (typeof series.moveToPane === 'function') {
                // @ts-ignore
                series.moveToPane(config.pane);
            }

            // Apply price scale margins if specified
            const optStart = performance.now();
            if (config.options?.scaleMargins) {
                try {
                    series.priceScale().applyOptions({
                        scaleMargins: config.options.scaleMargins
                    });
                } catch (e) {
                    console.warn('[ScaleMargins] Failed to apply:', e);
                }
            }

            // Handle Price Lines
            if (config.priceLines && Array.isArray(config.priceLines)) {
                config.priceLines.forEach(lineOptions => {
                    series.createPriceLine(lineOptions);
                });
            }
            perfStats.options += performance.now() - optStart;

            // Store in map
            this.seriesMap.set(config.name || `series_${index}`, series);

            // Register for Legend if enabled and requested
            if (this.legendManager && config.showInLegend) {
                this.legendManager.registerSeries(series, {
                    name: config.name || "Unnamed",
                    color: (config.options as any)?.color || "#2962FF",
                    showInLegend: true
                });
            }
        });

        // 计算总数据点数用于性能追踪
        const totalPoints = configs.reduce((sum, config) =>
            sum + (Array.isArray(config.data) ? config.data.length : 0), 0);

        // 构建类型统计字符串
        const typeStr = Object.entries(typeCount).map(([k, v]) => `${k}:${v}`).join(', ');

        console.log(
            `[Performance] Chart update: ${(performance.now() - startTime).toFixed(1)}ms ` +
            `(add: ${perfStats.add.toFixed(1)}ms, data: ${perfStats.data.toFixed(1)}ms, ` +
            `markers: ${perfStats.markers.toFixed(1)}ms, opts: ${perfStats.options.toFixed(1)}ms) ` +
            `- ${configs.length} series [${typeStr}], ${totalPoints} points`
        );
    }

    /**
     * 启用 Legend 功能
     * @param container 图表容器
     */
    public enableLegend(container: HTMLElement): void {
        if (this.legendManager) return;
        this.legendManager = new LegendManager();
        this.legendManager.create(container);

        this.chart?.subscribeCrosshairMove((param) => {
            this.legendManager?.update(param);
        });
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

    resetTimeScale() {
        if (!this.chart) return;
        this.chart.timeScale().resetTimeScale();
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

    clearCrosshair() {
        this.chart?.clearCrosshairPosition();
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

    subscribeClick(callback: (param: any) => void) {
        this.chart?.subscribeClick(callback);
    }

    unsubscribeClick(callback: (param: any) => void) {
        this.chart?.unsubscribeClick(callback);
    }

    scrollToTime(time: number) {
        if (!this.chart) return;

        const timeScale = this.chart.timeScale();

        // 1. 尝试直接转换完整时间
        let coordinate = timeScale.timeToCoordinate(time as any);

        // 2. 如果找不到精确时间，查找最接近的时间
        if (coordinate === null) {
            const closestTime = findClosestTime(this.seriesMap, time);
            if (closestTime !== null) {
                coordinate = timeScale.timeToCoordinate(closestTime as any);
            }
        }

        if (coordinate === null) {
            console.warn('[scrollToTime] 无法找到合适的时间坐标，跳转取消');
            return;
        }

        // 3. 转换为逻辑索引
        const logicalIndex = timeScale.coordinateToLogical(coordinate);
        if (logicalIndex === null) return;

        // 4. 计算居中范围并应用
        const newRange = calculateCenteredRange(timeScale, logicalIndex);
        if (newRange) {
            timeScale.setVisibleLogicalRange(newRange);
        }
    }

    applyOptions(options: any) {
        this.chart?.applyOptions(options);
    }

    destroy() {
        if (this.legendManager) {
            this.legendManager.destroy();
            this.legendManager = null;
        }
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        this.seriesMap.clear();
    }
}
