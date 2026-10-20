import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { tqChartSymbol, isTqContinuousSymbol } from '../../src/crypto/chartTqSeries';
import { activeOptions, normalizeSettings, normalizeRuntime } from '../../src/crypto/options';
import { parseDashboardQuery, serializeDashboardQuery, changeLayout } from '../../src/crypto/query';
import { selectWatch } from '../../src/crypto/watchlist';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import type { MarketIdentity } from '../../src/crypto/data/client';
import type { CandleBatch } from '../../src/crypto/data/ohlcv';
import { loadCryptoConfig } from '../../scripts/crypto/config';
import { runtime, candle, result, deferred } from '../fixtures/data';

const main = 'KQ.m@SHFE.rb', index = 'KQ.i@SHFE.rb';
const settings = (query = '') => parseDashboardQuery('?source=tq&refresh_seconds=3600' + query, runtime);

test('仅转换开头连续合约前缀，跟随和同值保持，具体合约及其他文本不被改写', () => {
    expect(tqChartSymbol(main, 'index')).toBe(index); expect(tqChartSymbol(index, 'main')).toBe(main);
    expect(tqChartSymbol(main, 'main')).toBe(main); expect(tqChartSymbol(index, 'index')).toBe(index);
    for (const original of [main, index, 'KQ.m@DCE.i']) expect(tqChartSymbol(original)).toBe(original);
    expect(tqChartSymbol('KQ.m@DCE.i', 'index')).toBe('KQ.i@DCE.i');
    for (const original of ['SHFE.rb2701', 'DCE.i2701', 'prefix.KQ.m@SHFE.rb', 'kq.m@SHFE.rb', 'KQ.M@SHFE.rb', 'm@SHFE.rb', 'KQ.x@SHFE.rb']) {
        expect(isTqContinuousSymbol(original)).toBe(false);
        expect(tqChartSymbol(original, 'main')).toBe(original); expect(tqChartSymbol(original, 'index')).toBe(original);
    }
    expect(isTqContinuousSymbol(main)).toBe(true); expect(isTqContinuousSymbol(index)).toBe(true);
});

test('旧默认全部跟随，URL 只保存显式选择，按编号序列化并保留与原品种相同的选择', () => {
    expect(settings().chart_tq_series).toEqual({});
    expect(normalizeRuntime({ defaults: { ...runtime.defaults, chart_tq_series: undefined } }).defaults.chart_tq_series).toEqual({});
    expect(new URLSearchParams(serializeDashboardQuery(settings())).size).toBe(18);
    const value = settings('&chart.4.tq_series=index&chart.1.tq_series=main&chart.2.indicators=none');
    expect(value.chart_tq_series).toEqual({ '1': 'main', '4': 'index' });
    const query = serializeDashboardQuery(value), params = new URLSearchParams(query);
    expect([...params.keys()].slice(-3)).toEqual(['chart.2.indicators', 'chart.1.tq_series', 'chart.4.tq_series']);
    expect(params.size).toBe(21); expect(params.get('tq.symbol')).toBe(main);
    expect(parseDashboardQuery(query, runtime)).toEqual(value);
    const original = Object.freeze({ '1': 'main' as const });
    const normalized = normalizeSettings({ ...value, chart_tq_series: original });
    normalized.chart_tq_series['1'] = 'index'; expect(original['1']).toBe('main');
});

test('窗口键、越界、空值、重复和非法模式在归一边界报错，不静默当作跟随', () => {
    for (const key of ['chart.0.tq_series', 'chart.01.tq_series', 'chart.-1.tq_series', 'tq.chart.1.series', 'chart_tq_series']) {
        expect(() => settings(`&${key}=main`)).toThrow('未知或重复参数');
    }
    for (const suffix of ['&chart.5.tq_series=main', '&timeframes=30m&chart.2.tq_series=index']) {
        expect(() => settings(suffix)).toThrow('窗口 TQ 品种形式编号');
    }
    expect(() => settings('&chart.1.tq_series=')).toThrow('URL 参数不能为空');
    expect(() => settings('&chart.1.tq_series=index&chart.1.tq_series=main')).toThrow('未知或重复参数');
    for (const value of ['inherit', 'weighted', 'MAIN', 'true', '0']) expect(() => settings(`&chart.1.tq_series=${value}`)).toThrow('窗口 1 TQ 品种形式');
    for (const value of [null, [], true, 'main']) expect(() => normalizeSettings({ ...runtime.defaults, chart_tq_series: value })).toThrow('必须是对象');
    for (const value of [null, undefined, 1, false, {}, 'inherit']) expect(() => normalizeSettings({ ...runtime.defaults, chart_tq_series: { '1': value } })).toThrow('窗口 1 TQ 品种形式');
});

test('设置随窗口位置，布局裁剪及新增跟随，来源／自选／具体合约切换保留选择', () => {
    const value = settings('&chart.1.tq_series=index&chart.4.tq_series=main');
    expect(normalizeSettings({ ...value, timeframes: ['4h', '30m', '1d', '1w'] }).chart_tq_series).toEqual(value.chart_tq_series);
    const reduced = changeLayout(value, '1x1', runtime.defaults);
    expect(reduced.chart_tq_series).toEqual({ '1': 'index' });
    expect(changeLayout(reduced, '2x2', runtime.defaults).chart_tq_series).toEqual({ '1': 'index' });
    for (const selected of [selectWatch(value, { provider: 'tq', symbol: 'SHFE.rb2701' }), selectWatch(value, { provider: 'binance', symbol: 'ETH/USDT:USDT' })]) {
        expect(selected.chart_tq_series).toEqual(value.chart_tq_series);
        expect(parseDashboardQuery(serializeDashboardQuery(selected), runtime)).toEqual(selected);
    }
});

