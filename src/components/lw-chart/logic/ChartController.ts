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
                default:
                    series = this.chart!.addSeries(LineSeries, config.options);
            }

            // Set Data
            series.setData(config.data);

            // Set Markers（仓位进出场标记）
            if (config.markers && Array.isArray(config.markers) && config.markers.length > 0) {
                console.log(`[Markers Debug] ChartController: 准备设置 markers，数量: ${config.markers.length}, series名称: ${config.name}`);
                console.log('[Markers Debug] markers 前3个:', config.markers.slice(0, 3));

                // 使用 createSeriesMarkers API (Lightweight Charts v5)
                createSeriesMarkers(series, config.markers);
                console.log('[Markers Debug] createSeriesMarkers 调用完成');
            } else {
                console.log(`[Markers Debug] ChartController: 没有 markers 需要设置 (markers存在: ${!!config.markers}, 是数组: ${Array.isArray(config.markers)}, 长度: ${config.markers?.length || 0})`);
            }

            // Handle Panes - attempting to use moveToPane or fallback
            // @ts-ignore
            if (typeof series.moveToPane === 'function') {
                // @ts-ignore
                series.moveToPane(config.pane);
            }

            // Apply price scale margins if specified
            if (config.options?.scaleMargins) {
                try {
                    series.priceScale().applyOptions({
                        scaleMargins: config.options.scaleMargins
                    });
                    // ScaleMargins应用完成（静默）
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

        // 尝试直接转换时间
        let coordinate = timeScale.timeToCoordinate(time as any);


        // 如果找不到精确时间，查找最接近且不超过目标时间的时间
        if (coordinate === null) {


            let closestTime: number | null = null;
            let closestDistance = Infinity;

            // 遍历所有series，找到最接近的时间
            this.seriesMap.forEach((series) => {
                try {
                    // 获取series的所有数据
                    // @ts-ignore - 访问内部API获取数据
                    const data = series.data?.() || [];

                    // 遍历数据找到最接近且不超过目标时间的时间
                    for (const point of data) {
                        const pointTime = point.time;
                        if (typeof pointTime === 'number' && pointTime <= time) {
                            const distance = time - pointTime;
                            if (distance < closestDistance) {
                                closestDistance = distance;
                                closestTime = pointTime;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[scrollToTime] 无法获取series数据:', e);
                }
            });

            if (closestTime !== null) {

                coordinate = timeScale.timeToCoordinate(closestTime as any);

            } else {
                console.warn('[scrollToTime] 无法找到合适的时间，跳转失败');
                return;
            }
        }

        if (coordinate === null) {
            console.warn('[scrollToTime] coordinate为null，跳转失败');
            return;
        }

        const logicalIndex = timeScale.coordinateToLogical(coordinate);

        if (logicalIndex === null) {
            console.warn('[scrollToTime] logicalIndex为null，跳转失败');
            return;
        }

        // 获取当前可见范围的宽度，保持当前的缩放级别
        const visibleRange = timeScale.getVisibleLogicalRange();
        if (!visibleRange) return;

        const barSpacing = visibleRange.to - visibleRange.from;


        // 直接设置范围，确保宽度精确等于barSpacing
        const halfSpacing = barSpacing / 2;
        const newRange = {
            from: logicalIndex - halfSpacing,
            to: logicalIndex - halfSpacing + barSpacing  // 直接相加，避免浮点数精度问题
        };



        // 将目标时间（逻辑索引）居中显示
        timeScale.setVisibleLogicalRange(newRange);


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
