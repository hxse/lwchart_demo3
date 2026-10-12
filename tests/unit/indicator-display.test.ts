import { expect, test } from 'bun:test';
import { chartSeries, chartPatches } from '../../src/crypto/data/chartData';
import { parseIndicator, parseIndicatorList } from '../../src/indicators/parameters';
import { legacyGroups } from '../../src/indicators/legacy';
import { histogramColors } from '../../src/indicators/histogram';
import { referenceLines } from '../../src/indicators/presentation';
import { buildLegacyPane } from '../../src/pages/ChartDashboard/logic/LegacyPaneBuilder';
import { applyOverridesToConfig } from '../../src/pages/ChartDashboard/state/OverrideManager';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { parseDashboardQuery, serializeDashboardQuery } from '../../src/crypto/query';
import type { SeriesItemConfig, ChartConfigJSON } from '../../src/pages/ChartDashboard/chartDashboard.types';
import type { ParsedFileContent } from '../../src/utils/zipParser';
import { runtime, candle } from '../fixtures/data';

const files: ParsedFileContent[] = [{ filename:'a.json',type:'json',preview:'',data:[
    {time:1718000000,rsi:40,hist:1},{time:1718001800,rsi:60,hist:2},{time:1718003600,rsi:65,hist:-1},
] }, { filename:'b.json',type:'json',preview:'',data:[{time:1718000000,hist:-2}] }];
const macd = parseIndicator('macd,12,26,9');
const tagged = (id: string, output: 'histogram' | 'signal' | 'macd' = 'histogram', fileName = 'a.json'): SeriesItemConfig => ({
    type:output==='histogram'?'histogram':'line',show:true,showInLegend:true,fileName,dataName:'hist',
    indicator:{id,spec:macd,output},
});
const rsi = (id = 'rsi-main'): SeriesItemConfig => ({type:'line',show:true,fileName:'a.json',dataName:'rsi',
    indicator:{id,spec:parseIndicator('rsi,14'),output:'value'}});
const line = (value: number, show = true, referenceFor?: string): SeriesItemConfig => ({
    type:'hline',show,referenceFor,hLineOpt:{value,color:'#888888',label:String(value),showLabel:true},
});
function render(items: SeriesItemConfig[]) { return buildLegacyPane(items,0,0,files,legacyGroups([items],'chart slot 0')); }

test('自动参考线仅显示价格轴数值，legacy 显式标签和当前值标签保留', () => {
    const specs = parseIndicatorList('rsi,14;cci,20;macd,12,26,9;adx,14;er,10');
    for (const theme of ['dark', 'light'] as const) for (const spec of specs) {
        const lines = referenceLines(spec, theme);
        expect(lines.length).toBeGreaterThan(0);
        expect(lines.every(line => line.title === '' && line.axisLabelVisible)).toBe(true);
    }
    const explicit = line(50, true, 'rsi-main'); explicit.hLineOpt!.label = '中线';
    const lines = render([rsi(), explicit])[0]!.priceLines!;
    expect(lines.map(line => line.price)).toEqual([30, 70, 50]);
    expect(lines.map(line => line.title)).toEqual(['', '', '中线']);
    expect(lines.every(line => line.axisLabelVisible)).toBe(true);
    expect(chartSeries([parseIndicator('rsi,14')])[1]!.options.lastValueVisible).not.toBe(false);
});

test('元数据产生主图、独立副图、多输出、格式和唯一键', () => {
    const specs = parseIndicatorList('ema,14;bbands,20,2;rsi,14;macd,12,26,9');
    const series = chartSeries(specs);
    expect(series).toHaveLength(9);
    expect(series.map(s=>s.pane)).toEqual([0,0,0,0,0,1,2,2,2]);
    expect(new Set(series.map(s=>s.name)).size).toBe(series.length);
    expect(series[1]!.options.autoscaleInfoProvider()).toBeNull();
    expect(series[2]!.options.autoscaleInfoProvider).toBeUndefined();
    expect(series[5]!.priceLines!.map(l=>l.price)).toEqual([30,50,70]);
    expect(series[5]!.options.autoscaleInfoProvider(()=>null)).toEqual({priceRange:{minValue:30,maxValue:70}});
    expect(series[8]!.type).toBe('Histogram');
    expect(series[0]!.paneWeight).toBeGreaterThan(series[5]!.paneWeight!);
    expect(chartSeries(parseIndicatorList('er,10'))[1]!.valueFormatter!(.5)).toBe('50%');
});

test('同参文件组按 id 区分且可只显示部分角色，不重算导入数据', () => {
    const series = render([tagged('macd-a'),tagged('macd-b','histogram','b.json')]);
    expect(series.map(s=>s.name)).toEqual(['legacy/macd-a/histogram','legacy/macd-b/histogram']);
    expect(series[0]!.data[0].value).toBe(1); expect(series[1]!.data[0].value).toBe(-2);
    expect(series.every(s=>s.priceLines!.map(l=>l.price).includes(0))).toBe(true);
    const many = Array.from({length:20},(_,i)=>tagged(`group-${i}`));
    expect(legacyGroups([many],'chart slot 0').size).toBe(20);
    const adx: SeriesItemConfig = { ...rsi('adx-file'),indicator:{id:'adx-file',spec:parseIndicator('adx,14'),output:'value'} };
    expect(render([adx])[0]!.priceLines!.map(l=>l.price)).toEqual([25]);
});