test('同周期主连与加权分流，同实际品种继续共享；切换需求复用现有数据和未变指标', async () => {
    const calls: MarketIdentity[] = [];
    const hub = new MarketHub({ async latest(identity) {
        calls.push(identity);
        return result(Array.from({ length: 6 }, (_, i) => candle(i, (identity.symbol === main ? 100 : 200) + i)));
    } });
    const value = settings('&timeframes=30m,30m,30m,30m&indicators=ema,2&chart.2.indicators=sma,2&chart.4.indicators=none&chart.2.tq_series=index&chart.4.tq_series=index');
    try {
        const streams = hub.configure(activeOptions(value)); await Promise.all(streams.map(stream => stream.poll()));
        expect(calls.map(c => c.symbol)).toEqual([main, index]); expect(streams[0]).toBe(streams[2]); expect(streams[1]).toBe(streams[3]);
        expect(streams[0]!.store.rows.at(-1)![4]).toBe(105); expect(streams[1]!.store.rows.at(-1)![4]).toBe(205);
        expect([...streams[0]!.store.indicators.keys()]).toEqual(['ema,2']); expect([...streams[1]!.store.indicators.keys()]).toEqual(['sma,2']);
        const ema = streams[0]!.store.indicators.get('ema,2')!.outputs.get('value');
        const next = hub.configure(activeOptions({ ...value, chart_tq_series: { '4': 'index' } }));
        expect(next[0]).toBe(streams[0]); expect(next[1]).toBe(streams[0]); expect(next[3]).toBe(streams[3]);
        expect(next[0]!.store.indicators.get('ema,2')!.outputs.get('value')).toBe(ema); expect(calls).toHaveLength(2);
        const merged = hub.configure(activeOptions({ ...value, chart_tq_series: {} }));
        expect(merged.every(stream => stream === streams[0])).toBe(true);
        await streams[1]!.poll(); expect(calls).toHaveLength(2);
    } finally { hub.dispose(); }
});

test('具体合约和 CCXT 忽略形式选择，不额外请求、重建流或改写实际品种', async () => {
    for (const source of ['tq', 'ccxt'] as const) {
        let calls = 0;
        const hub = new MarketHub({ async latest() { calls++; return result([candle(0), candle(1)]); } });
        const value = normalizeSettings({ ...settings('&timeframes=30m,30m'), source, tq: { symbol: 'SHFE.rb2701' } });
        try {
            const streams = hub.configure(activeOptions(value)); await Promise.all(streams.map(stream => stream.poll()));
            const next = hub.configure(activeOptions({ ...value, chart_tq_series: { '1': 'index', '2': 'main' } }));
            expect(next).toEqual(streams); expect(calls).toBe(1);
            expect(next[0]!.identity.symbol).toBe(source === 'tq' ? 'SHFE.rb2701' : runtime.defaults.ccxt.symbol);
        } finally { hub.dispose(); }
    }
});

test('最后一个窗口离开旧形式时取消旧请求，迟到行情不能覆盖新身份', async () => {
    const calls: Array<{ identity: MarketIdentity; signal: AbortSignal; done: ReturnType<typeof deferred<CandleBatch>> }> = [];
    const hub = new MarketHub({ latest(identity, _limit, signal) { const done = deferred<CandleBatch>(); calls.push({ identity, signal, done }); return done.promise; } });
    try {
        const value = settings('&timeframes=30m');
        const old = hub.configure(activeOptions(value))[0]!, before = old.poll();
        const next = hub.configure(activeOptions({ ...value, chart_tq_series: { '1': 'index' } }))[0]!;
        expect(calls).toHaveLength(2); expect(calls[0]!.signal.aborted).toBe(true);
        expect(calls[1]!.identity.symbol).toBe(index);
        calls[1]!.done.resolve(result([candle(0, 200)])); await next.poll();
        calls[0]!.done.resolve(result([candle(0, 100)])); await before;
        expect(next.store.rows[0]![4]).toBe(200); expect(old.store.rows).toHaveLength(0);
    } finally { hub.dispose(); }
});

test('启动配置默认全部跟随，不接受逐窗口形式作为 TOML 字段', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-tq-series-')), path = join(directory, 'config.toml');
    const example = (await Bun.file('config.example.toml').text()).replace('username = ""', 'username = "offline"').replace('password = ""', 'password = "offline-password"');
    try {
        await Bun.write(path, example); expect((await loadCryptoConfig(path, 'dev')).runtime.defaults.chart_tq_series).toEqual({});
        for (const section of ['dashboard', 'tq']) {
            await Bun.write(path, example.replace(`[${section}]`, `[${section}]\nchart_tq_series = {"1"="index"}`));
            await expect(loadCryptoConfig(path, 'dev')).rejects.toThrow('未知字段');
        }
    } finally { await rm(directory, { recursive: true, force: true }); }
});
