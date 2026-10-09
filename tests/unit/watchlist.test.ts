import { expect, test } from 'bun:test';
import { parseWatchlist, serializeWatchlist, shortWatchLabel, adjacentWatch, selectWatch, currentWatchIndex, moveWatch, assertUrlLength, MAX_URL_LENGTH } from '../../src/crypto/watchlist';
import { activeOptions } from '../../src/crypto/options';
import { runtime } from '../fixtures/data';

test('单一混合列表、大小写、尾分号、字段编码及空列表往返', () => {
    const entries = parseWatchlist('#Binance,BTC/USDT:USDT;TQ,KQ.m@SHFE.rb;kraken,ETH/USD;');
    expect(entries).toEqual({ flat: false, entries: [
        { provider: 'binance', symbol: 'BTC/USDT:USDT' }, { provider: 'tq', symbol: 'KQ.m@SHFE.rb' }, { provider: 'kraken', symbol: 'ETH/USD' },
    ] });
    expect(parseWatchlist(serializeWatchlist(entries))).toEqual(entries);
    const special = { flat: false, entries: [{ provider: 'tq' as const, symbol: 'A,B;C%# 中文' }] };
    expect(parseWatchlist(serializeWatchlist(special))).toEqual(special);
    expect(parseWatchlist('')).toEqual({ entries: [], flat: false }); expect(parseWatchlist('#')).toEqual({ entries: [], flat: false });
    expect(serializeWatchlist({ entries: [], flat: false })).toBe('');
    expect(parseWatchlist('#tq,A;tq,A').entries).toHaveLength(2);
});

test('来源、分隔、坏编码和非法品种按具体语义拒绝', () => {
    for (const value of ['#binance', '#binance,', '#,A', '#tq,A;;tq,B', '#;']) {
        expect(() => parseWatchlist(value)).toThrow('自选格式');
    }
    expect(() => parseWatchlist('#unknown,A')).toThrow('自选来源');
    expect(() => parseWatchlist('#tq,%')).toThrow('自选 URL 编码无效');
    expect(() => parseWatchlist('#tq,%00')).toThrow('品种格式无效');
    expect(() => parseWatchlist('#tq,' + 'A'.repeat(129))).toThrow('品种格式无效');
});

test('点击只修改目标身份，跨来源保留全部其它设置与非活动身份', () => {
    const initial = { ...runtime.defaults, history_bars: 1500, ccxt: { ...runtime.defaults.ccxt, market: 'spot' as const, is_live: false } };
    const tq = selectWatch(initial, { provider: 'tq', symbol: 'SHFE.rb2701' });
    expect(tq).toEqual({ ...initial, source: 'tq', tq: { symbol: 'SHFE.rb2701' } });
    expect(activeOptions(tq)).not.toHaveProperty('exchange_name');
    expect(activeOptions(tq).history_bars).toBe(1500);
    const ccxt = selectWatch(tq, { provider: 'kraken', symbol: 'ETH/USD' });
    expect(ccxt).toEqual({ ...tq, source: 'ccxt', ccxt: { ...initial.ccxt, exchange_name: 'kraken', symbol: 'ETH/USD' } });
    expect(activeOptions(ccxt)).toMatchObject({ market: 'spot', is_live: false, history_bars: 1500 });
    expect(initial.tq.symbol).toBe('KQ.m@SHFE.rb');
});

test('混合列表匹配、循环、当前不在列表及排序不改变原数组', () => {
    const entries = parseWatchlist('#binance,BTC/USDT:USDT;tq,SHFE.rb2701;kraken,ETH/USD').entries;
    expect(currentWatchIndex(entries, runtime.defaults)).toBe(0);
    expect(adjacentWatch(entries, runtime.defaults, -1)).toEqual(entries[2]);
    expect(adjacentWatch(entries, runtime.defaults, 1)).toEqual(entries[1]);
    const missing = { ...runtime.defaults, ccxt: { ...runtime.defaults.ccxt, symbol: 'MISSING' } };
    expect(adjacentWatch(entries, missing, 1)).toEqual(entries[0]);
    expect(adjacentWatch(entries, missing, -1)).toEqual(entries[2]);
    expect(adjacentWatch([], missing, 1)).toBeUndefined();
    expect(moveWatch(entries, 0, 2)).toEqual([entries[1], entries[2], entries[0]]);
    expect(moveWatch(entries, 2, 0)).toEqual([entries[2], entries[0], entries[1]]);
    expect(entries[0]?.provider).toBe('binance');
});

test('平铺布尔值缺省、显式关闭、开启、空列表及位置往返，拒绝非法与重复值', () => {
    const old = parseWatchlist('#binance,BTC/USDT:USDT;tq,KQ.m@SHFE.rb');
    expect(old.flat).toBe(false);
    expect(parseWatchlist('#flat=false;tq,KQ.m@SHFE.rb')).toEqual({ flat: false, entries: [{ provider: 'tq', symbol: 'KQ.m@SHFE.rb' }] });
    const flat = parseWatchlist('#binance,BTC/USDT:USDT;flat=true;tq,KQ.m@SHFE.rb;');
    expect(flat).toEqual({ ...old, flat: true });
    expect(serializeWatchlist(flat)).toStartWith('#flat=true;binance,');
    expect(parseWatchlist(serializeWatchlist(flat))).toEqual(flat);
    expect(parseWatchlist('#flat=true')).toEqual({ entries: [], flat: true });
    expect(serializeWatchlist({ entries: [], flat: true })).toBe('#flat=true');
    for (const raw of ['1', 'yes', '', 'TRUE', 'false,false']) expect(() => parseWatchlist(`#flat=${raw}`)).toThrow('平铺参数必须是 true 或 false');
    expect(() => parseWatchlist('#flat=true;flat=false')).toThrow('平铺参数不能重复');
    expect(() => serializeWatchlist({ entries: [], flat: 'true' as any })).toThrow('平铺参数必须是 boolean');
});

test('平铺短名称按来源提取，缺分隔、空片段与其它来源保留完整名称', () => {
    for (const [provider, symbol, label] of [
        ['binance', 'BTC/USDT:USDT', 'BTC'], ['kraken', 'ETH/USD', 'ETH'],
        ['tq', 'KQ.m@SHFE.rb', 'rb'], ['tq', 'SHFE.rb2701', 'rb2701'],
        ['tq', 'NO_SEPARATOR', 'NO_SEPARATOR'], ['tq', 'SHFE.', 'SHFE.'],
        ['binance', '/USDT', '/USDT'], ['other', 'FULL/SYMBOL.NAME', 'FULL/SYMBOL.NAME'],
    ]) expect(shortWatchLabel({ provider: provider!, symbol: symbol! })).toBe(label!);
});

test('完整编码 URL 的 8192 边界，包含主机、query 与 hash', () => {
    const prefix = 'http://127.0.0.1:5174/?history_bars=1500#tq,';
    const exact = prefix + 'A'.repeat(MAX_URL_LENGTH - prefix.length);
    expect(() => assertUrlLength(exact)).not.toThrow();
    expect(() => assertUrlLength(exact + 'A')).toThrow('URL 长度为 8193 字符，超过 8192');
    const unicode = prefix + '中'.repeat(1000);
    expect(new URL(unicode).href.length).toBeGreaterThan(MAX_URL_LENGTH);
    expect(() => assertUrlLength(unicode)).toThrow('请缩短自选列表');
});
