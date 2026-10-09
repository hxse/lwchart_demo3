import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { applySeriesData } from '../../src/components/lw-chart/logic/SeriesDataUpdater';
import { candleRightEdge } from '../../src/components/lw-chart/logic/CandleVisibility';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { chartSeries, chartPatches } from '../../src/crypto/data/chartData';
import { chartTheme } from '../../src/crypto/theme';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';
import { installCandleRecorder } from './canvas-recording';

export interface ViewportSnapshot {
    tail: number; center: number; spacing: number; offset: number; from: number; to: number;
    bitmapWidth: number; ratio: number; bodyWidth: number; right: number; predictedRight: number;
    drawnRight: number; bars: number; generation: number;
}
declare global { interface Window { viewportFixture: ReturnType<typeof createViewportFixture> } }

function point(index: number): OhlcvRow {
    return [Date.UTC(2026, 9, 9) + index * 60000, 98, 105, 95, 100, 10];
}
async function painted() {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function createViewportFixture() {
    let chart: IChartApi;
    let registry: SeriesRegistry;
    let primary: ISeriesApi<any>;
    let store: CandleStore;
    let next = 0;
    const root = document.getElementById('chart')!;
    function snapshot(): ViewportSnapshot {
        const scale = chart.timeScale();
        const canvas = [...primary.getPane().getHTMLElement()!.querySelectorAll('canvas')]
            .find(canvas => canvas.clientWidth === scale.width() && canvas.clientHeight > 0)!;
        const frame = window.candleFrames.get(canvas)!;
        const rectangle = frame.rectangles.at(-1)!;
        const tail = Number(primary.data().at(-1)!.time);
        const center = scale.timeToCoordinate(tail as UTCTimestamp)!;
        const ratio = canvas.width / canvas.clientWidth;
        const spacing = scale.options().barSpacing;
        const range = scale.getVisibleLogicalRange()!;
        return { tail, center, spacing, offset: scale.scrollPosition(), from: range.from, to: range.to,
            bitmapWidth: canvas.width, ratio, bodyWidth: rectangle.width,
            // 宽度来自 SDK 实际绘制，独立于生产几何适配器。
            right: Math.round(center * ratio) - Math.floor(rectangle.width / 2) + rectangle.width,
            predictedRight: candleRightEdge(center, spacing, ratio),
            drawnRight: rectangle.x + rectangle.width, bars: store.rows.length, generation: frame.generation };
    }
    async function load(options: { spacing: number; count?: number; capacity?: number }) {
        chart?.remove();
        chart = createChart(root, { ...chartTheme('dark'), width: 640, height: 300,
            timeScale: { barSpacing: options.spacing, rightOffset: 5 },
            rightPriceScale: { scaleMargins: { top: 0.03, bottom: 0.03 } } });
        registry = new SeriesRegistry(chart);
        registry.apply(chartSeries([]), 'reconcile', null);
        primary = registry.seriesMap.get('candles')!;
        const count = options.count ?? 40;
        store = new CandleStore(options.capacity ?? 1000);
        next = count;
        applySeriesData(chart, registry.seriesMap, chartPatches(store.initialize(Array.from({ length: count }, (_, i) => point(i))), []), true);
        await painted();
        return snapshot();
    }
    async function place(mode: 'touch' | 'pixel' | 'partial' | 'hidden' | 'gap') {
        const state = snapshot();
        const hidden = mode === 'pixel' ? 1 : mode === 'partial' ? Math.max(1, Math.round(state.bodyWidth / 3))
            : mode === 'hidden' ? Math.ceil(state.spacing * state.ratio * 4) : mode === 'gap' ? -40 * state.ratio : 0;
        const half = state.right - Math.round(state.center * state.ratio);
        const center = (state.bitmapWidth + hidden - half) / state.ratio;
        chart.timeScale().scrollToPosition(state.offset + (state.center - center) / state.spacing, false);
        await painted();
        return snapshot();
    }
    function submit(count: number) {
        const change = store.merge([store.rows.at(-1)!, ...Array.from({ length: count }, () => point(next++))])!;
        applySeriesData(chart, registry.seriesMap, chartPatches(change, []), change.kind === 'replace');
    }
    async function append(count = 1) {
        submit(count);
        await painted();
        return snapshot();
    }
    async function burst(count: number) {
        for (let index = 0; index < count; index++) submit(1);
        await painted();
        return snapshot();
    }
    async function revise(historical = false) {
        const row = [...store.rows.at(historical ? -3 : -1)!] as OhlcvRow;
        row[4] += 0.5;
        const change = store.merge(historical ? [row, store.rows.at(-1)!] : [row])!;
        applySeriesData(chart, registry.seriesMap, chartPatches(change, []), change.kind === 'replace');
        await painted();
        return snapshot();
    }
    function positions(times: number[]) { return times.map(time => chart.timeScale().timeToCoordinate(time as UTCTimestamp)); }
    return { load, place, append, burst, revise, positions, snapshot };
}

installCandleRecorder();
window.viewportFixture = createViewportFixture();
