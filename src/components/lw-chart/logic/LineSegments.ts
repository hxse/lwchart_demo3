import { LineSeries, type IChartApi, type ISeriesApi, type LineSeriesOptions } from 'lightweight-charts';
import { seriesTimeline, type SeriesPoint } from './SeriesTimeline';

interface Segment { api: ISeriesApi<'Line'>; points: SeriesPoint[] }
interface Segments { chart: IChartApi; visible: boolean; series: Segment[]; style: Partial<LineSeriesOptions> }
const segments = new WeakMap<ISeriesApi<any>, Segments>();

/** 原生折线会跨 whitespace 连线。保留主系列的数据／轴／标记，只让连续段负责画线。 */
export function syncLineSegments(chart: IChartApi, api: ISeriesApi<any>, options?: { lineVisible?: boolean }) {
    if (api.seriesType() !== 'Line') return;
    let hasValues = false, gap = false, split = false;
    for (const point of seriesTimeline(api).values()) {
        if (!('value' in point)) { if (hasValues) gap = true; }
        else {
            if (gap) { split = true; break; }
            hasValues = true;
        }
    }
    let state = segments.get(api);
    if (!split) {
        if (state) {
            if (options?.lineVisible !== undefined) state.visible = options.lineVisible;
            clearLineSegments(api);
            api.applyOptions({ lineVisible: state.visible });
        }
        return;
    }
    const groups: SeriesPoint[][] = [];
    let current: SeriesPoint[] | undefined;
    for (const point of seriesTimeline(api).values()) {
        if (!('value' in point)) { current = undefined; continue; }
        if (!current) { current = []; groups.push(current); }
        current.push(point);
    }
    const fresh = !state;
    if (!state) {
        state = { chart, visible: api.options().lineVisible, series: [], style: {} };
        segments.set(api, state);
    }
    if (options?.lineVisible !== undefined) state.visible = options.lineVisible;
    if (fresh || options) {
        state.style = { ...api.options(), lineVisible: state.visible, pointMarkersVisible: false,
            lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null };
    }
    if (fresh || options?.lineVisible !== undefined) api.applyOptions({ lineVisible: false });
    const wanted = state.visible ? groups.length : 0;
    while (state.series.length > wanted) chart.removeSeries(state.series.pop()!.api);
    groups.slice(0, wanted).forEach((data, index) => {
        let segment = state!.series[index];
        const added = !segment;
        if (!segment) {
            segment = { api: chart.addSeries(LineSeries, state!.style, api.getPane().paneIndex()), points: [] };
            state!.series.push(segment);
        } else if (options) segment.api.applyOptions(state!.style);
        const series = segment.api;
        if (series.getPane().paneIndex() !== api.getPane().paneIndex()) series.moveToPane(api.getPane().paneIndex());
        // 已提交时间线的点按写时复制；引用未变意味着该段的全部字段未变。
        if (added || data.length !== segment.points.length || data.some((point, index) => point !== segment!.points[index])) {
            series.setData(data as any);
            segment.points = data;
        }
    });
}

export function clearLineSegments(api: ISeriesApi<any>) {
    const state = segments.get(api);
    if (state) for (const series of state.series) state.chart.removeSeries(series.api);
    segments.delete(api);
}
