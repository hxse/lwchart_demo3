import {expect,test} from 'bun:test';
import {IndicatorStream} from '../../src/indicators/IndicatorStream';
import {parseIndicator} from '../../src/indicators/parameters';
import {directResults} from '../fixtures/indicator-reference';
import type {IndicatorInput} from '../../src/indicators/types';

const candidates=['sma,5','ema,5','dema,5','tema,5','rsi,5','cci,5','macd,3,7,4','atr,5','adx,5','er,5','bbands,5,2'];
const dataset=(prices:number[]):IndicatorInput[]=>prices.map((close,index)=>({
    time:Date.UTC(2026,0,1)+index*60000+(index>=40?172800000:0),high:close+2,low:close-2,close,
}));
for(const [name,values] of Object.entries({constant:Array(90).fill(100),up:Array.from({length:90},(_,i)=>100+i*.17),
    down:Array.from({length:90},(_,i)=>100-i*.17),alternating:Array.from({length:90},(_,i)=>100+(i%2?3.3:-2.1)),
    jump:Array.from({length:90},(_,i)=>100+(i>=40?15.7:0)+i*.13)})){
    test(`${name} 合法行情及时间跳空：十一种指标各角色严格对齐`,()=>{
        const inputs=dataset(values);
        for(const text of candidates){
            const spec=parseIndicator(text); const stream=new IndicatorStream(spec,inputs.slice(0,30));
            for(const input of inputs.slice(30))stream.add(input);
            const reference=directResults(spec,inputs);
            for(const [role,points] of reference){
                const actual=stream.snapshot().outputs.get(role as any)!;
                expect(actual.length).toBe(points.length);
                actual.forEach((point,index)=>{
                    expect(point.time).toBe(points[index]!.time);expect(point.state).toBe(points[index]!.state);
                    expect(Object.is(point.value,points[index]!.value)).toBe(true);
                });
            }
        }
    });
}
for(const period of [14,50,100])test(`EMA${period} 标准配置预热、反复覆盖与新增保持原生精确结果`,()=>{
    const inputs=dataset(Array.from({length:180},(_,i)=>100+i*.31+Math.sin(i/7)*5));
    const spec=parseIndicator(`ema,${period}`); const prefix=inputs.slice(0,140);
    const stream=new IndicatorStream(spec,prefix);
    for(const amount of [.1,.7,-.3]){
        prefix[prefix.length-1]={...prefix.at(-1)!,close:prefix.at(-1)!.close+amount};stream.replace(prefix.at(-1)!);
        const expected=directResults(spec,prefix).get('value')!;
        expect(Object.is(stream.snapshot().outputs.get('value')!.at(-1)!.value,expected.at(-1)!.value)).toBe(true);
    }
    prefix.push(...inputs.slice(140)); for(const input of inputs.slice(140))stream.add(input);
    const expected=directResults(spec,prefix).get('value')!;
    stream.snapshot().outputs.get('value')!.forEach((point,index)=>{
        expect(point.state).toBe(expected[index]!.state);expect(Object.is(point.value,expected[index]!.value)).toBe(true);
    });
});
