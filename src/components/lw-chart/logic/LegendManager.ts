import type { ISeriesApi, MouseEventParams, IChartApi, TimeFormatterFn } from 'lightweight-charts';
import { timelinePoint } from './SeriesTimeline';

const volumeFormatter = new Intl.NumberFormat('en', { maximumSignificantDigits: 8 });
const ohlcLabels = ['O', 'H', 'L', 'C'], volumeLabels = [...ohlcLabels, 'V'];
export interface LegendItemConfig {
    name: string;
    color: string;
    showInLegend: boolean;
    formatter?: (value: number) => string;
}
interface LegendRow { element: HTMLDivElement; labels: HTMLSpanElement[]; values: HTMLSpanElement[] }

/** 图例节点只属于当前注册系列，格式变化只更新实际发生变化的文字。 */
export class LegendManager {
    private legendElement: HTMLElement | null = null;
    private seriesMap = new Map<ISeriesApi<any>, LegendItemConfig>();
    private rows = new Map<ISeriesApi<any>, LegendRow>();
    private timeElement: HTMLDivElement | undefined;
    private timeMarkup = '';
    private showInAll = false;
    private chart: IChartApi | null = null;
    private timeFormatter: TimeFormatterFn | undefined;
    private lastParam: MouseEventParams | undefined;

    public setTimeFormatter(formatter: TimeFormatterFn | undefined): void {
        this.timeFormatter = formatter;
        if (this.lastParam) this.update(this.lastParam);
    }
    public create(container: HTMLElement): void {
        if (this.legendElement) return;
        this.legendElement = document.createElement('div');
        this.legendElement.className = 'chart-legend';
        Object.assign(this.legendElement.style, {
            position: 'absolute', left: '6px', top: '6px', zIndex: '10', fontSize: '11px',
            fontFamily: "'Inter', 'Segoe UI', 'Consolas', monospace", lineHeight: '14px',
            color: 'var(--chart-legend-value, #444)', background: 'var(--chart-legend-bg, rgba(255, 255, 255, 0.3))',
            padding: '4px 6px', borderRadius: '3px', border: '1px solid var(--chart-legend-border, rgba(0,0,0,0.08))',
            pointerEvents: 'none', display: 'none', flexDirection: 'column', gap: '1px',
            boxShadow: '0 1px 3px var(--chart-legend-shadow, rgba(0,0,0,0.05))', backdropFilter: 'blur(8px)',
        });
        container.style.position = 'relative'; container.appendChild(this.legendElement);
    }
    public registerSeries(series: ISeriesApi<any>, config: LegendItemConfig): void { this.seriesMap.set(series, config); }
    public clearSeries(): void {
        this.seriesMap.clear(); this.rows.clear(); this.timeElement = undefined; this.timeMarkup = '';
        this.legendElement?.replaceChildren(); this.display(false);
    }
    public setShowInAll(value: boolean): void { this.showInAll = value; }
    public setChart(chart: IChartApi): void { this.chart = chart; }
    private display(visible: boolean) {
        const next = visible ? 'flex' : 'none';
        if (this.legendElement && this.legendElement.style.display !== next) this.legendElement.style.display = next;
    }
    private place(element: HTMLElement, index: number) {
        const sibling = this.legendElement!.children.item(index);
        if (sibling !== element) this.legendElement!.insertBefore(element, sibling);
    }
    private write(element: HTMLElement, value: string) {
        if (element.textContent !== value) element.textContent = value;
    }
    private row(series: ISeriesApi<any>, labels: string[], values: string[], index: number) {
        let row = this.rows.get(series);
        if (!row) {
            const element = document.createElement('div'); element.className = 'legend-item';
            element.style.cssText = 'display:flex;align-items:center;gap:4px';
            row = { element, labels: [], values: [] }; this.rows.set(series, row);
        }
        if (row.values.length !== values.length) {
            row.element.replaceChildren(); row.labels = []; row.values = [];
            for (let i = 0; i < values.length; i++) {
                const label = document.createElement('span'), value = document.createElement('span');
                label.style.cssText = 'color:var(--chart-legend-label, #888);margin-right:2px';
                value.style.cssText = 'color:var(--chart-legend-value, #222);font-weight:500;margin-right:6px';
                if (i === 4) value.className = 'legend-volume';
                row.element.append(label, value); row.labels.push(label); row.values.push(value);
            }
        }
        values.forEach((value, i) => { this.write(row!.labels[i]!, labels[i]!); this.write(row!.values[i]!, value); });
        this.place(row.element, index);
    }
    private data(series: ISeriesApi<any>, param: MouseEventParams) {
        const known = timelinePoint(series, param.time!) ?? param.seriesData?.get(series);
        if (known || !this.chart) return known;
        try {
            const scale = this.chart.timeScale(), coordinate = scale.timeToCoordinate(param.time!);
            if (coordinate === null) return undefined;
            const index = scale.coordinateToLogical(coordinate);
            return index === null ? undefined : series.dataByIndex(Math.round(index));
        } catch { return undefined; }
    }
    public update(param: MouseEventParams): void {
        this.lastParam = param;
        if (!this.legendElement) return;
        if (!param.time || !this.showInAll && (!param.sourceEvent || !param.point || param.point.x < 0 || param.point.y < 0)) {
            this.display(false); return;
        }
        const markup = this.timeFormatter ? `T ${this.timeFormatter(param.time)}` : null;
        let index = markup === null ? 0 : 1, hasContent = false;
        this.seriesMap.forEach((config, series) => {
            const data = config.showInLegend ? this.data(series, param) : undefined;
            if (!data) { this.rows.get(series)?.element.remove(); return; }
            hasContent = true;
            if ('open' in data && 'high' in data && 'low' in data && 'close' in data) {
                const values = [data.open.toFixed(2), data.high.toFixed(2), data.low.toFixed(2), data.close.toFixed(2)];
                const volume = data.customValues?.volume;
                const hasVolume = typeof volume === 'number' && Number.isFinite(volume);
                if (hasVolume) values.push(volumeFormatter.format(volume));
                this.row(series, hasVolume ? volumeLabels : ohlcLabels, values, index++);
            } else if ('value' in data) {
                this.row(series, [config.name], [config.formatter ? config.formatter(data.value) : data.value.toFixed(2)], index++);
            } else if (typeof data.customValues?.displayValue === 'string') {
                this.row(series, [config.name], [data.customValues.displayValue], index++);
            } else this.rows.get(series)?.element.remove();
        });
        if (hasContent && markup !== null) {
            if (!this.timeElement) { this.timeElement = document.createElement('div'); this.timeElement.className = 'legend-time'; }
            // 时间格式器继续采用既有字符串渲染；数值、系列名和缺口文本均使用 textContent。
            if (this.timeMarkup !== markup) { this.timeElement.innerHTML = markup; this.timeMarkup = markup; }
            this.place(this.timeElement, 0);
        } else this.timeElement?.remove();
        this.display(hasContent);
    }
    public destroy(): void {
        this.legendElement?.remove(); this.legendElement = null;
        this.seriesMap.clear(); this.rows.clear(); this.timeElement = undefined; this.timeMarkup = '';
        this.lastParam = undefined; this.chart = null;
    }
}
