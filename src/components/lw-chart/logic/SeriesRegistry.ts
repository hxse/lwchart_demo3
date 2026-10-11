import {
    CandlestickSeries, LineSeries, BarSeries, HistogramSeries, AreaSeries, BaselineSeries,
    createSeriesMarkers, type IChartApi, type ISeriesApi, type IPriceLine, type IPaneApi, type Time,
} from 'lightweight-charts';
import type { SeriesConfig, SeriesMode } from '../../../utils/chartTypes';
import { SlTpLineSeries } from '../plugins/SlTpLineSeries';
import { PositionArrowSeries } from '../plugins/PositionArrowSeries';
import type { LegendManager } from './LegendManager';
import { clearTimeline, commitTimeline, nextTimeline } from './SeriesTimeline';
import { clearLineSegments, syncLineSegments } from './LineSegments';
import { preservePanePositions } from './PaneLayout';

interface RegisteredSeries { api: ISeriesApi<any>; type: SeriesConfig['type']; lines: IPriceLine[]; referenceSignature?: string }

/** 同一控制器管理静态重建与命名系列协调，两种场景共用系列创建逻辑。 */
export class SeriesRegistry {
    readonly seriesMap = new Map<string, ISeriesApi<any>>();
    private records = new Map<string, RegisteredSeries>();
    private owned = new Set<ISeriesApi<any>>();
    private weightedPanes = new WeakSet<IPaneApi<Time>>();

    constructor(private chart: IChartApi) {}

    apply(configs: SeriesConfig[], mode: SeriesMode, legend: LegendManager | null) {
        if (configs.some(config => !Number.isInteger(config.pane) || config.pane < 0)) throw new Error('Pane 编号必须是非负整数');
        if (mode === 'reconcile') {
            const names = configs.map(c => c.name);
            if (names.some(n => !n) || new Set(names).size !== names.length) {
                throw new Error('协调模式要求非空且唯一的系列名称');
            }
        }
        const restorePanes = mode === 'reconcile' ? preservePanePositions(this.chart, configs) : () => {};
        try { this.reconcile(configs, mode, legend); }
        finally { restorePanes(); }
    }

    private reconcile(configs: SeriesConfig[], mode: SeriesMode, legend: LegendManager | null) {
        if (mode === 'reconcile') {
            const names = configs.map(c => c.name);
            const wanted = new Set(names);
            for (const [name, record] of this.records) {
                if (!wanted.has(name)) this.remove(name, record.api);
            }
            const retained = new Set([...this.records.values()].map(record => record.api));
            for (const api of this.owned) {
                if (!retained.has(api)) { this.release(api); this.owned.delete(api); }
            }
        } else this.clear();

        legend?.clearSeries();
        configs.forEach((config, index) => {
            const name = config.name || `series_${index}`;
            // 静态场景允许同名系列，各配置独立创建；实时协调才按名称复用。
            let record = mode === 'reconcile' ? this.records.get(name) : undefined;
            if (record && record.type !== config.type) {
                this.remove(name, record.api);
                record = undefined;
            }
            const fresh = !record;
            if (!record) {
                record = { api: this.create(config), type: config.type, lines: [] };
                this.owned.add(record.api);
                this.records.set(name, record);
                this.seriesMap.set(name, record.api);
            } else {
                if (record.api.getPane().paneIndex() !== config.pane) record.api.moveToPane(config.pane);
                if (config.options) record.api.applyOptions(config.options);
            }

            if (fresh) {
                record.api.setData(config.data);
                commitTimeline(record.api, nextTimeline(record.api, config.data, true));
                if (config.markers?.length) createSeriesMarkers(record.api, config.markers);
                record.api.moveToPane(config.pane);
            }
            syncLineSegments(this.chart, record.api, config.options);
            const signature = JSON.stringify(config.priceLines ?? []);
            if (record.referenceSignature !== signature) {
                for (const line of record.lines) record.api.removePriceLine(line);
                record.lines = (config.priceLines ?? []).map(line => record!.api.createPriceLine(line));
                record.referenceSignature = signature;
            }
            if (config.paneWeight !== undefined) {
                const pane = record.api.getPane();
                // Pane 在首帧 DOM 创建前已经存在，权重初始化不依赖绘制时机。
                if (!this.weightedPanes.has(pane)) {
                    pane.setStretchFactor(Math.max(...configs.filter(c => c.pane === config.pane).map(c => c.paneWeight ?? 1)));
                    this.weightedPanes.add(pane);
                }
            }
            if (config.options?.scaleMargins) {
                try {
                    record.api.priceScale().applyOptions({ scaleMargins: config.options.scaleMargins });
                } catch (error) { console.warn('[ScaleMargins] Failed to apply:', error); }
            }
            if (config.showInLegend) legend?.registerSeries(record.api, {
                name: config.displayName ?? config.name ?? 'Unnamed',
                color: config.options?.color || '#2962FF',
                showInLegend: true,
                formatter: config.valueFormatter ?? config.options?.priceFormat?.formatter ?? (value => record!.api.priceFormatter().format(value)),
            });
        });
    }

    private create(config: SeriesConfig): ISeriesApi<any> {
        const standard = {
            Candlestick: CandlestickSeries, Line: LineSeries, Bar: BarSeries,
            Histogram: HistogramSeries, Area: AreaSeries, Baseline: BaselineSeries,
        };
        if (config.type === 'SlTpLine') {
            return this.chart.addCustomSeries(new SlTpLineSeries() as any, config.options, config.pane);
        }
        if (config.type === 'PositionArrow') {
            return this.chart.addCustomSeries(new PositionArrowSeries() as any, config.options, config.pane);
        }
        return this.chart.addSeries((standard[config.type] || LineSeries) as any, config.options, config.pane);
    }

    private remove(name: string, api: ISeriesApi<any>) {
        this.release(api);
        this.owned.delete(api);
        this.records.delete(name);
        this.seriesMap.delete(name);
    }

    clear() {
        for (const api of this.owned) this.release(api);
        this.owned.clear();
        this.records.clear();
        this.seriesMap.clear();
    }
    private release(api: ISeriesApi<any>) {
        clearLineSegments(api);
        clearTimeline(api);
        this.chart.removeSeries(api);
    }
}
