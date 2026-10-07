import {
    CandlestickSeries, LineSeries, BarSeries, HistogramSeries, AreaSeries, BaselineSeries,
    createSeriesMarkers, type IChartApi, type ISeriesApi,
} from 'lightweight-charts';
import type { SeriesConfig, SeriesMode } from '../../../utils/chartTypes';
import { SlTpLineSeries } from '../plugins/SlTpLineSeries';
import { PositionArrowSeries } from '../plugins/PositionArrowSeries';
import type { LegendManager } from './LegendManager';

interface RegisteredSeries { api: ISeriesApi<any>; type: SeriesConfig['type']; pane: number }

/** 同一控制器管理静态重建与命名系列协调，两种场景共用系列创建逻辑。 */
export class SeriesRegistry {
    readonly seriesMap = new Map<string, ISeriesApi<any>>();
    private records = new Map<string, RegisteredSeries>();
    private owned = new Set<ISeriesApi<any>>();

    constructor(private chart: IChartApi) {}

    apply(configs: SeriesConfig[], mode: SeriesMode, legend: LegendManager | null) {
        if (mode === 'reconcile') {
            const names = configs.map(c => c.name);
            if (names.some(n => !n) || new Set(names).size !== names.length) {
                throw new Error('协调模式要求非空且唯一的系列名称');
            }
            const wanted = new Set(names);
            for (const [name, record] of this.records) {
                if (!wanted.has(name)) this.remove(name, record.api);
            }
            const retained = new Set([...this.records.values()].map(record => record.api));
            for (const api of this.owned) {
                if (!retained.has(api)) { this.chart.removeSeries(api); this.owned.delete(api); }
            }
        } else this.clear();

        legend?.clearSeries();
        configs.forEach((config, index) => {
            const name = config.name || `series_${index}`;
            // 静态场景允许同名系列，各配置独立创建；实时协调才按名称复用。
            let record = mode === 'reconcile' ? this.records.get(name) : undefined;
            if (record && (record.type !== config.type || record.pane !== config.pane)) {
                this.remove(name, record.api);
                record = undefined;
            }
            const fresh = !record;
            if (!record) {
                record = { api: this.create(config), type: config.type, pane: config.pane };
                this.owned.add(record.api);
                this.records.set(name, record);
                this.seriesMap.set(name, record.api);
            } else if (config.options) record.api.applyOptions(config.options);

            if (fresh) {
                record.api.setData(config.data);
                if (config.markers?.length) createSeriesMarkers(record.api, config.markers);
                record.api.moveToPane(config.pane);
                for (const line of config.priceLines || []) record.api.createPriceLine(line);
            }
            if (config.options?.scaleMargins) {
                try {
                    record.api.priceScale().applyOptions({ scaleMargins: config.options.scaleMargins });
                } catch (error) { console.warn('[ScaleMargins] Failed to apply:', error); }
            }
            if (config.showInLegend) legend?.registerSeries(record.api, {
                name: config.name || 'Unnamed',
                color: config.options?.color || '#2962FF',
                showInLegend: true,
            });
        });
    }

    private create(config: SeriesConfig): ISeriesApi<any> {
        const standard = {
            Candlestick: CandlestickSeries, Line: LineSeries, Bar: BarSeries,
            Histogram: HistogramSeries, Area: AreaSeries, Baseline: BaselineSeries,
        };
        if (config.type === 'SlTpLine') {
            return this.chart.addCustomSeries(new SlTpLineSeries() as any, config.options);
        }
        if (config.type === 'PositionArrow') {
            return this.chart.addCustomSeries(new PositionArrowSeries() as any, config.options);
        }
        return this.chart.addSeries((standard[config.type] || LineSeries) as any, config.options);
    }

    private remove(name: string, api: ISeriesApi<any>) {
        this.chart.removeSeries(api);
        this.owned.delete(api);
        this.records.delete(name);
        this.seriesMap.delete(name);
    }

    clear() {
        for (const api of this.owned) this.chart.removeSeries(api);
        this.owned.clear();
        this.records.clear();
        this.seriesMap.clear();
    }
}
