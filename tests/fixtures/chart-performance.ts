import { createChart, type UTCTimestamp } from 'lightweight-charts';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { LegendManager } from '../../src/components/lw-chart/logic/LegendManager';
import { applySeriesData } from '../../src/components/lw-chart/logic/SeriesDataUpdater';
import { findClosestTime } from '../../src/components/lw-chart/logic/TimeScaleHelper';
import { latestCandleIsUnclipped } from '../../src/components/lw-chart/logic/CandleVisibility';
import { seriesValues } from '../../src/components/lw-chart/logic/SeriesTimeline';
import { syncLineSegments } from '../../src/components/lw-chart/logic/LineSegments';

const time = (i: number) => (1718000000 + i * 60) as UTCTimestamp;
const candle = (i: number) => ({ time: time(i), open: 100, high: 102, low: 99, close: 101, customValues: { volume: 12.5 } });
const painted = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const root = document.getElementById('chart')!;
const chart = createChart(root, { width: 640, height: 400 });
const registry = new SeriesRegistry(chart), legend = new LegendManager();
legend.create(root); legend.setChart(chart); legend.setShowInAll(true); legend.setTimeFormatter(value => `at ${value}`);
const configs = [
    { name: 'candles', type: 'Candlestick' as const, pane: 0, data: [candle(0), candle(1), candle(2)], showInLegend: true },
    { name: 'line', type: 'Line' as const, pane: 0, data: [{ time: time(0), value: 10 },
        { time: time(1), customValues: { displayValue: '<未定义>' } }, { time: time(2), value: 30 }],
        options: { color: '#ff00ff' }, displayName: '<名称>', valueFormatter: (number: number) => `<${number}>`, showInLegend: true },
];
registry.apply(configs, 'reconcile', legend);
chart.timeScale().fitContent();
const primary = registry.seriesMap.get('candles')!, line = registry.seriesMap.get('line')!;
let dataReads = 0;
for (const api of registry.seriesMap.values()) {
    const data = api.data.bind(api); api.data = () => { dataReads++; return data(); };
}
const show = (i: number) => legend.update({ time: time(i), seriesData: new Map() });
const element = () => root.querySelector<HTMLElement>('.chart-legend')!;
function repeatLegend() {
    show(2);
    const nodes = [...element().querySelectorAll('*')];
    const observer = new MutationObserver(() => {}); observer.observe(element(), { subtree: true, childList: true, characterData: true, attributes: true });
    for (let i = 0; i < 100; i++) show(2);
    const mutations = observer.takeRecords().length; observer.disconnect();
    return { mutations, sameNodes: nodes.every((node, index) => node === element().querySelectorAll('*')[index]), text: element().textContent };
}
function changeLegend() {
    show(2); const nodes = [...element().querySelectorAll('*')];
    applySeriesData(chart, registry.seriesMap, [{ name: 'candles', data: [{ ...candle(2), close: 102 }] },
        { name: 'line', data: [{ time: time(2), value: 31 }] }], false); show(2);
    return { text: element().textContent, sameNodes: nodes.every((node, index) => node === element().querySelectorAll('*')[index]),
        html: element().innerHTML };
}
function legendState(kind: string) {
    if (kind === 'gap') show(1);
    if (kind === 'hide') legend.update({ seriesData: new Map() });
    if (kind === 'show') show(2);
    if (kind === 'format') legend.setTimeFormatter(value => `new ${value}`);
    if (kind === 'no-format') legend.setTimeFormatter(undefined);
    if (kind === 'clear') legend.clearSeries();
    return { text: element().textContent, display: element().style.display, rows: element().querySelectorAll('.legend-item').length,
        timeRows: element().querySelectorAll('.legend-time').length, html: element().innerHTML };
}
async function queries() {
    await painted(); dataReads = 0;
    const closest = [time(0) - 1, time(0), time(1) + 30, time(2) + 60].map(t => findClosestTime(registry.seriesMap, t));
    for (let i = 0; i < 100; i++) latestCandleIsUnclipped(chart.timeScale(), primary);
    // 行情裁剪时恢复历史锚点也不要求复制整批 SDK 数据。
    chart.timeScale().setVisibleLogicalRange({ from: 0, to: .5 });
    applySeriesData(chart, registry.seriesMap, [{ name: 'candles', data: [candle(1), candle(2), candle(3)] }], true);
    return { closest, dataReads, values: seriesValues(primary).map(point => point.time), current: findClosestTime(registry.seriesMap, time(0)) };
}
function segments() {
    const auxiliary = line.getPane().getSeries().filter(api => api !== primary && api !== line);
    const writes = auxiliary.map(() => ({ data: 0, options: 0 }));
    const restore = auxiliary.map((api, index) => {
        const set = api.setData.bind(api), options = api.applyOptions.bind(api);
        api.setData = data => { writes[index]!.data++; set(data); };
        api.applyOptions = value => { writes[index]!.options++; options(value); };
        return () => { api.setData = set; api.applyOptions = options; };
    });
    for (let i = 0; i < 10; i++) syncLineSegments(chart, line);
    const unchanged = structuredClone(writes);
    applySeriesData(chart, registry.seriesMap, [{ name: 'line', data: [{ time: time(2), value: 33 }] }], false);
    const tail = structuredClone(writes);
    registry.apply(configs.map(config => config.name === 'line' ? { ...config, options: { color: '#00ff00' } } : config), 'reconcile', legend);
    const colors = auxiliary.map(api => { const options = api.options(); return 'color' in options ? options.color : undefined; });
    restore.forEach(run => run());
    return { unchanged, tail, colors, series: chart.panes().flatMap(pane => pane.getSeries()).length };
}
function customQueries() {
    registry.apply([{ name: 'arrows', type: 'PositionArrow', pane: 0, data: [
        { time: time(0), points: [] }, { time: time(1), points: [{ value: 100, direction: 'entry', isLong: true }] },
        { time: time(2), points: [] },
    ] }], 'replace', legend);
    return { values: seriesValues(registry.seriesMap.get('arrows')!).map(point => point.time),
        match: findClosestTime(registry.seriesMap, time(2)), missing: findClosestTime(registry.seriesMap, time(0)) };
}
const performanceFixture = { repeatLegend, changeLegend, legendState, queries, segments, customQueries };
declare global { interface Window { performanceFixture: typeof performanceFixture } }
window.performanceFixture = performanceFixture;
