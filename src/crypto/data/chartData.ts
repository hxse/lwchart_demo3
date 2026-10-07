import type { UTCTimestamp } from 'lightweight-charts';
import type { SeriesConfig, SeriesDataPatch } from '../../utils/chartTypes';
import { EMA_COLORS, type IndicatorSpec } from '../options';
import type { DataChange } from './CandleStore';

const formatter = new Intl.NumberFormat('en', { maximumSignificantDigits: 8 });
const priceFormat = { type: 'custom', minMove: 1e-8, formatter: (value: number) => formatter.format(value) };
export function chartSeries(indicators: IndicatorSpec[]): SeriesConfig[] {
    return [{ name: 'candles', type: 'Candlestick', pane: 0, data: [], showInLegend: true,
        options: { upColor: '#16a085', downColor: '#e7505a', wickUpColor: '#16a085', wickDownColor: '#e7505a', borderVisible: false, priceFormat } },
        ...indicators.map((indicator, index): SeriesConfig => ({
            name: `ema-${indicator.period}`, type: 'Line', pane: 0, data: [], showInLegend: true,
            // 主价格轴由可见蜡烛决定，长期 EMA 超出范围时允许在边缘裁剪。
            options: { color: EMA_COLORS[index % EMA_COLORS.length], lineWidth: 1, priceFormat, priceLineVisible: false, autoscaleInfoProvider: () => null },
        }))];
}
export function chartPatches(change: DataChange, indicators: IndicatorSpec[]): SeriesDataPatch[] {
    return [{ name: 'candles', data: change.rows.map(([time, open, high, low, close]) => ({ time: time / 1000 as UTCTimestamp, open, high, low, close })) },
        ...indicators.map((indicator): SeriesDataPatch => ({ name: `ema-${indicator.period}`,
            data: (change.emas.get(indicator.period) || []).map(point => ({ time: point.time / 1000 as UTCTimestamp, value: point.value })),
        }))];
}
