import type { AutoscaleInfoProvider, CreatePriceLineOptions, IPriceLine, ISeriesApi } from 'lightweight-charts';
import type { PriceLineGroup } from '../../../utils/chartTypes';
import { PriceLineLabels, type PriceLineLabel } from './PriceLineLabels';

interface Line { api: IPriceLine; signature: string; price: number; label: PriceLineLabel & { axisLabelVisible: boolean } }
interface Group { lines: Map<string, Line>; autoscale: boolean; labelPosition: 'axis' | 'left' }
const defaultAutoscale: AutoscaleInfoProvider = base => base();

/** 统一持有配置参考线与动态分组；业务层不接触 SDK 实例或纵轴处理。 */
export class SeriesPriceLines {
    private references: IPriceLine[] = [];
    private referenceSignature = '';
    private groups = new Map<string, Group>();
    private labels?: PriceLineLabels;
    private baseAutoscale: AutoscaleInfoProvider;
    private range: { minValue: number; maxValue: number } | null = null;
    private autoscale: AutoscaleInfoProvider = base => {
        const info = this.baseAutoscale(base);
        if (!this.range) return info;
        return { ...info, priceRange: {
            minValue: Math.min(info?.priceRange?.minValue ?? Infinity, this.range.minValue),
            maxValue: Math.max(info?.priceRange?.maxValue ?? -Infinity, this.range.maxValue),
        } };
    };
    constructor(private series: ISeriesApi<any>, provider?: AutoscaleInfoProvider) { this.baseAutoscale = provider ?? defaultAutoscale; }

    applyOptions(options: Record<string, any>) {
        const changed = Object.hasOwn(options, 'autoscaleInfoProvider');
        if (changed) this.baseAutoscale = options.autoscaleInfoProvider ?? defaultAutoscale;
        this.series.applyOptions({ ...options, ...(this.range || changed ? { autoscaleInfoProvider: this.range ? this.autoscale : this.baseAutoscale } : {}) });
    }
    setReferences(lines: CreatePriceLineOptions[]) {
        const signature = JSON.stringify(lines);
        if (this.referenceSignature === signature) return;
        for (const line of this.references) this.series.removePriceLine(line);
        this.references = lines.map(line => this.series.createPriceLine(line));
        this.referenceSignature = signature;
    }
    set(group: PriceLineGroup) {
        if (typeof group.id !== 'string' || !group.id.trim()) throw new Error('价格线组 ID 不能为空');
        if (group.autoscale !== undefined && typeof group.autoscale !== 'boolean') throw new Error('价格线组 autoscale 必须是布尔值');
        const labelPosition = group.labelPosition === undefined ? 'axis' : group.labelPosition;
        if (!['axis', 'left'].includes(labelPosition)) throw new Error('价格线标签位置必须是 axis 或 left');
        const ids = new Set<string>();
        const lines = group.lines.map(line => {
            if (typeof line.id !== 'string' || !line.id.trim() || ids.has(line.id)) throw new Error('价格线 ID 不能为空或重复');
            ids.add(line.id);
            if (typeof line.price !== 'number' || !Number.isFinite(line.price)) throw new Error('价格线价格必须是有限数值');
            if (typeof line.color !== 'string' || typeof line.title !== 'string') throw new Error('价格线颜色与标题必须是字符串');
            const { lineStyle = 2, lineWidth = 1, axisLabelVisible = true } = line;
            if (![0, 1, 2, 3, 4].includes(lineStyle) || ![1, 2, 3, 4].includes(lineWidth)
                || typeof axisLabelVisible !== 'boolean') throw new Error('价格线样式、线宽或标签设置无效');
            return { id: line.id, price: line.price, color: line.color, title: line.title, lineStyle, lineWidth, axisLabelVisible };
        });
        const previous = this.groups.get(group.id);
        if (!lines.length) { this.clear(group.id); return; }
        const current: Group = previous ?? { lines: new Map<string, Line>(), autoscale: false, labelPosition };
        current.autoscale = group.autoscale ?? false;
        current.labelPosition = labelPosition;
        for (const [id, line] of current.lines) if (!ids.has(id)) {
            this.series.removePriceLine(line.api); current.lines.delete(id);
        }
        for (const options of lines) {
            const native = labelPosition === 'left' ? { ...options, title: '', axisLabelVisible: false } : options;
            const old = current.lines.get(options.id), signature = JSON.stringify(native);
            if (!old) current.lines.set(options.id, { api: this.series.createPriceLine(native), signature, price: options.price, label: options });
            else if (old.signature !== signature) {
                old.api.applyOptions(native); old.signature = signature; old.price = options.price;
            }
            if (old) old.label = options;
        }
        this.groups.set(group.id, current);
        this.updateRange(); this.updateLabels();
    }
    clear(id: string) {
        if (typeof id !== 'string' || !id.trim()) throw new Error('价格线组 ID 不能为空');
        const group = this.groups.get(id);
        if (!group) return;
        for (const line of group.lines.values()) this.series.removePriceLine(line.api);
        this.groups.delete(id); this.updateRange(); this.updateLabels();
    }
    private updateLabels() {
        const lines = [...this.groups.values()].filter(group => group.labelPosition === 'left')
            .flatMap(group => [...group.lines.values()].filter(line => line.label.axisLabelVisible).map(line => line.label));
        if (lines.length) {
            if (!this.labels) {
                this.labels = new PriceLineLabels(); this.labels.set(lines); this.series.attachPrimitive(this.labels);
            } else this.labels.set(lines);
        } else if (this.labels) { this.series.detachPrimitive(this.labels); this.labels = undefined; }
    }
    private updateRange() {
        let min = Infinity, max = -Infinity;
        for (const group of this.groups.values()) if (group.autoscale) for (const line of group.lines.values()) {
            min = Math.min(min, line.price); max = Math.max(max, line.price);
        }
        const next = min === Infinity ? null : { minValue: min, maxValue: max };
        if (next?.minValue === this.range?.minValue && next?.maxValue === this.range?.maxValue) return;
        this.range = next;
        // SDK 忽略 undefined，清组时用原计算或透传函数恢复；不解锁手动纵轴。
        this.series.applyOptions({ autoscaleInfoProvider: next ? this.autoscale : this.baseAutoscale });
    }
    dispose() {
        if (this.labels) { this.series.detachPrimitive(this.labels); this.labels = undefined; }
        for (const line of this.references) this.series.removePriceLine(line);
        for (const group of this.groups.values()) for (const line of group.lines.values()) this.series.removePriceLine(line.api);
        this.references = []; this.groups.clear(); this.range = null;
    }
}
