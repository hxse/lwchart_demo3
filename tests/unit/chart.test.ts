import { expect, test, spyOn } from 'bun:test';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { applySeriesData } from '../../src/components/lw-chart/logic/SeriesDataUpdater';
import { ChartSyncManager } from '../../src/components/lw-chart/logic/ChartSyncManager';
import { findClosestTime } from '../../src/components/lw-chart/logic/TimeScaleHelper';
import type { LegendManager } from '../../src/components/lw-chart/logic/LegendManager';
import type { SeriesConfig, SeriesDataPatch } from '../../src/utils/chartTypes';
import { chartSeries } from '../../src/crypto/data/chartData';

class FakePane {
    preserved = false;
    stretchFactor = 1;
    series = new Set<FakeSeries>();
    constructor(readonly panes: FakePane[] = []) {}
    paneIndex() { return Math.max(0, this.panes.indexOf(this)); }
    getSeries() { return [...this.series]; }
    preserveEmptyPane() { return this.preserved; }
    setPreserveEmptyPane(value: boolean) { this.preserved = value; }
    setStretchFactor(value: number) { this.stretchFactor = value; }
    getStretchFactor() { return this.stretchFactor; }
    getHTMLElement() { return { querySelectorAll: () => [{ clientWidth: 600, clientHeight: 300, width: 600 }] }; }
}
class FakeSeries {
    rows: any[] = [];
    updates = 0;
    replacements = 0;
    lines: any[] = [];
    pane = new FakePane();
    move?: (index: number) => void;
    constructor(readonly kind: string) {}
    data() { return this.rows; }
    dataByIndex(index: number) { return this.rows[index]; }
    seriesType() { return this.kind; }
    setData(rows: any[]) { this.replacements++; this.rows = [...rows]; }
    update(point: any, historical = false) {
        this.updates++;
        if (historical) {
            const index = this.rows.findIndex(row => row.time === point.time);
            if (index < 0) throw new Error('历史点不存在');
            this.rows[index] = point;
        } else if (this.rows.at(-1)?.time === point.time) this.rows[this.rows.length - 1] = point;
        else this.rows.push(point);
    }
    applyOptions() {}
    moveToPane(index: number) { this.move?.(index); }
    createPriceLine(options: any) { const line={...options}; this.lines.push(line); return line; }
    removePriceLine(line: any) { this.lines=this.lines.filter(item=>item!==line); }
    priceFormatter() { return { format: (value: number) => value.toFixed(2) }; }
    priceScale() { return { applyOptions() {} }; }
    getPane() { return this.pane; }
}
function fixture() {
    const created: FakeSeries[] = [];
    const removed: FakeSeries[] = [];
    let range = { from: 0, to: 9 };
    let primary: FakeSeries | undefined;
    const panes: FakePane[] = [];
    const addPane = (preserved = false) => {
        const pane = new FakePane(panes); pane.preserved = preserved; panes.push(pane); return pane;
    };
    addPane();
    const cleanup = (pane: FakePane) => {
        if (!pane.preserved && !pane.series.size && panes.length > 1) panes.splice(panes.indexOf(pane), 1);
    };
    const spacing = () => 600 / (range.to - range.from + 1);
    const setRight = (to: number) => { range = { from: to - (range.to - range.from), to }; };
    const chart = {
        panes: () => [...panes], addPane,
        removePane(index: number) { panes.splice(index, 1); },
        addSeries(type: { type: string }, _options: unknown, index = 0) {
            const api = new FakeSeries(type.type); created.push(api);
            api.move = (index: number) => {
                const previous = api.pane; previous.series.delete(api);
                api.pane = panes[Math.min(index, panes.length)] ?? addPane(); api.pane.series.add(api);
                if (panes.includes(previous)) cleanup(previous);
            };
            api.move(index); return api;
        },
        removeSeries(api: FakeSeries) { removed.push(api); api.pane.series.delete(api); cleanup(api.pane); },
        timeScale: () => ({
            getVisibleLogicalRange: () => range, setVisibleLogicalRange: (next: typeof range) => { range = next; },
            options: () => ({ rightOffset: 5, barSpacing: spacing() }), width: () => 600,
            scrollPosition: () => range.to - ((primary?.rows.length || 0) - 1),
            scrollToPosition: (offset: number) => setRight((primary?.rows.length || 0) - 1 + offset),
            timeToCoordinate: (time: number) => {
                const index = primary?.rows.findIndex(point => point.time === time) ?? -1;
                return index < 0 ? null : 600 - (range.to - index + 0.5) * spacing() - 1;
            },
        }),
    } as unknown as IChartApi;
    return { chart, created, removed, get range() { return range; }, set range(value) { range = value; }, set primary(value: FakeSeries) { primary = value; } };
}
const point = (index: number, close = 100) => ({ time: (1718000000 + index * 1800) as UTCTimestamp, open: close, high: close + 1, low: close - 1, close });
const config = (name: string, type: 'Candlestick' | 'Line' = 'Candlestick'): SeriesConfig => ({ name, type, pane: 0, data: [], showInLegend: true, options: { color: '#FF9800' } });

