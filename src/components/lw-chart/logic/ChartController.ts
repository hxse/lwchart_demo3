import {
    createChart,
    ColorType,
    type IChartApi,
    type ISeriesApi,
    type UTCTimestamp,
    type ChartOptions,
    type DeepPartial,
    type TimeFormatterFn,
} from "lightweight-charts";
import type { SeriesConfig, SeriesMode, SeriesDataPatch } from "../../../utils/chartTypes";
import { LegendManager } from "./LegendManager";
import { SeriesRegistry } from './SeriesRegistry';
import { applySeriesData } from './SeriesDataUpdater';
import { findClosestTime, calculateCenteredRange } from "./TimeScaleHelper";

export class ChartController {
    private chart: IChartApi | null = null;
    private registry: SeriesRegistry | null = null;
    private get seriesMap(): Map<string, ISeriesApi<any>> {
        return this.registry?.seriesMap ?? new Map();
    }
    private legendManager: LegendManager | null = null;
    private crosshairTime: number | undefined;

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
        this.registry = new SeriesRegistry(this.chart);
        this.chart.subscribeCrosshairMove(param => {
            this.crosshairTime = typeof param.time === 'number' ? param.time : undefined;
        });
    }

    updateSeries(configs: SeriesConfig[], mode: SeriesMode = 'replace') {
        this.registry?.apply(configs, mode, this.legendManager);
    }

    replaceSeriesData(patches: SeriesDataPatch[]) {
        if (!this.chart) throw new Error('图表尚未初始化');
        applySeriesData(this.chart, this.seriesMap, patches, true);
    }

    updateSeriesData(patches: SeriesDataPatch[]) {
        if (!this.chart) throw new Error('图表尚未初始化');
        applySeriesData(this.chart, this.seriesMap, patches, false);
    }

    isInitialized() { return this.chart !== null; }

    /**
     * 启用 Legend 功能
     * @param container 图表容器
     * @param showLegendInAll 是否在所有同步图表中显示
     */
    public enableLegend(container: HTMLElement, showLegendInAll: boolean = true): void {
        if (this.legendManager) return;
        this.legendManager = new LegendManager();
        this.legendManager.setShowInAll(showLegendInAll);
        this.legendManager.setChart(this.chart!);
        this.legendManager.setTimeFormatter(this.chart!.options().localization.timeFormatter);
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
            this.clearCrosshair();
            return;
        }

        // 统一处理时间匹配：找到本图表中最接近的时间点
        const closestTime = findClosestTime(this.seriesMap, param.time);
        if (closestTime === null) {
            this.clearCrosshair();
            return;
        }

        const firstSeries = this.seriesMap.values().next().value;
        if (firstSeries) {
            // 使用已匹配的时间设置光标
            this.chart.setCrosshairPosition(NaN, closestTime as UTCTimestamp, firstSeries);
        }
        this.crosshairTime = closestTime;

        // 手动触发 Legend 更新，传递已匹配的时间（避免重复计算）
        if (this.legendManager) {
            this.legendManager.update({
                time: closestTime,
                seriesData: new Map()
            } as any);
        }
    }

    clearCrosshair() {
        this.crosshairTime = undefined;
        this.chart?.clearCrosshairPosition();
        this.legendManager?.update({ time: undefined } as any);
    }

    getCrosshairTime() { return this.crosshairTime; }

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

    applyOptions(options: DeepPartial<ChartOptions>) {
        const formatter = options.localization?.timeFormatter;
        if (formatter !== undefined && typeof formatter !== 'function') throw new Error('时间格式器必须是函数');
        this.chart?.applyOptions(options);
        if (options.localization && Object.hasOwn(options.localization, 'timeFormatter')) {
            // SDK DeepPartial 的映射类型不保留函数签名，实际值已验证为函数。
            this.legendManager?.setTimeFormatter(formatter as TimeFormatterFn | undefined);
        }
    }

    destroy() {
        this.crosshairTime = undefined;
        if (this.legendManager) {
            this.legendManager.destroy();
            this.legendManager = null;
        }
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        this.registry = null;
    }
}
