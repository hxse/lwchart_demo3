import { expect, test, spyOn } from 'bun:test';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import { MarketStream } from '../../src/crypto/data/MarketStream';
import { CandleStore } from '../../src/crypto/data/CandleStore';
import { IndicatorStream } from '../../src/indicators/IndicatorStream';
import { indicatorKey, parseIndicator, parseIndicatorList } from '../../src/indicators/parameters';
import { normalizeOptions, MAX_COMPUTED_INDICATORS, type CcxtOptions } from '../../src/crypto/options';
import { chartIndicators } from '../../src/crypto/chartIndicators';
import { chartSeries, chartPatches } from '../../src/crypto/data/chartData';
import { directResults } from '../fixtures/indicator-reference';
import { defaults, candle, result } from '../fixtures/data';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';

const shared = (values: Record<string,unknown> = {}) => normalizeOptions({...defaults,timeframes:['30m','30m','30m','30m'],...values}) as CcxtOptions;
const input = (row:OhlcvRow) => ({time:row[0],high:row[2],low:row[3],close:row[4]});

test('同周期窗口只配置和取数一次，去重并集保留全部需求，每个图表只读取自己的子集', async () => {
    let requests=0;
    const source = {async latest() { requests++; return result(Array.from({length:40},(_,i) => candle(i))); }};
    const hub=new MarketHub(source); const configure=spyOn(MarketStream.prototype,'configure');
    const options=shared({indicators:['ema,3'],chart_indicators:{'1':['ema,3','rsi,3'],'2':['macd,2,4,2'],'4':[]}});
    try {
        const streams=hub.configure(options); await Promise.all(streams.map(stream => stream.poll()));
        expect(configure).toHaveBeenCalledTimes(1); expect(requests).toBe(1);
        expect(streams.every(stream => stream===streams[0])).toBe(true);
        expect([...streams[0]!.store.indicators.keys()]).toEqual(['ema,3','macd,2,4,2','rsi,3']);
        options.timeframes.forEach((_,index) => {
            const own=chartIndicators(options,index);
            expect(chartSeries(own).map(series => series.displayName??series.name)).toHaveLength(1+own.reduce((count,spec) => count+(spec.type==='macd'?3:1),0));
            const patches=chartPatches(streams[0]!.store.snapshot(),own);
            expect(patches.every(patch => patch.name==='candles' || own.some(spec => patch.name.startsWith(`market/${indicatorKey(spec)}/`)))).toBe(true);
            if (index===3) expect(patches.map(patch => patch.name)).toEqual(['candles']);
        });
    } finally { configure.mockRestore(); hub.dispose(); }
});

test('并集同值或重排不重算，新增只播种新增配置，共有项最后一个使用者移除才释放', async () => {
    const history=Array.from({length:5},(_,i) => candle(i)); let requests=0;
    const hub=new MarketHub({async latest(_id,limit) {requests++;return result(history.slice(-limit));}});
    const options=shared({history_bars:5,indicators:['ema,3'],chart_indicators:{'2':[],'3':[],'4':[]}});
    try {
        const stream=hub.configure(options)[0]!; await stream.poll();
        for (let index=5;index<17;index++) {history.push(candle(index,100+Math.sin(index)*7));await stream.poll();}
        const before=stream.store.indicators.get('ema,3')!.outputs.get('value'); const count=requests;
        const add=spyOn(IndicatorStream.prototype,'add'); const replace=spyOn(IndicatorStream.prototype,'replace');
        try {
            const both=shared({...options,chart_indicators:{'1':['ema,3'],'2':['ema,3'],'3':[],'4':[]}});
            hub.configure(both); expect(add).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
            const extra=shared({...both,chart_indicators:{...both.chart_indicators,'2':['sma,2','ema,3']}});
            hub.configure(extra); expect(add).toHaveBeenCalledTimes(5);
            expect(stream.store.indicators.get('ema,3')!.outputs.get('value')).toBe(before);
            const expected=directResults(parseIndicator('ema,3'),history.map(input)).get('value')!.slice(-5);
            stream.store.indicators.get('ema,3')!.outputs.get('value')!.forEach((point,index) => expect(Object.is(point.value,expected[index]!.value)).toBe(true));
            const calls=add.mock.calls.length;
            hub.configure(shared({...extra,chart_indicators:{...extra.chart_indicators,'2':['ema,3','sma,2']}}));
            expect(add).toHaveBeenCalledTimes(calls);
            const one=shared({...both,chart_indicators:{...both.chart_indicators,'1':[]}});
            hub.configure(one); expect(stream.store.indicators.has('ema,3')).toBe(true);
            hub.configure(shared({...one,chart_indicators:{...one.chart_indicators,'2':[]}}));
            expect(stream.store.indicators.size).toBe(0); expect(requests).toBe(count);
        } finally { add.mockRestore(); replace.mockRestore(); }
    } finally { hub.dispose(); }
});

