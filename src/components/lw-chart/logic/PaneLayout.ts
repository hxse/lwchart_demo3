import type { IChartApi, IPaneApi, ISeriesApi, Time } from 'lightweight-charts';
import type { SeriesConfig, PaneWeightMode } from '../../../utils/chartTypes';

/** 记录已应用的配置预设，与 SDK 中临时拖动后的权重分开。 */
export class PaneWeights {
    private initialized = new WeakSet<IPaneApi<Time>>();
    private preset: Array<{ pane: IPaneApi<Time>; weight: number }> | undefined;

    apply(bindings: Array<{ config: SeriesConfig; api: ISeriesApi<any> }>, mode: PaneWeightMode) {
        const requested = new Set<IPaneApi<Time>>();
        const weights = new Map<IPaneApi<Time>,number>();
        for (const { config,api } of bindings) {
            const pane = api.getPane();
            if (config.paneWeight !== undefined) requested.add(pane);
            weights.set(pane,Math.max(weights.get(pane) ?? -Infinity,config.paneWeight ?? 1));
        }
        const next = [...weights].filter(([pane]) => requested.has(pane)).sort(([a],[b]) => a.paneIndex()-b.paneIndex())
            .map(([pane,weight]) => ({ pane,weight }));
        if (mode === 'preset') {
            const unchanged = this.preset?.length === next.length && next.every((item,index) =>
                item.pane === this.preset![index]!.pane && Object.is(item.weight,this.preset![index]!.weight));
            if (unchanged) return;
            for (const { pane,weight } of next) { pane.setStretchFactor(weight); this.initialized.add(pane); }
            this.preset = next;
        } else {
            this.preset = undefined;
            for (const { pane,weight } of next) if (!this.initialized.has(pane)) {
                pane.setStretchFactor(weight); this.initialized.add(pane);
            }
        }
    }
    clear() { this.preset = undefined; }
}

/** 协调期间保留空 Pane，避免删除／移动一个系列令后续目标编号前移。 */
export function preservePanePositions(chart: IChartApi, configs: SeriesConfig[]): () => void {
    const count = Math.max(1, ...configs.map(config => config.pane + 1));
    const preserved: Array<{ pane: IPaneApi<Time>; original: boolean }> = chart.panes().map(pane => ({
        pane, original: pane.preserveEmptyPane(),
    }));
    for (const { pane } of preserved) pane.setPreserveEmptyPane(true);
    while (chart.panes().length < count) preserved.push({ pane: chart.addPane(true), original: false });
    return () => {
        for (const { pane, original } of preserved) pane.setPreserveEmptyPane(original);
        // 只移除配置范围外的空 Pane，保留显式保留的 Pane 和目标位置。
        for (const pane of chart.panes().reverse()) {
            if (pane.paneIndex() >= count && !pane.preserveEmptyPane() && !pane.getSeries().length) chart.removePane(pane.paneIndex());
        }
    };
}
