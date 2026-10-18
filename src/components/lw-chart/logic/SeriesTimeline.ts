import type { ISeriesApi, Time } from 'lightweight-charts';

export interface SeriesPoint { time: Time; [field: string]: any }
interface Timeline { points: Map<string, SeriesPoint>; values?: SeriesPoint[]; tail?: SeriesPoint }
const timelines = new WeakMap<ISeriesApi<any>, Timeline>();
const key = (time: Time) => typeof time === 'object'
    ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}` : String(time);

/** SDK 的 data()/dataByIndex() 不包含 whitespace；提交时间线同时保留其状态文本。 */
export function seriesTimeline(series: ISeriesApi<any>): ReadonlyMap<string, SeriesPoint> {
    if (!timelines.has(series)) {
        const values: SeriesPoint[] = [...series.data()];
        timelines.set(series, { points: new Map(values.map(point => [key(point.time), point])), values, tail: values.at(-1) });
    }
    return timelines.get(series)!.points;
}
export function timelinePoint(series: ISeriesApi<any>, time: Time): SeriesPoint | undefined {
    return timelines.get(series)?.points.get(key(time));
}
export function timelineTail(series: ISeriesApi<any>) {
    seriesTimeline(series);
    return timelines.get(series)!.tail;
}
/** 只读借用有值点引用；与 SDK data() 一样排除 whitespace，但不重新构造整批对象。 */
export function seriesValues(series: ISeriesApi<any>): readonly SeriesPoint[] {
    seriesTimeline(series);
    const state = timelines.get(series)!;
    if (!state.values) {
        state.values = [];
        for (const point of state.points.values()) if (hasValue(point)) state.values.push(point);
    }
    return state.values;
}
const hasValue = (point: SeriesPoint) => point.open !== undefined || point.value !== undefined;
function lowerBound(values: SeriesPoint[], time: Time) {
    let low = 0, high = values.length;
    while (low < high) {
        const middle = (low + high) >>> 1, candidate = values[middle]!.time;
        const before = typeof candidate === 'number' && typeof time === 'number' ? candidate < time : key(candidate) < key(time);
        if (before) low = middle + 1;
        else high = middle;
    }
    return low;
}
export function nextTimeline(series: ISeriesApi<any>, points: readonly SeriesPoint[], replace: boolean) {
    const next = replace ? new Map<string, SeriesPoint>() : new Map(seriesTimeline(series));
    for (const point of points) next.set(key(point.time), { ...point });
    return next;
}
export function commitTimeline(series: ISeriesApi<any>, timeline: Map<string, SeriesPoint>) {
    let tail: SeriesPoint | undefined;
    // 自定义系列的 whitespace 由插件定义，只在完整提交时向 SDK 取一次有值时间。
    const custom = series.seriesType() === 'Custom' ? new Set(series.data().map(point => key(point.time))) : null;
    // 未参与查询的指标只持有原时间线，避免为每个角色预先分配额外引用数组。
    const values: SeriesPoint[] | undefined = custom || timelines.get(series)?.values ? [] : undefined;
    for (const point of timeline.values()) {
        tail = point;
        if (values && (custom ? custom.has(key(point.time)) : hasValue(point))) values.push(point);
    }
    timelines.set(series, { points: timeline, values, tail });
}
/** 时间线是绘图链独占的索引；SDK 接受增量后才写入，不对外发布可持有快照。 */
export function updateTimeline(series: ISeriesApi<any>, points: SeriesPoint[]) {
    seriesTimeline(series);
    const state = timelines.get(series)!;
    for (const point of points) {
        const name = key(point.time);
        const owned = { ...point };
        const old = state.points.get(name);
        if (state.values) {
            if (!old) {
                if (hasValue(owned)) state.values.push(owned);
            } else if (hasValue(old) || hasValue(owned)) {
                const index = lowerBound(state.values, point.time);
                if (hasValue(old) && hasValue(owned)) state.values[index] = owned;
                else state.values.splice(index, hasValue(old) ? 1 : 0, ...(hasValue(owned) ? [owned] : []));
            }
        }
        if (!state.points.has(name) || (state.tail && key(state.tail.time) === name)) state.tail = owned;
        state.points.set(name, owned);
    }
}
export function clearTimeline(series: ISeriesApi<any>) { timelines.delete(series); }
export const isGap = (point: SeriesPoint) => !('value' in point) && !('open' in point);