test('分组校验与构建纯读取，冻结配置及响应式派生不发生写回', () => {
    const item=tagged('immutable'); Object.freeze(item.indicator!.spec); Object.freeze(item.indicator); Object.freeze(item);
    const items=[item]; Object.freeze(items);
    const groups=legacyGroups([items],'chart slot 0');
    expect(groups.get('immutable')!.spec).toEqual(macd);
    expect(buildLegacyPane(items,0,0,files,groups)[0]!.name).toBe('legacy/immutable/histogram');
});

test('旧索引隐藏显式参考线后不会补回默认线；部分覆盖、共存及组关联确定', () => {
    const items = [rsi(),line(30),line(50),line(70)];
    const config: ChartConfigJSON = {template:'single',viewMode:'chart',showBottomRow:false,selectedInternalFileName:'a.json',chart:[[items]]};
    applyOverridesToConfig(config,{show:['0,0,2,0']});
    expect(render(items)[0]!.priceLines!.map(l=>l.price)).toEqual([30,70]);
    expect(render([rsi(),line(50,false)])[0]!.priceLines!.map(l=>l.price)).toEqual([30,70]);
    expect(render([rsi(),line(55)])[0]!.priceLines!.map(l=>l.price)).toEqual([30,50,70,55]);
    const two = render([rsi('a'),rsi('b'),line(50,false,'a')]);
    expect(two[0]!.priceLines!.map(l=>l.price)).toEqual([30,70]);
    expect(two[1]!.priceLines!.map(l=>l.price)).toEqual([30,50,70]);
});

test('固定柱色移除自动点颜色；字段覆盖保留，移除固定色恢复主题策略', () => {
    const item = tagged('macd-main'); item.histogramOpt={color:'#123456'};
    const fixed = render([item])[0]!;
    expect(fixed.options.color).toBe('#123456'); expect(fixed.data.every(point=>point.color===undefined)).toBe(true);
    delete item.histogramOpt;
    const automatic = render([item])[0]!;
    expect(automatic.data.map(point=>point.color)).toEqual(['#00897b','#00897b','#e53935']);
    const explicit = rsi(); explicit.lineOpt={color:'#135790',lineWidth:3,scaleMargins:{top:.1,bottom:.2}};
    const result=render([explicit])[0]!;
    expect(result.options).toMatchObject({color:'#135790',lineWidth:3,scaleMargins:{top:.1,bottom:.2}});
    expect(result.pane).toBe(0); expect(result.showInLegend).toBe(false);
});

test('注记错误在正确位置失败，不猜列名或静默处理', () => {
    expect(()=>legacyGroups([[{...tagged('a'),indicator:{id:'a',spec:macd,output:'signal'}}]],'chart slot 0')).toThrow('pane 0 item 0');
    expect(()=>legacyGroups([[tagged('a'),tagged('a')]],'chart slot 0')).toThrow('角色不能重复');
    expect(()=>legacyGroups([[tagged('a')],[tagged('a','signal')]],'chart slot 0')).toThrow('Pane 必须一致');
    expect(()=>legacyGroups([[rsi(),line(50,true,'missing')]],'chart slot 0')).toThrow('referenceFor');
    expect(()=>legacyGroups([[{...rsi(),referenceFor:'rsi-main'}]],'chart slot 0')).toThrow('referenceFor');
});

test('完整设置与 URL 往返包含 ADX，非法周期拒绝，hash 保持独立', () => {
    const settings=parseDashboardQuery('?indicators=ema,14;rsi,14;macd,12,26,9;adx,14;bbands,20,2',runtime);
    expect(parseDashboardQuery(serializeDashboardQuery(settings),runtime)).toEqual(settings);
    expect(new URLSearchParams(serializeDashboardQuery(settings)).size).toBe(15);
    expect(()=>parseDashboardQuery('?indicators=adx,1',runtime)).toThrow('周期');
});

test('裁剪保留前一个原始输出，柱色与完整序列裁剪后严格相同；缺口不补零', () => {
    const specs=parseIndicatorList('macd,2,4,2');
    const rows=Array.from({length:14},(_,i)=>candle(i,100+Math.sin(i)*10));
    const full=new CandleStore(30); full.setIndicators(specs); full.initialize(rows);
    const clipped=new CandleStore(3); clipped.setIndicators(specs); clipped.initialize(rows);
    const all=chartPatches(full.snapshot(),specs).at(-1)!.data;
    const cropped=chartPatches(clipped.snapshot(),specs).at(-1)!.data;
    expect(cropped).toEqual(all.slice(-3));
    const custom=histogramColors([{time:1,value:2},{time:2,value:1}],'dark');
    expect(custom.map(p=>p.color)).toEqual(['#26a69a','#b2dfdb']);
    const cci=new CandleStore(3); cci.setIndicators(parseIndicatorList('cci,2')); cci.initialize([candle(0,100),candle(1,100)]);
    // 默认 candle 的 high/low 对称，常量典型价也是 100。
    const points=chartPatches(cci.snapshot(),parseIndicatorList('cci,2'))[1]!.data;
    expect(points.at(-1)).toEqual({time:candle(1)[0]/1000,customValues:{displayValue:'未定义'}} as any);
});
