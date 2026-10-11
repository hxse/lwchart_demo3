import type { UTCTimestamp } from 'lightweight-charts';
import type { SeriesConfig, SeriesDataPatch } from '../../utils/chartTypes';
import type { IndicatorSpec } from '../options';
import { indicatorSeries } from '../../indicators/presentation';
import { marketSeriesKey, indicatorKey } from '../../indicators/parameters';
import type { DataChange } from './CandleStore';

const formatter = new Intl.NumberFormat('en', { maximumSignificantDigits: 8 });
const priceFormat = { type: 'custom', minMove: 1e-8, formatter: (value: number) => formatter.format(value) };
export function chartSeries(indicators: IndicatorSpec[]): SeriesConfig[] {
    return [{ name: 'candles', type: 'Candlestick', pane: 0, data: [], showInLegend: true,
        options: { upColor: '#16a085', downColor: '#e7505a', wickUpColor: '#16a085', wickDownColor: '#e7505a', borderVisible: false, priceFormat } },
        ...indicators.flatMap((indicator, index) => indicatorSeries(indicator, index, 'dark', 0))];
}
export function chartPatches(change: DataChange, indicators: IndicatorSpec[]): SeriesDataPatch[] {
    return [{ name: 'candles', data: change.rows.map(([time, open, high, low, close, volume]) => ({ time: time / 1000 as UTCTimestamp, open, high, low, close, customValues: { volume } })) },
        ...indicators.map((indicator): SeriesDataPatch => ({ name: marketSeriesKey(indicator, 'value'),
            data: (change.indicators.get(indicatorKey(indicator))?.outputs.get('value') ?? []).filter(point => point.state === 'value')
                .map(point => ({ time: point.time / 1000 as UTCTimestamp, value: point.value! })),
        }))];
}
