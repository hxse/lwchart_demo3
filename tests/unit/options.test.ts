import { describe, expect, test } from 'bun:test';
import { normalizeOptions, normalizeSettings, normalizeRuntime, activeOptions, parseIndicators, EMA_COLORS, MAX_HISTORY_BARS, UPDATE_BARS } from '../../src/crypto/options';
import { parseDashboardQuery, serializeDashboardQuery, changeLayout } from '../../src/crypto/query';
import { validateBatch } from '../../src/crypto/data/ohlcv';
import { MarketClient } from '../../src/crypto/data/client';
import { defaults, runtime, candle, result, identity, asFetch } from '../fixtures/data';

describe('URL 与菜单的统一配置', () => {
    test('默认四周期、颜色、来源、双身份编码及完整往返', () => {
        expect(parseDashboardQuery('', runtime)).toEqual(runtime.defaults);
        expect(activeOptions(runtime.defaults)).toEqual(defaults);
        expect(defaults.timeframes).toEqual(['30m', '4h', '1d', '1w']);
        expect([defaults.refresh_seconds, defaults.history_bars, UPDATE_BARS]).toEqual([5, 1000, 5]);
        expect(defaults.timezone).toBe('local');
        expect(EMA_COLORS).toEqual(['#FF9800', '#4CAF50', '#2196F3']);
        const value = parseDashboardQuery('?ccxt.symbol=ETH%2FUSDT%3AUSDT&tq.symbol=SHFE.rb2701&indicators=ema%2C5%3Bema%2C14', runtime);
        expect(value.ccxt.symbol).toBe('ETH/USDT:USDT');
        expect(value.tq.symbol).toBe('SHFE.rb2701');
        expect(value.indicators.map(i => i.period)).toEqual([5, 14]);
        expect(parseDashboardQuery(serializeDashboardQuery(value), runtime)).toEqual(value);
        expect(new URLSearchParams(serializeDashboardQuery(value)).size).toBe(14);
        expect(runtime.defaults.ccxt.symbol).toBe('BTC/USDT:USDT');
    });
    test('布局、独立周期、无指标；切来源保留内部与公共参数', () => {
        expect(parseDashboardQuery('?layout=1x2&indicators=none', runtime)).toMatchObject({ layout: '1x2', timeframes: ['30m', '4h'], indicators: [] });
        expect(parseDashboardQuery('?timeframes=15m,1h,1d', runtime).layout).toBe('1x3');
        const value = parseDashboardQuery('?ccxt.market=spot&ccxt.is_live=false&ccxt.symbol=BTC%2FUSDT&timeframes=1h&history_bars=1500', runtime);
        expect(value.ccxt).toMatchObject({ market: 'spot', is_live: false, symbol: 'BTC/USDT' });
        const single = changeLayout(runtime.defaults, '1x1', runtime.defaults);
        expect(changeLayout(single, '2x2', runtime.defaults).timeframes).toEqual(defaults.timeframes);
        const tq = normalizeSettings({ ...value, source: 'tq' });
        expect(activeOptions(tq)).toMatchObject({ source: 'tq', symbol: 'KQ.m@SHFE.rb', history_bars: 1500 });
        expect(activeOptions(tq)).not.toHaveProperty('is_live');
        expect(tq.ccxt).toEqual(value.ccxt);
        expect(activeOptions({ ...tq, source: 'ccxt' })).toMatchObject({ market: 'spot', is_live: false, symbol: 'BTC/USDT', history_bars: 1500 });
        expect(parseDashboardQuery(serializeDashboardQuery(tq), runtime)).toEqual(tq);
        expect(parseDashboardQuery('?source=ccxt', { defaults: tq })).toEqual(value);
    });
    test('主题与时区读取默认值；旧 runtime 与裸身份字段明确退出', () => {
        const light = normalizeSettings({ ...runtime.defaults, theme: 'light', timezone: 'Asia/Shanghai' });
        expect(parseDashboardQuery('', { defaults: light })).toEqual(light);
        expect(parseDashboardQuery('?theme=dark&timezone=UTC', { defaults: light })).toMatchObject({ theme: 'dark', timezone: 'UTC' });
        expect(parseDashboardQuery(serializeDashboardQuery(light), runtime)).toEqual(light);
        expect(() => normalizeOptions({ ...defaults, theme: 'auto' })).toThrow('主题必须');
        expect(() => normalizeSettings({ ...runtime.defaults, timezone: 'Invalid/Zone' })).toThrow('显示时区');
        expect(() => normalizeRuntime({ defaults, sources: {} })).toThrow('未知字段');
        expect(() => normalizeOptions({ ...defaults, incremental_bars: 5 })).toThrow('未知字段');
        for (const query of ['?symbol=ETH', '?market=spot', '?exchange_name=binance', '?is_live=true']) {
            expect(() => parseDashboardQuery(query, runtime)).toThrow('未知或重复参数');
        }
        expect(() => parseDashboardQuery('?source=unknown', runtime)).toThrow('数据源必须');
        expect(() => parseDashboardQuery('?source=tq&ccxt.market=invalid', runtime)).toThrow('市场必须');
    });
    test('拒绝模糊写法、非法参数与重复值，不泄漏未知值', () => {
        for (const query of ['?layout=2x2&timeframes=30m,4h', '?timeframes=1M', '?indicators=ema14', '?indicators=ema,0',
            '?indicators=ema,5;ema,5', '?ccxt.symbol=', '?tq.symbol=A&tq.symbol=B', '?ccxt.is_live=1', '?refresh_seconds=1.5', '?timeframes=1h,',
            '?timezone=', '?timezone=Invalid/Zone', '?source=tq&source=ccxt', '?theme=dark&theme=light']) {
            expect(() => parseDashboardQuery(query, runtime)).toThrow();
        }
        expect(() => parseDashboardQuery('?password=PRIVATE_MARKER', runtime)).toThrow('URL 含有未知或重复参数');
        expect(() => normalizeOptions({ ...defaults, refresh_seconds: '5' })).toThrow('更新间隔');
        expect(() => normalizeOptions({ ...defaults, exchange_name: ['binance'] })).toThrow('交易所');
        expect(parseIndicators([])).toEqual([]);
        expect(parseIndicators('ema,1')).toEqual([{ type: 'ema', period: 1 }]);
    });
});