test('Pane 首帧没有 DOM 也完成一次权重初始化，后续主题协调保留手动比例', () => {
    const f = fixture(); const registry = new SeriesRegistry(f.chart);
    const configs = [{ ...config('candles'), paneWeight: 5 }, { ...config('rsi', 'Line'), pane: 1, paneWeight: 1 }];
    const dom = spyOn(FakePane.prototype, 'getHTMLElement').mockReturnValue(null as any);
    try {
        registry.apply(configs, 'reconcile', null);
        expect(f.chart.panes().map(pane => pane.getStretchFactor())).toEqual([5, 1]);
    } finally { dom.mockRestore(); }
    f.chart.panes()[0]!.setStretchFactor(6); f.chart.panes()[1]!.setStretchFactor(.5);
    registry.apply(configs.map(item => ({ ...item, options: { color: '#123456' } })), 'reconcile', null);
    expect(f.chart.panes().map(pane => pane.getStretchFactor())).toEqual([6, .5]);
});

test('Pane 预设只在权重或结构变化时统一应用，手动高度及同数量参数修改保持', () => {
    const f = fixture(); const registry = new SeriesRegistry(f.chart);
    const specs = [{type:'rsi',period:14},{type:'macd',fast:12,slow:26,signal:9}] as const;
    const configs = chartSeries([...specs],'dark',.7);
    const dom = spyOn(FakePane.prototype,'getHTMLElement').mockReturnValue(null as any);
    try { registry.apply(configs,'reconcile',null,'preset'); }
    finally { dom.mockRestore(); }
    const weights = () => f.chart.panes().map(pane => pane.getStretchFactor());
    expect(weights()).toEqual([.7,(1-.7)/2,(1-.7)/2]);
    const main = registry.seriesMap.get('candles');
    f.chart.panes().forEach((pane,index) => pane.setStretchFactor([.5,.3,.2][index]!));
    registry.apply(chartSeries([...specs],'light',.7),'reconcile',null,'preset');
    expect(weights()).toEqual([.5,.3,.2]);
    registry.apply(chartSeries([{type:'rsi',period:20},specs[1]],'light',.7),'reconcile',null,'preset');
    expect(weights()).toEqual([.5,.3,.2]);
    registry.apply(chartSeries([specs[1],specs[0]],'dark',.7),'reconcile',null,'preset');
    expect(weights()).toEqual([.5,.3,.2]);
    registry.apply(chartSeries([...specs],'dark',.6),'reconcile',null,'preset');
    expect(weights()).toEqual([.6,(1-.6)/2,(1-.6)/2]);
    f.chart.panes().forEach((pane,index) => pane.setStretchFactor([.5,.3,.2][index]!));
    registry.apply(chartSeries([...specs,{type:'adx',period:14}],'dark',.6),'reconcile',null,'preset');
    expect(weights()).toEqual([.6,(1-.6)/3,(1-.6)/3,(1-.6)/3]);
    registry.apply(chartSeries([specs[0]],'dark',.6),'reconcile',null,'preset');
    expect(weights()).toEqual([.6,1-.6]);
    registry.apply(chartSeries([],'dark',.6),'reconcile',null,'preset');
    expect(weights()).toEqual([1]); expect(registry.seriesMap.get('candles')).toBe(main);
    registry.apply(configs,'reconcile',null,'preset');
    expect(weights()).toEqual([.7,(1-.7)/2,(1-.7)/2]);
    expect(() => registry.apply(configs,'reconcile',null,'wrong' as any)).toThrow('Pane 权重模式');
});

