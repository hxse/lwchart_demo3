import { createChart, type UTCTimestamp } from 'lightweight-charts';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { chartSeries } from '../../src/crypto/data/chartData';
import type { PriceLineGroup } from '../../src/utils/chartTypes';

const chart = createChart(document.getElementById('chart')!, { width: 640, height: 300,
    rightPriceScale: { autoScale: true }, timeScale: { barSpacing: 8, rightOffset: 3 } });
const registry = new SeriesRegistry(chart);
registry.apply(chartSeries([]), 'reconcile', null);
const candle = registry.seriesMap.get('candles')!;
candle.setData(Array.from({ length: 100 }, (_, i) => ({ time: (1718000000 + i * 60) as UTCTimestamp, open: 100, high: 105, low: 95, close: 102 })));
const group: PriceLineGroup = { series: 'candles', id: 'example', autoscale: true, lines: [
    { id: 'entry', price: 100, color: '#60a5fa', title: '示例入' },
    { id: 'stop', price: 50, color: '#f87171', title: '示例损' },
    { id: 'take-profit', price: 200, color: '#34d399', title: '示例盈' },
] };
async function report() {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { time: chart.timeScale().getVisibleLogicalRange(), price: chart.priceScale('right').getVisibleRange(),
        auto: chart.priceScale('right').options().autoScale, prices: candle.priceLines().map(line => line.options().price),
        axisLabels: candle.priceLines().map(line => line.options().axisLabelVisible),
        coordinates: candle.priceLines().map(line => candle.priceToCoordinate(line.options().price)), height: candle.getPane().getHeight() };
}
async function set(price = 200, labelPosition: 'axis' | 'left' = 'axis', stop = 50) {
    registry.setPriceLineGroup({ ...group, labelPosition, lines: [group.lines[0]!, { ...group.lines[1]!, price: stop }, { ...group.lines[2]!, price }] });
    return report();
}
async function clear() { registry.clearPriceLineGroup('candles', 'example'); return report(); }
async function manual() { chart.priceScale('right').setVisibleRange({ from: 90, to: 110 }); return report(); }
async function reset() { chart.priceScale('right').applyOptions({ autoScale: true }); return report(); }
declare global { interface Window { priceLinesFixture: { report: typeof report; set: typeof set; clear: typeof clear; manual: typeof manual; reset: typeof reset } } }
window.priceLinesFixture = { report, set, clear, manual, reset };
