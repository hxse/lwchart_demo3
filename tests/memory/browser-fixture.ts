import { createChart } from 'lightweight-charts';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { chartSeries, chartPatches } from '../../src/crypto/data/chartData';
import { parseIndicatorList } from '../../src/indicators/parameters';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { applySeriesData } from '../../src/components/lw-chart/logic/SeriesDataUpdater';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';

const specs = parseIndicatorList('ema,14;ema,50;ema,100;rsi,14;macd,12,26,9');
const candle = (index: number, revision = 0): OhlcvRow => {
    const close = 100 + Math.sin(index / 13) * 5 + revision;
    return [1718000000000 + index * 60000, close - 1, close + 2, close - 2, close, 12.5];
};
const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
let charts: Array<{ chart: ReturnType<typeof createChart>; registry: SeriesRegistry; store: CandleStore; tail: number; revision: number }> = [];

function dispose() {
    for (const { chart, registry } of charts) { registry.clear(); chart.remove(); }
    charts = [];
    document.body.replaceChildren();
}
async function initialize(size: number) {
    dispose();
    for (let i = 0; i < 4; i++) {
        const element = document.createElement('div');
        element.style.cssText = 'width:600px;height:360px;display:inline-block';
        document.body.append(element);
        const chart = createChart(element, { width: 600, height: 360, layout: { attributionLogo: false } });
        const registry = new SeriesRegistry(chart);
        registry.apply(chartSeries(specs), 'reconcile', null);
        const store = new CandleStore(size);
        store.setIndicators(specs);
        const initial = store.initialize(Array.from({ length: size }, (_, index) => candle(index)));
        applySeriesData(chart, registry.seriesMap, chartPatches(initial, specs), true);
        charts.push({ chart, registry, store, tail: size - 1, revision: 0 });
    }
    await painted();
    return checksum();
}
function checksum() {
    return charts.map(({ registry, store, tail, revision }) => {
        const plotted = registry.seriesMap.get('candles')!.data().at(-1) as { close: number };
        if (plotted.close !== store.rows.at(-1)![4]) throw new Error('图表与行情末根不一致');
        if (store.rows.length !== store.capacity || store.tail !== candle(tail)[0]) throw new Error('历史窗口不一致');
        return { count: store.rows.length, tail: store.tail, close: plotted.close, revision,
            indicators: [...store.indicators].map(([key, result]) => [key, [...result.outputs].map(([role, points]) => [role, points.at(-1)])]) };
    });
}
async function update(kind: 'repeat' | 'tail' | 'append', rounds: number) {
    const start = performance.now();
    for (let i = 0; i < rounds; i++) {
        for (const state of charts) {
            if (kind === 'tail') state.revision = (i + 1) / 1000;
            // 新根加入时保留之前末根的已提交值，不构造虚假的历史修正。
            const batch = state.store.rows.slice(-5).map(row => [...row] as OhlcvRow);
            if (kind === 'tail') batch[batch.length - 1] = candle(state.tail, state.revision);
            if (kind === 'append') { state.tail++; state.revision = 0; batch.push(candle(state.tail)); batch.shift(); }
            const change = state.store.merge(batch);
            if (change.kind === 'reload') throw new Error(`离线增量意外重载：${change.reason}`);
            if (change.kind === 'replace' || change.rows.length || change.indicators.size) {
                applySeriesData(state.chart, state.registry.seriesMap, chartPatches(change, specs, 'dark', state.store.indicators), change.kind === 'replace');
            }
        }
        if (i % 10 === 9) await painted();
    }
    await painted();
    return { elapsed_ms: performance.now() - start, checksum: checksum() };
}
export const memoryBench = { initialize, update, dispose };
Object.assign(window, { memoryBench });
