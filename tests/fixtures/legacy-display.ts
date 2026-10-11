import { zipSync, strToU8 } from 'fflate';
import { legacyRows } from './legacy';
import type { ChartConfigJSON } from '../../src/pages/ChartDashboard/chartDashboard.types';

/** 预计算列故意采用远离蜡烛的独立轴，以及真实 CSV NaN 缺口。 */
export function legacyDisplayZip() {
    const config: ChartConfigJSON = {
        template: 'single', showBottomRow: false, viewMode: 'chart', selectedInternalFileName: 'candles.json', showLegendInAll: true,
        chart: [[[
            { type: 'candle', show: true, showInLegend: true, fileName: 'candles.json', dataName: ['open', 'high', 'low', 'close'],
                candleOpt: { upColor: '#16a085', downColor: '#e7505a' } },
            { type: 'line', show: true, showInLegend: true, fileName: 'ema.json', dataName: 'ema', lineOpt: { priceScaleId: 'left', color: '#00ff00' },
                indicator: { id: 'ema-left', spec: { type: 'ema', period: 14 }, output: 'value' } },
        ], [
            { type: 'line', show: true, showInLegend: true, fileName: 'cci.csv', dataName: 'cci', lineOpt: { color: '#ff00ff' },
                indicator: { id: 'cci-gap', spec: { type: 'cci', period: 2 }, output: 'value' } },
        ]]],
    };
    const values = legacyRows.map((_row, index) => index < 196 ? 95 : [90, 100, 'NaN', 120][index - 196]);
    return zipSync({
        'chartConfig.json': strToU8(JSON.stringify(config)),
        'candles.json': strToU8(JSON.stringify(legacyRows)),
        'ema.json': strToU8(JSON.stringify(legacyRows.map((row, index) => ({ time: row.time, ema: 5000 + index })))),
        'cci.csv': strToU8(['time,cci', ...legacyRows.map((row, index) => `${row.time},${values[index]}`)].join('\n')),
    });
}
