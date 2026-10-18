import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { LegendManager } from '../../src/components/lw-chart/logic/LegendManager';
import { latestCandleIsUnclipped } from '../../src/components/lw-chart/logic/CandleVisibility';
import { findClosestTime } from '../../src/components/lw-chart/logic/TimeScaleHelper';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { chartPatches, chartSeries } from '../../src/crypto/data/chartData';
import { applySeriesData } from '../../src/components/lw-chart/logic/SeriesDataUpdater';
import { convertToBlob } from '../../src/pages/ChartDashboard/state/FileLoader';
import { marketSeriesKey } from '../../src/indicators/parameters';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';

const origin = 1718000000;
const time = (index: number) => (origin + index * 60) as UTCTimestamp;
const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const cciSpecs = [{ type: 'cci', period: 2 }] as const;
interface View {
    chart: IChartApi; registry: SeriesRegistry; legend: LegendManager; primary: ISeriesApi<any>;
    element: HTMLElement; observer: MutationObserver; mutations: { count: number }; size: number;
}
let views: View[] = [], store: CandleStore | undefined, encoded = '';
let reads = 0, rowsRead = 0, segmentWrites = 0, optionWrites = 0;
function dispose() {
    for (const view of views) { view.observer.disconnect(); view.legend.destroy(); view.registry.clear(); view.chart.remove(); }
    views = []; store = undefined; encoded = ''; document.body.replaceChildren();
}
function create(size: number, cci = false) {
    const element = document.createElement('div');
    element.style.cssText = 'width:600px;height:360px;display:inline-block'; document.body.append(element);
    const chart = createChart(element, { width: 600, height: 360, layout: { attributionLogo: false } });
    const legend = new LegendManager(); legend.create(element); legend.setChart(chart); legend.setShowInAll(true);
    legend.setTimeFormatter(value => String(value));
    const registry = new SeriesRegistry(chart);
    registry.apply(cci ? chartSeries([...cciSpecs]) : [{ name: 'candles', type: 'Candlestick', pane: 0, showInLegend: true,
        data: Array.from({ length: size }, (_, i) => ({ time: time(i), open: 100, high: 105, low: 99, close: 104 })) }], 'reconcile', legend);
    const primary = registry.seriesMap.get('candles')!;
    const data = primary.data.bind(primary); primary.data = () => { const result = data(); reads++; rowsRead += result.length; return result; };
    const mutations = { count: 0 }, observer = new MutationObserver(records => { mutations.count += records.length; });
    observer.observe(element.querySelector('.chart-legend')!, { subtree: true, childList: true, characterData: true, attributes: true });
    views.push({ chart, registry, legend, primary, element, observer, mutations, size });
}
async function initialize(size: number) {
    dispose(); for (let index = 0; index < 4; index++) create(size);
    await painted();
}
function prepare() {
    for (const view of views) {
        view.legend.update({ time: time(view.size - 1), seriesData: new Map() }); view.observer.takeRecords(); view.mutations.count = 0;
    }
    reads = 0; rowsRead = 0; segmentWrites = 0; optionWrites = 0;
}
async function run(kind: 'visibility' | 'crosshair' | 'legend', rounds: number) {
    const started = performance.now(); let checksum = 0;
    for (let i = 0; i < rounds; i++) {
        for (const [index, view] of views.entries()) {
            if (kind === 'visibility') checksum += Number(latestCandleIsUnclipped(view.chart.timeScale(), view.primary));
            else if (kind === 'crosshair' && index) {
                const match = findClosestTime(view.registry.seriesMap, time(view.size - 1 - i % 400));
                if (match === null) throw new Error('光标测试必须有匹配');
                view.chart.setCrosshairPosition(NaN, match as UTCTimestamp, view.primary);
                view.legend.update({ time: match as UTCTimestamp, seriesData: new Map() }); checksum += match;
            } else if (kind === 'legend') view.legend.update({ time: time(view.size - 1), seriesData: new Map() });
        }
        if (i % 20 === 19) await painted();
    }
    await painted();
    return { elapsed_ms: performance.now() - started, sdk_data_reads: reads, sdk_data_rows: rowsRead,
        dom_mutations: views.reduce((sum, view) => sum + view.mutations.count + view.observer.takeRecords().length, 0),
        checksum: [checksum, ...views.map(view => view.element.querySelector('.chart-legend')!.textContent)] };
}
const cciRow = (index: number, revision = 0): OhlcvRow => {
    const close = 100 + Math.floor(index / 2) + revision;
    return [time(index) * 1000, close, close, close, close, 10];
};
async function initializeGaps(size: number) {
    dispose(); create(size, true); store = new CandleStore(size); store.setIndicators(cciSpecs);
    const view = views[0]!;
    applySeriesData(view.chart, view.registry.seriesMap, chartPatches(store.initialize(Array.from({ length: size }, (_, i) => cciRow(i))), [...cciSpecs]), true);
    for (const api of view.chart.panes().flatMap(pane => pane.getSeries())) {
        if ([...view.registry.seriesMap.values()].includes(api)) continue;
        const set = api.setData.bind(api), options = api.applyOptions.bind(api);
        api.setData = values => { segmentWrites++; set(values); };
        api.applyOptions = value => { optionWrites++; options(value); };
    }
    await painted(); prepare();
}
async function updateGaps(rounds: number) {
    const started = performance.now(), view = views[0]!;
    for (let i = 0; i < rounds; i++) {
        const change = store!.merge([cciRow(view.size - 1, (i + 1) / 100)]);
        if (change.kind === 'reload') throw new Error('缺口测试必须正常更新');
        applySeriesData(view.chart, view.registry.seriesMap, chartPatches(change, [...cciSpecs], 'dark', store!.indicators), change.kind === 'replace');
    }
    await painted();
    const last = view.registry.seriesMap.get(marketSeriesKey(cciSpecs[0], 'value'))!;
    return { elapsed_ms: performance.now() - started, segment_data_writes: segmentWrites, segment_option_writes: optionWrites,
        sdk_series: view.chart.panes().reduce((sum, pane) => sum + pane.getSeries().length, 0),
        checksum: { tail: store!.rows.at(-1), value: last.dataByIndex(view.size - 1) } };
}
function initializeBytes(size: number) {
    dispose();
    const alphabet = String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i));
    encoded = btoa(alphabet.repeat(Math.ceil(size / 256)).slice(0, size));
}
async function convert(rounds: number) {
    const started = performance.now(); let checksum = 0;
    for (let i = 0; i < rounds; i++) {
        const blob = convertToBlob(encoded), bytes = new Uint8Array(await blob.arrayBuffer());
        if (blob.type !== 'application/zip') throw new Error('Blob 类型变化');
        for (let index = 0; index < bytes.length; index++) {
            if (bytes[index] !== index % 256) throw new Error('Base64 字节变化'); checksum += bytes[index]!;
        }
    }
    return { elapsed_ms: performance.now() - started, checksum };
}
export const hotMemoryBench = { initialize, prepare, run, initializeGaps, updateGaps, initializeBytes, convert, dispose };
