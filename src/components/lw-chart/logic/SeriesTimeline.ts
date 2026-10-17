import type { ISeriesApi, Time } from 'lightweight-charts';

export interface SeriesPoint { time: Time; [field: string]: any }
interface Timeline { points: Map<string, SeriesPoint>; tail?: SeriesPoint }
const timelines = new WeakMap<ISeriesApi<any>, Timeline>();
const key = (time: Time) => typeof time === 'object'
    ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}` : String(time);

/** SDK 的 data()/dataByIndex() 不包含 whitespace；提交时间线同时保留其状态文本。 */
export function seriesTimeline(series: ISeriesApi<any>): ReadonlyMap<string, SeriesPoint> {
    if (!timelines.has(series)) commitTimeline(series, new Map(series.data().map(point => [key(point.time), point])));
    return timelines.get(series)!.points;
}
export function timelinePoint(series: ISeriesApi<any>, time: Time): SeriesPoint | undefined {
    return timelines.get(series)?.points.get(key(time));
}
export function timelineTail(series: ISeriesApi<any>) {
    seriesTimeline(series);
    return timelines.get(series)!.tail;
}
export function nextTimeline(series: ISeriesApi<any>, points: SeriesPoint[], replace: boolean) {
    const next = replace ? new Map<string, SeriesPoint>() : new Map(seriesTimeline(series));
    for (const point of points) next.set(key(point.time), { ...point });
    return next;
}
export function commitTimeline(series: ISeriesApi<any>, timeline: Map<string, SeriesPoint>) {
    let tail: SeriesPoint | undefined;
    for (const point of timeline.values()) tail = point;
    timelines.set(series, { points: timeline, tail });
}
/** 时间线是绘图链独占的索引；SDK 接受增量后才写入，不对外发布可持有快照。 */
export function updateTimeline(series: ISeriesApi<any>, points: SeriesPoint[]) {
    seriesTimeline(series);
    const state = timelines.get(series)!;
    for (const point of points) {
        const name = key(point.time);
        const owned = { ...point };
        if (!state.points.has(name) || (state.tail && key(state.tail.time) === name)) state.tail = owned;
        state.points.set(name, owned);
    }
}
export function clearTimeline(series: ISeriesApi<any>) { timelines.delete(series); }
export const isGap = (point: SeriesPoint) => !('value' in point) && !('open' in point);
