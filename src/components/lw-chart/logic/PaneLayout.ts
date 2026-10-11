import type { IChartApi, IPaneApi, Time } from 'lightweight-charts';
import type { SeriesConfig } from '../../../utils/chartTypes';

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
