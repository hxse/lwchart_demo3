import type { ISeriesApi, Time } from 'lightweight-charts';

export interface SeriesPoint { time: Time; [field: string]: any }
const timelines = new WeakMap<ISeriesApi<any>, Map<string, SeriesPoint>>();
const key = (time: Time) => typeof time === 'object'
    ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}` : String(time);

/** SDK 的 data()/dataByIndex() 不包含 whitespace；提交时间线同时保留其状态文本。 */
export function seriesTimeline(series: ISeriesApi<any>): ReadonlyMap<string, SeriesPoint> {
    return timelines.get(series) ?? new Map(series.data().map(point => [key(point.time), point]));
}
export function timelinePoint(series: ISeriesApi<any>, time: Time): SeriesPoint | undefined {
    return timelines.get(series)?.get(key(time));
}
export function nextTimeline(series: ISeriesApi<any>, points: SeriesPoint[], replace: boolean) {
    const next = replace ? new Map<string, SeriesPoint>() : new Map(seriesTimeline(series));
    for (const point of points) next.set(key(point.time), { ...point });
    return next;
}
export function commitTimeline(series: ISeriesApi<any>, timeline: Map<string, SeriesPoint>) {
    timelines.set(series, timeline);
}
export function clearTimeline(series: ISeriesApi<any>) { timelines.delete(series); }
export const isGap = (point: SeriesPoint) => !('value' in point) && !('open' in point);