test('旧静态场景同名多 pane 独立创建和清理，切协调模式不残留孤立系列', () => {
    const f = fixture();
    const registry = new SeriesRegistry(f.chart);
    registry.apply([{ ...config('candles'), data: [point(0)] }, { ...config('candles'), pane: 1, data: [point(1)] }], 'replace', null);
    expect(f.created).toHaveLength(2);
    expect(f.created[0]!.data()).toEqual([point(0)]);
    expect(f.created[1]!.data()).toEqual([point(1)]);
    expect(f.removed).toHaveLength(0);
    registry.apply([{ ...config('candles'), pane: 1 }], 'reconcile', null);
    expect(registry.seriesMap.get('candles')).toBe(f.created[1] as unknown as ISeriesApi<any>);
    expect(f.removed).toEqual([f.created[0]!]);
    registry.apply([config('candles')], 'replace', null);
    expect(f.removed).toEqual([f.created[0]!, f.created[1]!]);
});

test('参考线可更新和删除，不重建系列；显示名称与 key 分开', () => {
    const f=fixture(); const registry=new SeriesRegistry(f.chart);
    const metadata: any[]=[];
    const legend={clearSeries(){metadata.length=0;},registerSeries(_api:unknown,value:unknown){metadata.push(value);}} as unknown as LegendManager;
    const series={...config('rsi-key','Line'),displayName:'RSI14',priceLines:[{price:50,color:'#888888'}]};
    registry.apply([series],'reconcile',legend);
    const api=registry.seriesMap.get('rsi-key')!; const fake=f.created[0]!;
    expect(fake.lines).toEqual(series.priceLines); expect(metadata[0].name).toBe('RSI14');
    registry.apply([{...series,displayName:'新标签',priceLines:[{price:50,color:'#123456'}]}],'reconcile',legend);
    expect(registry.seriesMap.get('rsi-key')).toBe(api); expect(fake.lines).toEqual([{price:50,color:'#123456'}]);
    expect(metadata[0].name).toBe('新标签');
    registry.apply([{...series,priceLines:[]}],'reconcile',legend);
    expect(fake.lines).toEqual([]); expect(f.created).toHaveLength(1);
});

test('Histogram 与 time-only 缺口整批预校验，末根缺口移除旧值且保留历史更新能力', () => {
    const f=fixture(); const candle=new FakeSeries('Candlestick'); candle.setData([point(0),point(1)]); f.primary=candle;
    const histogram=new FakeSeries('Histogram'); histogram.setData([{time:point(1).time,value:1,color:'#123456'}]);
    const map=new Map([['candles',candle as unknown as ISeriesApi<any>],['hist',histogram as unknown as ISeriesApi<any>]]);
    expect(()=>applySeriesData(f.chart,map,[{name:'candles',data:[point(1,110)]},
        {name:'hist',data:[{time:point(1).time,value:2,color:123} as any]}],false)).toThrow('颜色');
    expect(candle.updates).toBe(0);
    applySeriesData(f.chart,map,[{name:'hist',data:[{time:point(1).time,customValues:{displayValue:'未定义'}}]}],false);
    expect(histogram.rows).toEqual([{time:point(1).time,customValues:{displayValue:'未定义'}}]);
    applySeriesData(f.chart,map,[{name:'hist',data:[{time:point(1).time,value:0,color:'#888888'},{time:point(2).time,value:-1}]}],false);
    expect(histogram.rows.at(-1).value).toBe(-1);
    expect(()=>applySeriesData(f.chart,map,[{name:'hist',data:[{time:point(2).time,open:10} as any]}],false)).toThrow('缺口');
});

