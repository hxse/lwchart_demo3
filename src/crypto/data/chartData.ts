import type { UTCTimestamp } from 'lightweight-charts';
import type { SeriesConfig, SeriesDataPatch } from '../../utils/chartTypes';
import { DEFAULT_MAIN_PANE_RATIO, validateMainPaneRatio, type IndicatorSpec, type Theme } from '../options';
import { indicatorSeries, indicatorPriceFormat, indicatorStateLabels, includeReferenceRange } from '../../indicators/presentation';
import { indicatorDefinition } from '../../indicators/definitions';
import { marketSeriesKey, indicatorKey } from '../../indicators/parameters';
import { histogramColors, type IndicatorPlotPoint } from '../../indicators/histogram';
import type { IndicatorResults } from '../../indicators/types';
import type { DataChange } from './CandleStore';

const priceFormat = indicatorPriceFormat('price');
export function chartSeries(indicators: IndicatorSpec[], theme: Theme = 'dark', mainPaneRatio = DEFAULT_MAIN_PANE_RATIO): SeriesConfig[] {
    const ratio = validateMainPaneRatio(mainPaneRatio);
    let nextPane = 1;
    const series: SeriesConfig[] = [{ name: 'candles', type: 'Candlestick', pane: 0, data: [], showInLegend: true,
        options: { upColor: '#16a085', downColor: '#e7505a', wickUpColor: '#16a085', wickDownColor: '#e7505a', borderVisible: false, priceFormat } },
        ...indicators.flatMap((indicator, index) => indicatorSeries(indicator, index, theme,
            indicatorDefinition(indicator.type).display.placement === 'main' ? 0 : nextPane++))];
    const subPanes = nextPane - 1;
    series.forEach(item => {
        item.paneWeight = subPanes ? (item.pane === 0 ? ratio : (1-ratio)/subPanes) : 1;
        includeReferenceRange(item);
    });
    return series;
}
export function chartPatches(change: DataChange, indicators: IndicatorSpec[], theme: Theme = 'dark',
    committed = change.indicators): SeriesDataPatch[] {
    return [{ name: 'candles', data: change.rows.map(([time, open, high, low, close, volume]) => ({ time: time / 1000 as UTCTimestamp, open, high, low, close, customValues: { volume } })) },
        ...indicators.flatMap(indicator => indicatorDefinition(indicator.type).outputs.map(role => {
            const key = indicatorKey(indicator);
            const points = change.indicators.get(key)?.outputs.get(role.key) ?? [];
            const full: IndicatorResults | undefined = committed.get(key);
            const values = full?.outputs.get(role.key) ?? [];
            const index = values.findIndex(point => point.time === points[0]?.time);
            const prior = index > 0 ? values[index - 1] : full?.previous?.get(role.key);
            let data: IndicatorPlotPoint[] = points.map(point => point.state === 'value'
                ? { time: point.time / 1000 as UTCTimestamp, value: point.value! }
                : { time: point.time / 1000 as UTCTimestamp, customValues: { displayValue: indicatorStateLabels[point.state] } });
            if (role.primitive === 'Histogram') data = histogramColors(data, theme, undefined, prior?.state === 'value' ? prior.value : 0);
            return { name: marketSeriesKey(indicator, role.key), data };
        }))];
}