test('四窗口各十二项的四十八项并集严格覆盖、追加、裁剪对齐，用户上限仍是十二', async () => {
    expect(MAX_COMPUTED_INDICATORS).toBe(49);
    const chart_indicators=Object.fromEntries(['sma','ema','dema','tema'].map((type,index) =>
        [String(index+1),Array.from({length:12},(_,i) => `${type},${i+1}`)]));
    const options=shared({history_bars:40,chart_indicators});
    const history=Array.from({length:40},(_,i) => candle(i)); let requests=0;
    const hub=new MarketHub({async latest(_id,limit) {requests++;return result(history.slice(-limit));}});
    try {
        const stream=hub.configure(options)[0]!; await stream.poll();
        expect(stream.store.indicators.size).toBe(48); expect(requests).toBe(1);
        for (let index=40;index<43;index++) {
            history[history.length-1]=candle(index-1,120+index); history.push(candle(index)); await stream.poll();
            for (const result of stream.store.indicators.values()) {
                const expected=directResults(result.spec,history.map(input)).get('value')!.slice(-40);
                const actual=result.outputs.get('value')!;
                actual.forEach((point,index) => {
                    expect(point.time).toBe(expected[index]!.time); expect(point.state).toBe(expected[index]!.state);
                    expect(Object.is(point.value,expected[index]!.value)).toBe(true);
                });
            }
        }
        const tooMany=Array.from({length:50},(_,i) => parseIndicator(`ema,${i+1}`));
        expect(() => new CandleStore(5).setIndicators(tooMany)).toThrow('至多 49');
        expect(() => parseIndicatorList(tooMany.slice(0,13))).toThrow('至多 12');
    } finally { hub.dispose(); }
});

test('未被窗口使用的公共默认不计算，共享流故障保持隔离且最后使用者移除后恢复', async () => {
    const calls:string[]=[]; let advance=false;
    const hub=new MarketHub({async latest(id) {
        calls.push(id.timeframe); const value=id.timeframe==='30m'?200:100;
        return result([candle(0,100),candle(1,value),...(advance?[candle(2,value)]:[])]);
    }});
    const options=shared({timeframes:['30m','30m','4h','4h'],indicators:['bbands,2,1e308'],
        chart_indicators:{'1':['sma,2'],'2':['sma,2'],'3':['sma,2'],'4':[]}});
    try {
        const streams=hub.configure(options); await Promise.all(streams.map(stream => stream.poll()));
        expect(calls).toHaveLength(2); expect(streams.every(stream => stream.status.phase==='ready')).toBe(true);
        expect([...streams[0]!.store.indicators.keys()]).toEqual(['sma,2']);
        const before=streams[0]!.store.snapshot();
        hub.configure(shared({...options,chart_indicators:{...options.chart_indicators,'2':['bbands,2,1e308']}}));
        expect(streams[0]!.status.phase).toBe('error'); expect(streams[1]!.status.phase).toBe('error');
        expect(streams[2]!.status.phase).toBe('ready'); expect(streams[0]!.store.snapshot()).toEqual(before);
        hub.configure(shared({...options,chart_indicators:{...options.chart_indicators,'1':['bbands,2,1e308'],'2':[]}}));
        await streams[0]!.poll(); expect(calls).toHaveLength(2); expect(streams[0]!.status.phase).toBe('error');
        hub.configure(shared({...options,chart_indicators:{...options.chart_indicators,'1':[],'2':[]}}));
        expect(streams[0]!.status.phase).toBe('ready');
        advance=true; await Promise.all(streams.map(stream => stream.poll()));
        expect(calls).toHaveLength(4); expect(streams[0]!.store.rows).toHaveLength(3);
        expect(streams[0]!.store.indicators.size).toBe(0);
    } finally { hub.dispose(); }
});