test('协调保留 candle 和已有 EMA，结构增删仅影响目标，静态模式继续重建并清理图例', () => {
    const f = fixture();
    const registry = new SeriesRegistry(f.chart);
    const legends: unknown[] = [];
    const legend = { clearSeries: () => { legends.length = 0; }, registerSeries: (api: unknown) => { legends.push(api); } } as unknown as LegendManager;
    registry.apply([config('candles'), config('ema-14', 'Line')], 'reconcile', legend);
    const candle = registry.seriesMap.get('candles')!;
    candle.setData([point(0)]);
    registry.apply([config('candles'), config('ema-14', 'Line'), config('ema-50', 'Line')], 'reconcile', legend);
    expect(registry.seriesMap.get('candles')).toBe(candle);
    expect(candle.data()).toEqual([point(0)]);
    expect(f.created).toHaveLength(3);
    registry.apply([config('candles')], 'reconcile', legend);
    expect(legends).toEqual([candle]);
    expect(f.removed).toHaveLength(2);
    expect(() => registry.apply([config('x'), config('x')], 'reconcile', legend)).toThrow('唯一');
    expect(registry.seriesMap.get('candles')).toBe(candle);
    registry.apply([config('candles')], 'replace', legend);
    expect(registry.seriesMap.get('candles')).not.toBe(candle);
    expect(f.removed).toHaveLength(3);
});

test('补丁整批先校验，尾根覆盖与追加不重建；空更新无操作、空替换清空', () => {
    const f = fixture();
    const candle = new FakeSeries('Candlestick'); candle.setData([point(0), point(1)]);
    f.primary = candle;
    const ema = new FakeSeries('Line'); ema.setData([{ time: point(1).time, value: 100 }]);
    const map = new Map([['candles', candle as unknown as ISeriesApi<any>], ['ema', ema as unknown as ISeriesApi<any>]]);
    const bad: SeriesDataPatch[] = [{ name: 'candles', data: [point(1, 120)] }, { name: 'ema', data: [{ time: point(1).time, value: NaN }] }];
    const originalRange = { ...f.range };
    expect(() => applySeriesData(f.chart, map, bad, false)).toThrow('折线');
    expect(candle.updates).toBe(0);
    expect(f.range).toEqual(originalRange);
    for (const patches of [
        [{ name: 'missing', data: [] }], [{ name: 'candles', data: [point(-1)] }],
        [{ name: 'candles', data: [point(1), point(1)] }], [{ name: 'candles', data: [{ time: point(1).time, value: 1 }] }],
    ]) expect(() => applySeriesData(f.chart, map, patches as SeriesDataPatch[], false)).toThrow();
    // 真实 EMA 首点有预热偏移，dataByIndex 使用全图索引，不能用自身点数推断末根。
    ema.dataByIndex = index => index === 1 ? ema.rows[0] : undefined;
    expect(() => applySeriesData(f.chart, map, [
        { name: 'candles', data: [point(1, 120)] },
        { name: 'ema', data: [{ time: point(0).time, value: 100 }] },
    ], false)).toThrow('已有时间');
    expect(candle.updates).toBe(0);
    applySeriesData(f.chart, map, [{ name: 'candles', data: [point(1, 120), point(2, 130)] }], false);
    expect(candle.rows).toEqual([point(0), point(1, 120), point(2, 130)]);
    expect(candle.replacements).toBe(1);
    expect(candle.updates).toBe(2);
    applySeriesData(f.chart, map, [{ name: 'candles', data: [point(0, 90), point(1, 115)] }], false);
    expect(candle.rows).toEqual([point(0, 90), point(1, 115), point(2, 130)]);
    expect(candle.replacements).toBe(1);
    applySeriesData(f.chart, map, [{ name: 'ema', data: [] }], false);
    expect(ema.rows).toHaveLength(1);
    applySeriesData(f.chart, map, [{ name: 'ema', data: [] }], true);
    expect(ema.rows).toEqual([]);
});

