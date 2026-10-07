import { zipSync, strToU8 } from 'fflate';
import type { ChartConfigJSON } from '../../src/pages/ChartDashboard/chartDashboard.types';

export const legacyRows = Array.from({ length: 200 }, (_, i) => ({
    time: 1718000000000 + i * 1800000,
    open: 100 + Math.sin(i / 9) * 5, high: 107 + Math.sin(i / 9) * 5,
    low: 96 + Math.sin(i / 9) * 5, close: 103 + Math.sin(i / 9) * 5,
}));
export const backtestRows = [
    { time: legacyRows[160]!.time, first_entry_side: 1, entry_long_price: 103, exit_long_price: 106, entry_short_price: null, exit_short_price: null, sl_pct_price_long: 98, tp_pct_price_long: 110 },
    { time: legacyRows[170]!.time, first_entry_side: -1, entry_long_price: null, exit_long_price: null, entry_short_price: 105, exit_short_price: 102, sl_pct_price_long: null, tp_pct_price_long: null },
];
export const legacyConfig: ChartConfigJSON = {
    template: 'horizontal-1x1', showBottomRow: false, viewMode: 'chart', selectedInternalFileName: 'candles.json', showLegendInAll: true,
    chart: [0, 1].map(() => [[{
        type: 'candle', fileName: 'candles.json', dataName: ['open', 'high', 'low', 'close'], show: true, showInLegend: true,
    }]]),
};
export async function legacyZip() {
    const keys = Object.keys(backtestRows[0]!);
    const csv = [keys.join(','), ...backtestRows.map(row => keys.map(k => row[k as keyof typeof row] ?? '').join(','))].join('\n');
    return zipSync({
        'chartConfig.json': strToU8(JSON.stringify(legacyConfig)),
        'candles.json': strToU8(JSON.stringify(legacyRows)),
        'backtest_result.csv': strToU8(csv),
        'samples/alltypes_plain.parquet': new Uint8Array(await Bun.file(new URL('./alltypes_plain.parquet', import.meta.url)).arrayBuffer()),
    });
}
