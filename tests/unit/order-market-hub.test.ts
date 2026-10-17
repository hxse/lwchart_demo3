import { expect, test } from 'bun:test';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import { parseIndicator } from '../../src/indicators/parameters';
import { directResults } from '../fixtures/indicator-reference';
import { candle, defaults, identity, result } from '../fixtures/data';

test('下单 ATR 与图表共用流和原生算法，移除面板只释放自身指标', async () => {
    const history = Array.from({ length: 40 }, (_, i) => candle(i));
    let requests = 0;
    const hub = new MarketHub({ async latest() { requests++; return result(history); } });
    try {
        const chart = hub.configure({ ...defaults, layout: '1x1', timeframes: ['30m'], indicators: [parseIndicator('ema,14')] })[0]!;
        await chart.poll();
        const original = chart.store.indicators.get('ema,14');
        const panel = hub.setOrderDemand({ identity, historyBars: 1000, atrPeriod: 14, refreshSeconds: 9 })!;
        expect(panel).toBe(chart);
        expect(panel.refreshIntervalSeconds).toBe(defaults.refresh_seconds);
        expect(requests).toBe(1);
        expect(chart.store.indicators.get('ema,14')!.outputs.get('value')).toBe(original!.outputs.get('value'));
        const actual = panel.store.indicators.get('atr,14')!.outputs.get('value')!;
        const expected = directResults(parseIndicator('atr,14'), history.map(([time,, high, low, close]) => ({ time, high, low, close }))).get('value')!;
        expect(actual).toEqual(expected);
        hub.setOrderDemand(null);
        expect(chart.store.indicators.has('atr,14')).toBe(false);
        expect(chart.store.indicators.get('ema,14')!.outputs.get('value')).toBe(original!.outputs.get('value'));
        expect(requests).toBe(1);
    } finally { hub.dispose(); }
});

test('图表导航保留面板需求，最后一个使用者释放时停止独占流', async () => {
    let requests = 0;
    const hub = new MarketHub({ async latest() { requests++; return result(Array.from({ length: 20 }, (_, i) => candle(i))); } });
    const demand = { identity, historyBars: 1000, atrPeriod: 14, refreshSeconds: 9 };
    try {
        const panel = hub.setOrderDemand(demand)!;
        await panel.poll();
        const same = hub.configure({ ...defaults, layout: '1x1', timeframes: ['30m'], indicators: [parseIndicator('atr,14')] })[0]!;
        expect(same).toBe(panel);
        expect(panel.refreshIntervalSeconds).toBe(defaults.refresh_seconds);
        hub.configure({ ...defaults, symbol: 'ETH/USDT:USDT', layout: '1x1', timeframes: ['30m'] });
        expect(hub.setOrderDemand(demand)).toBe(panel);
        expect(panel.refreshIntervalSeconds).toBe(9);
        hub.configure(null);
        expect(hub.setOrderDemand(demand)).toBe(panel);
        expect(panel.store.indicators.has('atr,14')).toBe(true);
        hub.setOrderDemand(null);
        const previous = requests;
        await panel.poll();
        expect(requests).toBe(previous);
    } finally { hub.dispose(); }
});

test('四十八个图表指标加面板 ATR，原生并集允许四十九项且用户列表上限不变', async () => {
    const hub = new MarketHub({ async latest() { return result(Array.from({ length: 40 }, (_, i) => candle(i))); } });
    try {
        const overrides = Object.fromEntries(['sma', 'ema', 'dema', 'tema'].map((type, index) => [String(index + 1),
            Array.from({ length: 12 }, (_, i) => parseIndicator(`${type},${i + 1}`))]));
        const chart = hub.configure({ ...defaults, timeframes: ['30m', '30m', '30m', '30m'], chart_indicators: overrides })[0]!;
        await chart.poll();
        const panel = hub.setOrderDemand({ identity, historyBars: 1000, atrPeriod: 14, refreshSeconds: 5 })!;
        expect(panel).toBe(chart);
        expect(chart.store.indicators.size).toBe(49);
        expect(chart.status.phase).toBe('ready');
        hub.setOrderDemand(null);
        expect(chart.store.indicators.size).toBe(48);
        expect(() => hub.setOrderDemand({ identity, historyBars: 10, atrPeriod: 14, refreshSeconds: 5 })).toThrow('下单 ATR 历史容量');
        expect(chart.store.indicators.size).toBe(48);
    } finally { hub.dispose(); }
});