test('纯折线补丁沿用既有逻辑范围跟随，蜡烛缺失历史锚点时恢复新窗口末尾', () => {
    const lineFixture = fixture();
    const line = new FakeSeries('Line');
    line.setData(Array.from({ length: 10 }, (_, index) => ({ time: point(index).time, value: 100 })));
    lineFixture.primary = line;
    lineFixture.range = { from: 3, to: 10 };
    applySeriesData(lineFixture.chart, new Map([['line', line as unknown as ISeriesApi<any>]]),
        [{ name: 'line', data: [{ time: point(10).time, value: 100 }] }], false);
    expect(lineFixture.range).toEqual({ from: 4, to: 11 });

    const f = fixture();
    const candle = new FakeSeries('Candlestick');
    candle.setData(Array.from({ length: 10 }, (_, index) => point(index)));
    f.primary = candle;
    f.range = { from: 1.25, to: 3.25 };
    applySeriesData(f.chart, new Map([['candles', candle as unknown as ISeriesApi<any>]]),
        [{ name: 'candles', data: [point(20), point(21), point(22)] }], true);
    expect(f.range).toEqual({ from: 5, to: 7 });
});

test('追加和裁剪保持历史时间锚点，跟随最新时保持跨度及末尾偏移', () => {
    const f = fixture();
    const candle = new FakeSeries('Candlestick'); candle.setData(Array.from({ length: 10 }, (_, i) => point(i)));
    f.primary = candle;
    const map = new Map([['candles', candle as unknown as ISeriesApi<any>]]);
    f.range = { from: 3.25, to: 5.25 };
    applySeriesData(f.chart, map, [{ name: 'candles', data: [point(9), point(10)] }], false);
    expect(f.range).toEqual({ from: 3.25, to: 5.25 });
    applySeriesData(f.chart, map, [{ name: 'candles', data: candle.rows.slice(2) }], true);
    expect(f.range).toEqual({ from: 1.25, to: 3.25 });
    f.range = { from: 3, to: 10 };
    applySeriesData(f.chart, map, [{ name: 'candles', data: [point(10), point(11)] }], false);
    expect(f.range).toEqual({ from: 4, to: 11 });
});

test('共享光标使用不晚于目标的时间；缓存广播与回调重入不会递归，注销释放 API', () => {
    const series = new FakeSeries('Candlestick'); series.setData([point(0), point(2), point(4)]);
    const map = new Map([['candles', series as unknown as ISeriesApi<any>]]);
    expect(findClosestTime(map, point(3).time)).toBe(point(2).time);
    expect(findClosestTime(map, point(0).time - 1)).toBeNull();
    const sync = new ChartSyncManager();
    const received: number[] = [];
    sync.register('a', { setCrosshair() { sync.sync('a', { time: point(1).time }); } });
    const unregister = sync.register('b', { setCrosshair(param: any) { received.push(param.time); sync.sync('b', param); } });
    sync.sync('a', { time: point(3).time });
    sync.setReady(true);
    expect(received).toEqual([point(3).time]);
    unregister();
    sync.sync('a', { time: point(4).time });
    expect(received).toHaveLength(1);
    sync.clear();
});

test('EMA 不扩张蜡烛价格范围，价格格式化复用实例并保留小数精度', () => {
    const constructor = spyOn(Intl, 'NumberFormat');
    try {
        const series = chartSeries([{ type: 'ema', period: 1000 }]);
        expect(series[1]!.options.autoscaleInfoProvider()).toBeNull();
        expect(series[0]!.options.autoscaleInfoProvider).toBeUndefined();
        for (let i = 0; i < 20; i++) {
            expect(series[0]!.options.priceFormat.formatter(0.0000123456789)).toBe('0.000012345679');
        }
        expect(constructor).not.toHaveBeenCalled();
    } finally { constructor.mockRestore(); }
});
