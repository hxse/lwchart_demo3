import { LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { seriesTimeline, type SeriesPoint } from './SeriesTimeline';

interface Segments { chart: IChartApi; visible: boolean; series: ISeriesApi<'Line'>[] }
const segments = new WeakMap<ISeriesApi<any>, Segments>();

/** 原生折线会跨 whitespace 连线。保留主系列的数据／轴／标记，只让连续段负责画线。 */
export function syncLineSegments(chart: IChartApi, api: ISeriesApi<any>, options?: { lineVisible?: boolean }) {
    if (api.seriesType() !== 'Line') return;
    const groups: SeriesPoint[][] = [];
    let current: SeriesPoint[] | undefined;
    for (const point of seriesTimeline(api).values()) {
        if (!('value' in point)) { current = undefined; continue; }
        if (!current) { current = []; groups.push(current); }
        current.push(point);
    }
    let state = segments.get(api);
    if (groups.length < 2) {
        if (state) {
            if (options?.lineVisible !== undefined) state.visible = options.lineVisible;
            clearLineSegments(api);
            api.applyOptions({ lineVisible: state.visible });
        }
        return;
    }
    if (!state) {
        state = { chart, visible: api.options().lineVisible, series: [] };
        segments.set(api, state);
    }
    if (options?.lineVisible !== undefined) state.visible = options.lineVisible;
    const style = { ...api.options(), lineVisible: state.visible, pointMarkersVisible: false,
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null };
    api.applyOptions({ lineVisible: false });
    const wanted = state.visible ? groups.length : 0;
    while (state.series.length > wanted) chart.removeSeries(state.series.pop()!);
    groups.slice(0, wanted).forEach((data, index) => {
        const series = state!.series[index] ?? chart.addSeries(LineSeries, style, api.getPane().paneIndex());
        if (!state!.series[index]) state!.series.push(series);
        else series.applyOptions(style);
        if (series.getPane().paneIndex() !== api.getPane().paneIndex()) series.moveToPane(api.getPane().paneIndex());
        series.setData(data as any);
    });
}

export function clearLineSegments(api: ISeriesApi<any>) {
    const state = segments.get(api);
    if (state) for (const series of state.series) state.chart.removeSeries(series);
    segments.delete(api);
}
