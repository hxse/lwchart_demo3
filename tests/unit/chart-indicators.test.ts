import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeSettings, normalizeRuntime, activeOptions } from '../../src/crypto/options';
import { parseDashboardQuery, serializeDashboardQuery, changeLayout } from '../../src/crypto/query';
import { chartIndicators, chartIndicatorDrafts, resizeChartIndicatorDrafts, parseChartIndicatorDrafts } from '../../src/crypto/chartIndicators';
import { parseIndicatorList, indicatorListString } from '../../src/indicators/parameters';
import { selectWatch } from '../../src/crypto/watchlist';
import { loadCryptoConfig } from '../../scripts/crypto/config';
import { runtime } from '../fixtures/data';

test('窗口覆盖的继承、独立、none、编码和编号顺序往返，基础 query 仍为十五项', () => {
    expect(parseDashboardQuery('',runtime).chart_indicators).toEqual({});
    expect(normalizeRuntime({defaults:{...runtime.defaults,chart_indicators:undefined}}).defaults.chart_indicators).toEqual({});
    const settings = parseDashboardQuery('?timeframes=30m,4h,1d,1w&indicators=ema,14;ema,50&chart.4.indicators=none&chart.1.indicators=ema,14;rsi,14&chart.2.indicators=macd,12,26,9',runtime);
    expect(settings.chart_indicators).toEqual({'1':parseIndicatorList('ema,14;rsi,14'),'2':parseIndicatorList('macd,12,26,9'),'4':[]});
    expect(chartIndicators(activeOptions(settings),2)).toEqual(settings.indicators);
    expect(chartIndicators(activeOptions(settings),3)).toEqual([]);
    const query = serializeDashboardQuery(settings); const params = new URLSearchParams(query);
    expect(params.size).toBe(18);
    expect([...params.keys()].slice(-3)).toEqual(['chart.1.indicators','chart.2.indicators','chart.4.indicators']);
    expect(query).toContain('chart.1.indicators=ema%2C14%3Brsi%2C14');
    expect(parseDashboardQuery(query,runtime)).toEqual(settings);
});

test('同值独立覆盖保持明确身份，公共变化只改变继承窗口', () => {
    const settings = parseDashboardQuery('?indicators=ema,14&chart.1.indicators=ema,14',runtime);
    const query = serializeDashboardQuery(settings);
    expect(new URLSearchParams(query).get('chart.1.indicators')).toBe('ema,14');
    const changed = normalizeSettings({...settings,indicators:['rsi,14']});
    expect(indicatorListString(chartIndicators(activeOptions(changed),0))).toBe('ema,14');
    expect(indicatorListString(chartIndicators(activeOptions(changed),1))).toBe('rsi,14');
    expect(parseDashboardQuery(serializeDashboardQuery(changed),runtime)).toEqual(changed);
});

test('窗口配置跟随位置，布局缩减删除越界覆盖，新增继承，来源和自选保留', () => {
    const settings = parseDashboardQuery('?chart.1.indicators=rsi,14&chart.4.indicators=none',runtime);
    const periodic = normalizeSettings({...settings,timeframes:['4h','30m','1d','1w']});
    expect(periodic.chart_indicators).toEqual(settings.chart_indicators);
    const small = changeLayout(settings,'1x1',runtime.defaults);
    expect(small.chart_indicators).toEqual({'1':parseIndicatorList('rsi,14')});
    expect(changeLayout(small,'2x2',runtime.defaults).chart_indicators).toEqual(small.chart_indicators);
    expect(activeOptions({...settings,source:'tq'}).chart_indicators).toEqual(settings.chart_indicators);
    expect(selectWatch(settings,{provider:'tq',symbol:'KQ.m@SHFE.rb'}).chart_indicators).toEqual(settings.chart_indicators);
    expect(parseDashboardQuery(serializeDashboardQuery(settings),runtime)).toEqual(settings);
});

test('非法窗口键、边界、重复、空值和单窗口十二项在正确配置阶段拒绝', () => {
    for (const key of ['chart.0.indicators','chart.01.indicators','chart.-1.indicators','chart.1.foo','chart_indicators']) {
        expect(() => parseDashboardQuery(`?${key}=none`,runtime)).toThrow('未知或重复参数');
    }
    for (const query of ['?chart.5.indicators=none','?layout=1x1&chart.2.indicators=none','?timeframes=30m&chart.2.indicators=none']) {
        expect(() => parseDashboardQuery(query,runtime)).toThrow('窗口指标编号');
    }
    expect(() => parseDashboardQuery('?chart.1.indicators=&indicators=none',runtime)).toThrow('URL 参数不能为空');
    expect(() => parseDashboardQuery('?chart.1.indicators=none&chart.1.indicators=rsi,14',runtime)).toThrow('未知或重复参数');
    expect(() => parseDashboardQuery('?chart.1.indicators=ema,0',runtime)).toThrow('窗口 1 指标：EMA 周期');
    expect(() => parseDashboardQuery('?chart.2.indicators=ema,14;ema,14',runtime)).toThrow('窗口 2 指标：相同指标');
    const thirteen = Array.from({length:13},(_,i) => `ema,${i+1}`).join(';');
    expect(() => parseDashboardQuery(`?chart.1.indicators=${thirteen}`,runtime)).toThrow('窗口 1 指标：指标必须是至多 12');
    for (const chart_indicators of [null,[],true,'none']) expect(() => normalizeSettings({...runtime.defaults,chart_indicators})).toThrow('窗口指标覆盖必须是对象');
    expect(() => normalizeSettings({...runtime.defaults,chart_indicators:{'1':undefined}})).toThrow('窗口 1 指标');
});

test('窗口草稿统一提交，继承忽略未使用文本，缩减移除错误草稿，新增继承', () => {
    const settings = parseDashboardQuery('?chart.2.indicators=rsi,14&chart.4.indicators=none',runtime);
    const drafts = chartIndicatorDrafts(settings);
    expect(drafts.map(draft => draft.mode)).toEqual(['inherit','custom','inherit','none']);
    expect(drafts[1]!.value).toBe('rsi,14');
    drafts[0]!.value='bad'; drafts[1]!.value='ema,0';
    expect(() => parseChartIndicatorDrafts(drafts)).toThrow('窗口 2 指标');
    drafts[1]!.mode='inherit';
    expect(parseChartIndicatorDrafts(drafts)).toEqual({'4':[]});
    const small = resizeChartIndicatorDrafts(drafts,1,'ema,14');
    const grown = resizeChartIndicatorDrafts(small,4,'ema,14');
    expect(grown.map(draft => draft.mode)).toEqual(['inherit','inherit','inherit','inherit']);
    expect(grown.slice(1).every(draft => draft.value==='ema,14' && !draft.customized)).toBe(true);
});

test('启动配置仍只提供公共指标，逐窗口覆盖不增加 TOML 字段', async () => {
    const directory = await mkdtemp(join(tmpdir(),'lwchart-window-config-')); const path = join(directory,'config.toml');
    const example = (await Bun.file('config.example.toml').text()).replace('username = ""','username = "offline"').replace('password = ""','password = "offline-password"');
    try {
        await Bun.write(path,example);
        expect((await loadCryptoConfig(path,'dev')).runtime.defaults.chart_indicators).toEqual({});
        await Bun.write(path,example.replace('[dashboard]','[dashboard]\nchart_indicators = {"1"=["rsi,14"]}'));
        await expect(loadCryptoConfig(path,'dev')).rejects.toThrow('dashboard 含有未知字段');
    } finally { await rm(directory,{recursive:true,force:true}); }
});
