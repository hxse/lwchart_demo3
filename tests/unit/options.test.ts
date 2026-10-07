import { describe, expect, test } from 'bun:test';
import { normalizeOptions, parseIndicators, EMA_COLORS, MAX_HISTORY_BARS } from '../../src/crypto/options';
import { parseDashboardQuery, serializeDashboardQuery, changeLayout } from '../../src/crypto/query';
import { validateOhlcv } from '../../src/crypto/data/ohlcv';
import { CryptoClient } from '../../src/crypto/data/client';
import { defaults, candle, result, identity, asFetch } from '../fixtures/data';

describe('URL 与菜单的统一配置', () => {
    test('默认四周期、颜色、编码及完整往返', () => {
        expect(parseDashboardQuery('', defaults)).toEqual(defaults);
        expect(defaults.timeframes).toEqual(['30m', '4h', '1d', '1w']);
        expect(defaults.refresh_seconds).toBe(5);
        expect(defaults.history_bars).toBe(1500);
        expect(EMA_COLORS).toEqual(['#FF9800', '#4CAF50', '#2196F3']);
        const value = parseDashboardQuery('?symbol=ETH%2FUSDT%3AUSDT&indicators=ema%2C5%3Bema%2C14', defaults);
        expect(value.symbol).toBe('ETH/USDT:USDT');
        expect(value.indicators.map(i => i.period)).toEqual([5, 14]);
        expect(parseDashboardQuery(serializeDashboardQuery(value), defaults)).toEqual(value);
    });
    test('布局、独立周期列表、无指标与现货写法', () => {
        expect(parseDashboardQuery('?layout=1x2&indicators=none', defaults)).toMatchObject({ layout: '1x2', timeframes: ['30m', '4h'], indicators: [] });
        expect(parseDashboardQuery('?timeframes=15m,1h,1d', defaults).layout).toBe('1x3');
        expect(parseDashboardQuery('?market=spot&symbol=BTC%2FUSDT&timeframes=1h', defaults)).toMatchObject({ symbol: 'BTC/USDT', layout: '1x1', timeframes: ['1h'] });
        const single = changeLayout(defaults, '1x1', defaults);
        expect(changeLayout(single, '2x2', defaults).timeframes).toEqual(defaults.timeframes);
    });
    test('主题读取配置默认值，URL 覆盖并往返，拒绝非法或缺失主题', () => {
        expect(defaults.theme).toBe('dark');
        const light = normalizeOptions({ ...defaults, theme: 'light' });
        expect(parseDashboardQuery('', light).theme).toBe('light');
        expect(parseDashboardQuery('?theme=dark', light).theme).toBe('dark');
        expect(parseDashboardQuery('?theme=light', defaults)).toEqual(light);
        expect(parseDashboardQuery(serializeDashboardQuery(light), defaults)).toEqual(light);
        for (const theme of [undefined, null, '', 'auto', 'Dark', ['dark'], true]) {
            expect(() => normalizeOptions({ ...defaults, theme })).toThrow('主题必须是 dark 或 light');
        }
        for (const query of ['?theme=auto', '?theme=Dark']) {
            expect(() => parseDashboardQuery(query, defaults)).toThrow('主题必须是 dark 或 light');
        }
        expect(() => parseDashboardQuery('?theme=', defaults)).toThrow('URL 参数不能为空');
        expect(() => parseDashboardQuery('?theme=dark&theme=light', defaults)).toThrow('URL 含有未知或重复参数');
    });
    test('拒绝模糊写法、非法参数与重复值，不泄漏未知值', () => {
        for (const query of ['?layout=2x2&timeframes=30m,4h', '?timeframes=1M', '?indicators=ema14', '?indicators=ema,0',
            '?indicators=ema,5;ema,5', '?symbol=', '?symbol=A&symbol=B', '?is_live=1', '?refresh_seconds=1.5', '?timeframes=1h,']) {
            expect(() => parseDashboardQuery(query, defaults)).toThrow();
        }
        expect(() => parseDashboardQuery('?password=PRIVATE_MARKER', defaults)).toThrow('URL 含有未知或重复参数');
        expect(() => normalizeOptions({ ...defaults, refresh_seconds: '5' })).toThrow('更新间隔');
        expect(() => normalizeOptions({ ...defaults, exchange_name: ['binance'] })).toThrow('交易所');
        expect(() => normalizeOptions({ ...defaults, market: ['future'] })).toThrow('市场');
        expect(parseDashboardQuery('?symbol=ETH%2FUSDT%3AUSDT', defaults).symbol).toBe('ETH/USDT:USDT');
        expect(parseIndicators([])).toEqual([]);
        expect(parseIndicators('ema,1')).toEqual([{ type: 'ema', period: 1 }]);
    });
});

test('OHLCV 六列、时间、OHLC、数量及活跃尾根', () => {
    expect(validateOhlcv(result([candle(0)]), 1500)).toEqual(result([candle(0)]));
    expect(validateOhlcv(result([]), 1500).rows).toEqual([]);
    for (const rows of [[candle(0), candle(0)], [candle(1), candle(0)], [[1, 100, 102, 98, 100, 1]],
        [[1718000000000, 100, 90, 98, 100, 1]], [[1718000000000, 100, 102, 98, 100, -1]], [[1718000000000, 100, NaN, 98, 100, 1]]]) {
        expect(() => validateOhlcv(result(rows as any), 10)).toThrow();
    }
    expect(() => validateOhlcv({ rows: [], last_bar_completion_confirmed: false }, 10)).toThrow('完成状态');
    expect(() => validateOhlcv(result([candle(0), candle(1)]), 1)).toThrow('数量');
});

test('初始每周期请求 1500，周线使用合法 since，增量保留真实毫秒游标', async () => {
    const calls: URL[] = [];
    const client = new CryptoClient(asFetch(async input => {
        calls.push(new URL(String(input), 'http://local'));
        return Response.json(result([candle(0)]));
    }));
    const signal = new AbortController().signal;
    for (const timeframe of defaults.timeframes) await client.history({ ...identity, timeframe }, defaults.history_bars, signal);
    expect(calls.map(u => u.searchParams.get('limit'))).toEqual(['1500', '1500', '1500', '1500']);
    expect(calls[3]!.pathname).toBe('/api/ccxt/fetch_ohlcv/since-limit');
    expect(calls[3]!.searchParams.get('since')).toBe('1000000000000');
    const cursor = candle(0)[0] + 123;
    await client.increment(identity, cursor, 10, signal);
    expect(calls[4]!.searchParams.get('since')).toBe(String(cursor));
    expect(calls[4]!.searchParams.get('limit')).toBe('10');
});

test('历史数量在 URL／配置统一限制 1..10000，编码往返，拒绝超限、重复和非整数', () => {
    for (const amount of [1, 500, 1500, MAX_HISTORY_BARS]) {
        const parsed = parseDashboardQuery(`?history_bars=${amount}`, defaults);
        expect(parsed.history_bars).toBe(amount);
        expect(parseDashboardQuery(serializeDashboardQuery(parsed), defaults)).toEqual(parsed);
    }
    for (const raw of ['0', '-1', '10001', '1.5', 'NaN', '', '1&history_bars=2']) {
        expect(() => parseDashboardQuery(`?history_bars=${raw}`, defaults)).toThrow();
    }
    for (const amount of [0, 10001, 1.5, '1500']) {
        expect(() => normalizeOptions({ ...defaults, history_bars: amount })).toThrow('历史 K 线数量');
    }
});
