import { expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeOptions, normalizeSettings, activeOptions, DEFAULT_MAIN_PANE_RATIO } from '../../src/crypto/options';
import { parseDashboardQuery, serializeDashboardQuery, changeLayout } from '../../src/crypto/query';
import { chartSeries } from '../../src/crypto/data/chartData';
import { selectWatch } from '../../src/crypto/watchlist';
import { loadCryptoConfig } from '../../scripts/crypto/config';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import { IndicatorStream } from '../../src/indicators/IndicatorStream';
import { parseIndicatorList } from '../../src/indicators/parameters';
import { defaults, runtime, candle, result } from '../fixtures/data';

test('主图占比缺省为 0.7，十进制和指数往返，来源／布局／自选保持公共值', () => {
    expect(DEFAULT_MAIN_PANE_RATIO).toBe(.7);
    expect(normalizeOptions({...defaults,main_pane_ratio:undefined}).main_pane_ratio).toBe(.7);
    expect(parseDashboardQuery('',{defaults:{...runtime.defaults,main_pane_ratio:.6}}).main_pane_ratio).toBe(.6);
    for (const raw of ['0.7','.7','7e-1','0.25','0.9999','1e-20']) {
        const settings = parseDashboardQuery(`?main_pane_ratio=${raw}`,runtime);
        expect(settings.main_pane_ratio).toBe(Number(raw));
        const query = serializeDashboardQuery(settings);
        expect(new URLSearchParams(query).size).toBe(15);
        expect(new URLSearchParams(query).get('main_pane_ratio')).toBe(String(Number(raw)));
        expect(parseDashboardQuery(query,runtime)).toEqual(settings);
        expect(activeOptions({...settings,source:'tq'}).main_pane_ratio).toBe(settings.main_pane_ratio);
        expect(changeLayout(settings,'1x1',runtime.defaults).main_pane_ratio).toBe(settings.main_pane_ratio);
        expect(selectWatch(settings,{provider:'tq',symbol:'KQ.m@SHFE.rb'}).main_pane_ratio).toBe(settings.main_pane_ratio);
    }
});

test('主图占比非法类型和边界、非十进制、空值、重复键在共享配置边界拒绝', () => {
    for (const main_pane_ratio of [0,1,-.1,1.1,NaN,Infinity,-Infinity,null,true,'0.7',[],{}]) {
        expect(() => normalizeSettings({...runtime.defaults,main_pane_ratio})).toThrow('主图占比');
    }
    for (const raw of ['0','1','-0.1','1.1','NaN','Infinity','0x1','0b01','0.7foo','%200.7','0.7%20','1e-324','7e999']) {
        expect(() => parseDashboardQuery(`?main_pane_ratio=${raw}`,runtime)).toThrow('主图占比');
    }
    expect(() => parseDashboardQuery('?main_pane_ratio=',runtime)).toThrow('URL 参数不能为空');
    expect(() => parseDashboardQuery('?main_pane_ratio=0.7&main_pane_ratio=0.6',runtime)).toThrow('未知或重复参数');
});

test('元数据按实际 Pane 均分，叠加与复合角色不多占副图，唯一主图占满', () => {
    for (const list of ['none','ema,14;bbands,20,2']) {
        const series = chartSeries(parseIndicatorList(list),'dark',.7);
        expect(series.every(item => item.pane===0 && item.paneWeight===1)).toBe(true);
    }
    const series = chartSeries(parseIndicatorList('ema,14;bbands,20,2;rsi,14;macd,12,26,9'),'dark',.7);
    expect([...new Set(series.map(item => item.pane))]).toEqual([0,1,2]);
    expect(series.filter(item => item.pane===0).every(item => item.paneWeight===.7)).toBe(true);
    expect(series.filter(item => item.pane>0).every(item => Object.is(item.paneWeight,(1-.7)/2))).toBe(true);
    expect(series.filter(item => item.pane===2)).toHaveLength(3);
    const single = chartSeries(parseIndicatorList('macd,12,26,9'),'dark',.6);
    expect(single.slice(1).every(item => item.paneWeight===1-.6)).toBe(true);
    expect(() => chartSeries([], 'dark', NaN)).toThrow('主图占比');
});

test('TOML 默认及 local／remote 覆盖使用同一主图占比校验，私有旧配置可缺省', async () => {
    const directory = await mkdtemp(join(tmpdir(),'lwchart-ratio-'));
    const path = join(directory,'config.toml');
    const example = (await Bun.file('config.example.toml').text()).replace('username = ""','username = "offline"').replace('password = ""','password = "offline-password"');
    try {
        await Bun.write(path,example);
        expect((await loadCryptoConfig(path,'dev')).runtime.defaults.main_pane_ratio).toBe(.7);
        await Bun.write(path,example.replace('main_pane_ratio = 0.7',''));
        expect((await loadCryptoConfig(path,'dev')).runtime.defaults.main_pane_ratio).toBe(.7);
        await Bun.write(join(directory,'config.local.toml'),'[server]\nhost="0.0.0.0"\n[dashboard]\nmain_pane_ratio=0.6\n');
        await Bun.write(join(directory,'config.remote.toml'),'[server]\nhost="0.0.0.0"\n[dashboard]\nmain_pane_ratio=0.8\n');
        expect((await loadCryptoConfig(path,'local')).runtime.defaults.main_pane_ratio).toBe(.6);
        expect((await loadCryptoConfig(path,'remote')).runtime.defaults.main_pane_ratio).toBe(.8);
        expect((await loadCryptoConfig(path,'dev')).runtime.defaults.main_pane_ratio).toBe(.7);
        for (const value of ['0','1','"0.7"','nan']) {
            await Bun.write(path,example.replace('main_pane_ratio = 0.7',`main_pane_ratio = ${value}`));
            await expect(loadCryptoConfig(path,'dev')).rejects.toThrow('主图占比');
        }
    } finally { await rm(directory,{recursive:true,force:true}); }
});

test('只改主图占比保留行情流和指标状态，不重新请求或增量计算', async () => {
    let requests = 0;
    const hub = new MarketHub({async latest() { requests++; return result(Array.from({length:20},(_,i) => candle(i))); }});
    try {
        const streams = hub.configure(defaults); await Promise.all(streams.map(stream => stream.poll()));
        const add = spyOn(IndicatorStream.prototype,'add'); const replace = spyOn(IndicatorStream.prototype,'replace');
        try {
            const before = streams.map(stream => stream.store.snapshot());
            const updated = hub.configure({...defaults,main_pane_ratio:.6});
            expect(updated).toEqual(streams); expect(requests).toBe(4);
            updated.forEach((stream,index) => expect(stream.store.snapshot()).toEqual(before[index]));
            expect(add).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
        } finally { add.mockRestore(); replace.mockRestore(); }
    } finally { hub.dispose(); }
});