test('归一行情六列、时间、OHLC、数量与早期 TQ 历史，坏数据不默默删除', () => {
    expect(validateBatch(result([candle(0)]), 1500)).toEqual(result([candle(0)]));
    expect(validateBatch(result([]), 1500).rows).toEqual([]);
    expect(validateBatch(result([[Date.UTC(1995, 0, 1), 100, 102, 98, 101, 0]]), 1).rows).toHaveLength(1);
    for (const rows of [[candle(0), candle(0)], [candle(1), candle(0)], [[0, 100, 102, 98, 100, 1]],
        [[1718000000000, 100, 90, 98, 100, 1]], [[1718000000000, 100, 102, 98, 100, -1]], [[1718000000000, 100, NaN, 98, 100, 1]]]) {
        expect(() => validateBatch(result(rows as any), 10)).toThrow();
    }
    expect(() => validateBatch({ rows: [], last_bar_completion_confirmed: null }, 1)).toThrow('未知字段');
    expect(() => validateBatch(result([candle(0), candle(1)]), 1)).toThrow('数量');
});

test('CCXT 所有周期只请求 latest-limit 数量，TQ 映射秒数且不传 CCXT 字段', async () => {
    const calls: URL[] = [];
    const client = new MarketClient(asFetch(async input => {
        calls.push(new URL(String(input), 'http://local'));
        return Response.json(result([candle(0)]));
    }));
    const signal = new AbortController().signal;
    for (const timeframe of defaults.timeframes) await client.latest({ ...identity, timeframe }, 1500, signal);
    for (const timeframe of defaults.timeframes) await client.latest({ ...identity, timeframe }, 5, signal);
    expect(calls.every(url => url.pathname === '/api/ccxt/fetch_ohlcv/latest-limit' && !url.searchParams.has('since'))).toBe(true);
    expect(calls.map(url => url.searchParams.get('limit'))).toEqual(['1500','1500','1500','1500','5','5','5','5']);
    calls.length = 0;
    for (const timeframe of defaults.timeframes) await client.latest({ source: 'tq', symbol: 'KQ.m@SHFE.rb', timeframe }, 5, signal);
    expect(calls.map(url => url.searchParams.get('duration_seconds'))).toEqual(['1800', '14400', '86400', '604800']);
    expect(calls.every(url => url.pathname === '/api/tq/fetch_ohlcv' && url.searchParams.size === 4 && url.searchParams.get('data_length') === '5')).toBe(true);
});

test('数量统一限制 1..10000，编码往返，拒绝超限、重复和非整数', () => {
    for (const amount of [1, 5, 500, 1000, 1500, MAX_HISTORY_BARS]) {
        const parsed = parseDashboardQuery(`?history_bars=${amount}`, runtime);
        expect(parsed.history_bars).toBe(amount);
        expect(parseDashboardQuery(serializeDashboardQuery(parsed), runtime)).toEqual(parsed);
    }
    for (const raw of ['0', '-1', '10001', '1.5', 'NaN', '', '1&history_bars=2']) {
        expect(() => parseDashboardQuery(`?history_bars=${raw}`, runtime)).toThrow();
    }
});

test('按钮栏四向位置及缺省右侧，往返保留其它设置，非法值明确拒绝', () => {
    expect(parseDashboardQuery('', runtime).dock_position).toBe('right');
    expect(normalizeOptions({ ...defaults, dock_position: undefined }).dock_position).toBe('right');
    for (const dock_position of ['top', 'bottom', 'left', 'right'] as const) {
        const value = parseDashboardQuery(`?dock_position=${dock_position}&history_bars=1500`, runtime);
        expect(value.dock_position).toBe(dock_position);
        expect(value.ccxt).toEqual(runtime.defaults.ccxt); expect(value.tq).toEqual(runtime.defaults.tq);
        expect(value.history_bars).toBe(1500);
        expect(parseDashboardQuery(serializeDashboardQuery(value), runtime)).toEqual(value);
    }
    for (const value of ['center', 'RIGHT', '1']) expect(() => parseDashboardQuery(`?dock_position=${value}`, runtime)).toThrow('按钮栏位置必须');
    expect(() => parseDashboardQuery('?dock_position=', runtime)).toThrow('URL 参数不能为空');
    expect(() => parseDashboardQuery('?dock_position=top&dock_position=left', runtime)).toThrow('未知或重复参数');
});
