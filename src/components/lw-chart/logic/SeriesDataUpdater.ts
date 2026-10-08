import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { SeriesDataPatch } from '../../../utils/chartTypes';

/** 先验证整批数据，再更新现有系列，避免不合法补丁留下部分结果。 */
export function applySeriesData(
    chart: IChartApi,
    seriesMap: Map<string, ISeriesApi<any>>,
    patches: SeriesDataPatch[],
    replace: boolean,
) {
    const names = new Set<string>();
    for (const patch of patches) {
        const series = seriesMap.get(patch.name);
        if (!series || names.has(patch.name)) throw new Error('未知或重复的系列名称');
        names.add(patch.name);
        const kind = series.seriesType();
        if (kind !== 'Candlestick' && kind !== 'Line') throw new Error('数据补丁仅支持蜡烛与折线系列');
        // EMA 预热后的首个点可能不是全图逻辑索引 0，按实际数据获取末根。
        const existing = series.data();
        const last = existing.at(-1);
        const times = new Set(existing.map(point => Number(point.time)));
        let previous = -Infinity;
        for (const point of patch.data) {
            const time = point.time as number;
            if (!Number.isFinite(time) || time <= previous) throw new Error('图表补丁时间必须严格递增');
            if (!replace && last && time < Number(last.time) && !times.has(time)) throw new Error('图表历史修正只能使用已有时间');
            previous = time;
            if (kind === 'Candlestick') {
                if (!('open' in point) || ![point.open, point.high, point.low, point.close].every(Number.isFinite)
                    || point.high < Math.max(point.open, point.close, point.low)
                    || point.low > Math.min(point.open, point.close)) throw new Error('无效的蜡烛数据');
            } else if (!('value' in point) || !Number.isFinite(point.value)) throw new Error('无效的折线数据');
        }
    }

    const scale = chart.timeScale();
    const range = scale.getVisibleLogicalRange();
    const primary = seriesMap.values().next().value as ISeriesApi<any> | undefined;
    const oldLength = primary?.data().length || 0;
    const first = primary?.dataByIndex(0)?.time;
    // 按时间恢复被窗口裁剪影响的历史视口；正在看末尾时继续跟随末尾。
    const following = !range || range.to >= oldLength - 1;
    let anchor: Time | undefined;
    let anchorIndex = 0;
    if (!following && primary && range) {
        anchorIndex = Math.max(0, Math.min(oldLength - 1, Math.ceil(range.from)));
        anchor = primary.dataByIndex(anchorIndex)?.time;
    }
    for (const patch of patches) {
        const series = seriesMap.get(patch.name)!;
        if (replace) series.setData(patch.data);
        else {
            let tail = Number(series.data().at(-1)?.time ?? -Infinity);
            for (const point of patch.data) {
                series.update(point, Number(point.time) < tail);
                tail = Math.max(tail, Number(point.time));
            }
        }
    }
    if (range && primary) {
        const nextLength = primary.data().length;
        if (following) {
            const offset = range.to - (oldLength - 1);
            const to = nextLength - 1 + offset;
            scale.setVisibleLogicalRange({ from: to - (range.to - range.from), to });
        } else if (replace && anchor !== undefined) {
            const data = primary.data();
            const nextIndex = data.findIndex(p => p.time === anchor);
            if (nextIndex >= 0) {
                const shift = nextIndex - anchorIndex;
                scale.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
            } else if (first === primary.dataByIndex(0)?.time) scale.setVisibleLogicalRange(range);
            else {
                const to = nextLength - 1 + scale.options().rightOffset;
                scale.setVisibleLogicalRange({ from: to - (range.to - range.from), to });
            }
        } else scale.setVisibleLogicalRange(range);
    }
}
