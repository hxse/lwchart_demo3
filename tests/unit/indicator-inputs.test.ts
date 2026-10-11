import {expect,test} from 'bun:test';
import {ADX,WSMA} from 'trading-signals';
import {CandleStore} from '../../src/crypto/data/CandleStore';
import {IndicatorStream} from '../../src/indicators/IndicatorStream';
import {parseIndicatorList,parseIndicator,indicatorKey} from '../../src/indicators/parameters';
import {directResults} from '../fixtures/indicator-reference';
import {candle} from '../fixtures/data';
import type {IndicatorInput} from '../../src/indicators/types';
import type {OhlcvRow} from '../../src/crypto/data/ohlcv';

test('只修改 high／low 仍更新 HLC 指标，close-only 不多算；完整原生结果一致',()=>{
    const specs=parseIndicatorList('ema,3;rsi,3;macd,2,4,2;atr,3;cci,3;er,3');
    const rows=Array.from({length:8},(_,i)=>candle(i));
    const store=new CandleStore(20);store.setIndicators(specs);store.initialize(rows);
    const last=[...rows.at(-1)!] as OhlcvRow;last[2]+=3;last[3]-=1;rows[rows.length-1]=last;
    const changed=store.merge(rows.slice(-5));expect(changed.kind).toBe('update');
    if(changed.kind==='reload')throw new Error('合法末根不应重载');
    expect([...changed.indicators.keys()]).toEqual(['atr,3','cci,3','er,3']);
    for(const spec of specs){
        const expected=directResults(spec,rows.map(row=>({time:row[0],high:row[2],low:row[3],close:row[4]})));
        for(const [role,points] of expected){
            expect(Object.is(store.indicators.get(indicatorKey(spec))!.outputs.get(role as any)!.at(-1)!.value,points.at(-1)!.value)).toBe(true);
        }
    }
});

test('ADX 首根原生 replace 的状态反例与单根新建生命周期的补偿严格区分',()=>{
    const original:IndicatorInput={time:1,high:110,low:90,close:100};
    const revision:IndicatorInput={time:1,high:120,low:90,close:100};
    const next:IndicatorInput[]=[{time:2,high:111,low:89,close:100},{time:3,high:112,low:88,close:100}];
    const native=new ADX(2,WSMA);native.add(original);native.replace(revision);for(const input of next)native.add(input);
    const reference=directResults(parseIndicator('adx,2'),[revision,...next]).get('value')!.at(-1)!.value;
    expect(Number.isFinite(native.getResultOrThrow())).toBe(true);expect(Object.is(native.getResultOrThrow(),reference)).toBe(false);
    const adapted=new IndicatorStream(parseIndicator('adx,2'),[original]);adapted.replace(revision);for(const input of next)adapted.add(input);
    expect(Object.is(adapted.snapshot().outputs.get('value')!.at(-1)!.value,reference)).toBe(true);
});
