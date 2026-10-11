import { createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { LegendManager } from '../../src/components/lw-chart/logic/LegendManager';
import { applySeriesData } from '../../src/components/lw-chart/logic/SeriesDataUpdater';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { chartSeries, chartPatches } from '../../src/crypto/data/chartData';
import { parseIndicator } from '../../src/indicators/parameters';
import { chartTheme } from '../../src/crypto/theme';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';
import type { SeriesConfig } from '../../src/utils/chartTypes';
import { installLineRecorder } from './line-recording';

const time = (index: number) => (1718000000 + index * 60) as UTCTimestamp;
const candle = (index: number, close = 100) => ({ time: time(index), open: close, high: close, low: close, close });
const row = (index: number, close: number): OhlcvRow => [time(index) * 1000, close, close, close, close, 10];
const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function createGapFixture() {
    const root = document.getElementById('chart')!;
    let chart: IChartApi;
    let registry: SeriesRegistry;
    let legend: LegendManager;
    let store: CandleStore;
    let configs: SeriesConfig[];
    let key = 'gaps';
    const indicators = [parseIndicator('cci,2')];
    function reset() {
        legend?.destroy(); registry?.clear(); chart?.remove();
        chart = createChart(root, { ...chartTheme('dark'), width: 640, height: 500,
            timeScale: { barSpacing: 40 }, layout: { panes: { enableResize: true } } });
        root.style.height = '500px';
        registry = new SeriesRegistry(chart);
        legend = new LegendManager(); legend.create(root); legend.setChart(chart); legend.setShowInAll(true);
        chart.subscribeCrosshairMove(param => legend.update(param));
    }
    function snapshot() {
        return { candles: registry.seriesMap.get('candles')!.data(), values: registry.seriesMap.get(key)!.data(),
            series: registry.seriesMap.size, panes: chart.panes().length,
            nativeSeries: chart.panes().reduce((count, pane) => count + pane.getSeries().length, 0) };
    }
    async function load(kind: 'Line' | 'Histogram', middle = false) {
        reset(); key = 'gaps';
        registry.apply([
            { name: 'candles', type: 'Candlestick', pane: 0, data: [candle(0), candle(1), candle(2)] },
            { name: key, type: kind, pane: 1, data: [{ time: time(0), value: 1 },
                { time: time(1), customValues: { displayValue: '未定义' } },
                middle ? { time: time(2), value: 3 } : { time: time(2), customValues: { displayValue: '未定义' } }],
                showInLegend: true, options: { color: '#ff00ff' } },
        ], 'reconcile', legend);
        chart.timeScale().setVisibleLogicalRange({ from: -1, to: 4 }); await painted();
        return snapshot();
    }
    async function restore() {
        applySeriesData(chart, registry.seriesMap, [
            { name: 'candles', data: [candle(2, 120)] },
            { name: key, data: [{ time: time(1), value: 2 }] },
        ], false);
        await painted(); return snapshot();
    }
    async function gap() {
        applySeriesData(chart, registry.seriesMap, [{ name: key, data: [{ time: time(1), customValues: { displayValue: '未定义' } }] }], false);
        await painted(); return snapshot();
    }
    async function invalid() {
        const before = snapshot(); let message = '';
        try {
            applySeriesData(chart, registry.seriesMap, [
                { name: 'candles', data: [candle(2, 130)] },
                { name: key, data: [{ time: (time(1) - 30) as UTCTimestamp, value: 999 }] },
            ], false);
        } catch (error) { message = (error as Error).message; }
        await painted(); return { before, after: snapshot(), message };
    }
    async function cci() {
        reset(); store = new CandleStore(20); store.setIndicators(indicators);
        configs = chartSeries(indicators);
        configs[1]!.options.color = '#ff00ff';
        key = configs[1]!.name!; registry.apply(configs, 'reconcile', legend);
        applySeriesData(chart, registry.seriesMap, chartPatches(store.initialize([90, 100, 100, 120].map((close, index) => row(index, close))), indicators), true);
        chart.timeScale().setVisibleLogicalRange({ from: -1, to: 5 });
        await painted(); return snapshot();
    }
    async function changeCci(close: number, append: boolean) {
        const index = store.rows.length - (append ? 0 : 1);
        const change = store.merge(append ? [store.rows.at(-1)!, row(index, close)] : [row(index, close)]);
        if (change.kind === 'reload') throw new Error('测试末根应正常覆盖或追加');
        applySeriesData(chart, registry.seriesMap, chartPatches(change, indicators, 'dark', store.indicators), change.kind === 'replace');
        await painted(); return snapshot();
    }
    function coordinates(index: number) {
        const pane = registry.seriesMap.get(key)!.getPane().getHTMLElement()!;
        const rectangle = pane.getBoundingClientRect();
        return { x: root.getBoundingClientRect().x + chart.timeScale().timeToCoordinate(time(index))!,
            y: rectangle.y + rectangle.height / 2 };
    }
    function strokes() {
        const api = registry.seriesMap.get(key)!;
        const canvas = [...api.getPane().getHTMLElement()!.querySelectorAll('canvas')]
            .find(canvas => canvas.clientWidth === chart.timeScale().width() && canvas.clientHeight > 0)!;
        const ratio = canvas.width / canvas.clientWidth;
        return { ratio, positions: Array.from({ length: store.rows.length }, (_, index) => chart.timeScale().timeToCoordinate(time(index))! * ratio),
            paths: window.lineFrames.get(canvas)!.strokes.filter(stroke => stroke.color === '#ff00ff') };
    }
    function syncLegend(index: number) { legend.update({ time: time(index), seriesData: new Map() }); }
    async function restyle(color: string, lineVisible: boolean) {
        const original = registry.seriesMap.get(key);
        configs = configs.map(config => config.name === key ? { ...config, options: { ...config.options, color, lineVisible } } : config);
        registry.apply(configs, 'reconcile', legend); await painted();
        return { ...snapshot(), retained: original === registry.seriesMap.get(key),
            colors: registry.seriesMap.get(key)!.getPane().getSeries().map(series => {
                const options = series.options(); return 'color' in options ? options.color : undefined;
            }) };
    }
    async function moveWithPrefix(add: boolean) {
        const original = registry.seriesMap.get(key);
        const candle = configs.find(config => config.name === 'candles')!;
        const indicator = { ...configs.find(config => config.name === key)!, pane: add ? 2 : 1 };
        configs = [candle, ...(add ? [{ name: 'prefix', type: 'Line' as const, pane: 1, data: [{ time: time(0), value: 50 }] }] : []), indicator];
        registry.apply(configs, 'reconcile', legend); await painted();
        return { ...snapshot(), retained: original === registry.seriesMap.get(key),
            paneSeries: chart.panes().map(pane => pane.getSeries().length) };
    }
    async function clear() {
        registry.clear(); await painted();
        // SDK 保留空主 Pane；释放应检查实际系列，包含内部画线段。
        return chart.panes().reduce((count, pane) => count + pane.getSeries().length, 0);
    }
    return { load, restore, gap, invalid, cci, changeCci, restyle, moveWithPrefix, coordinates, strokes, syncLegend, snapshot, clear };
}
declare global { interface Window { gapFixture: ReturnType<typeof createGapFixture> } }
installLineRecorder();
window.gapFixture = createGapFixture();
