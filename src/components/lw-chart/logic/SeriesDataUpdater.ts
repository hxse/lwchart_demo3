import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { SeriesDataPatch } from '../../../utils/chartTypes';
import { latestCandleIsUnclipped } from './CandleVisibility';

// SDK 的公开滚动接口到下一帧才应用；同帧下一批须使用已请求的偏移。
// SDK 应用偏移或用户拖动／缩放后，实际值发生变化，自动重新以 SDK 为准。
const pendingOffsets = new WeakMap<IChartApi, { series: ISeriesApi<any>; requested: number; observed: number; width: number; spacing: number }>();

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
    const actualRange = scale.getVisibleLogicalRange();
    const primary = seriesMap.values().next().value as ISeriesApi<any> | undefined;
    const oldLength = primary?.data().length || 0;
    const first = primary?.dataByIndex(0)?.time;
    const candle = primary?.seriesType() === 'Candlestick';
    if (!actualRange || !oldLength) pendingOffsets.delete(chart);
    const actualOffset = scale.scrollPosition();
    const spacing = scale.options().barSpacing;
    const pending = candle ? pendingOffsets.get(chart) : undefined;
    const shift = pending && pending.series === primary && pending.observed === actualOffset && pending.width === scale.width() && pending.spacing === spacing
        ? pending.requested - actualOffset : 0;
    const offset = actualOffset + shift;
    const range = actualRange && { from: actualRange.from + shift, to: actualRange.to + shift };
    // 完整贴边也跟随；只要蜡烛右侧有实际裁切，就保留用户的历史位置。
    const following = !range || !oldLength || (candle ? latestCandleIsUnclipped(scale, primary!, -shift * spacing) : range.to >= oldLength - 1);
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
        const move = (position: number) => {
            scale.scrollToPosition(position, false);
            pendingOffsets.set(chart, { series: primary, requested: position, observed: scale.scrollPosition(), width: scale.width(), spacing });
        };
        const restore = (to: number) => {
            // 蜡烛只改偏移，避免重新推导 barSpacing 引入小数间距的漂移。
            if (candle) move(to - (nextLength - 1));
            else scale.setVisibleLogicalRange({ from: to - (range.to - range.from), to });
        };
        if (following) {
            if (candle) move(offset);
            else restore(nextLength - 1 + range.to - (oldLength - 1));
        } else if (replace && anchor !== undefined) {
            const data = primary.data();
            const nextIndex = data.findIndex(p => p.time === anchor);
            if (nextIndex >= 0) {
                const shift = nextIndex - anchorIndex;
                restore(range.to + shift);
            } else if (first === primary.dataByIndex(0)?.time) restore(range.to);
            else {
                const to = nextLength - 1 + scale.options().rightOffset;
                restore(to);
            }
        } else restore(range.to);
    }
}
