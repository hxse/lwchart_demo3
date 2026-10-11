import { createChart, type IChartApi } from 'lightweight-charts';
import { MarketStream } from '../../src/crypto/data/MarketStream';
import { SeriesRegistry } from '../../src/components/lw-chart/logic/SeriesRegistry';
import { applySeriesData } from '../../src/components/lw-chart/logic/SeriesDataUpdater';
import { chartSeries, chartPatches } from '../../src/crypto/data/chartData';
import { parseIndicatorList, indicatorKey } from '../../src/indicators/parameters';
import { directResults, simulatedInputs } from './indicator-reference';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';
import type { Theme } from '../../src/crypto/options';
import type { IndicatorPoint } from '../../src/indicators/types';
import { LegendManager } from '../../src/components/lw-chart/logic/LegendManager';

const list='sma,5;ema,5;dema,5;tema,5;rsi,5;cci,5;macd,3,7,4;atr,5;er,5;bbands,5,2';
const specs=parseIndicatorList(list);
const input=(row:OhlcvRow)=>({time:row[0],high:row[2],low:row[3],close:row[4]});
const rows=(count:number):OhlcvRow[]=>simulatedInputs(count).map(point=>[point.time,point.close-.5,point.high,point.low,point.close,10]);
const encoded=(point:IndicatorPoint)=>({time:point.time,state:point.state,
    value:point.value===undefined?'missing':Number.isNaN(point.value)?'NaN':Object.is(point.value,-0)?'-0':point.value});
let sourceRows=rows(80);
let referenceRows:OhlcvRow[]=[];
let omit:number|undefined;
let failFull=false;
let theme:Theme='dark';
const limits:number[]=[];
const stream=new MarketStream({source:'tq',symbol:'OFFLINE.TEST',timeframe:'1m'}, {
    async latest(_identity,limit) {
        limits.push(limit);
        if(limit===32&&failFull)throw new Error('离线完整重载失败');
        const selected=sourceRows.slice(-limit).filter(row=>limit!==5||row[0]!==omit);
        return {rows:selected.map(row=>[...row] as OhlcvRow)};
    },
},32);
const chart:IChartApi=createChart(document.getElementById('chart')!,{width:1100,height:700,
    timeScale:{barSpacing:8,rightOffset:5},layout:{background:{color:'#171b20'},textColor:'#cccccc'}});
const registry=new SeriesRegistry(chart);
const legend=new LegendManager(); legend.create(document.getElementById('chart')!); legend.setChart(chart); legend.setShowInAll(true);
chart.subscribeCrosshairMove(param=>legend.update(param));
registry.apply(chartSeries(specs,theme),'reconcile',legend);
stream.configure(specs,3600);
stream.subscribe(event=>{
    if(event.kind==='status')return;
    applySeriesData(chart,registry.seriesMap,chartPatches(event,specs,theme,stream.store.indicators),event.kind==='replace');
});

function report(){
    let aligned=true; let plotted=true;
    for(const spec of specs){
        const expected=directResults(spec,referenceRows.map(input));
        for(const [role,values] of expected){
            const visible=values.filter(point=>point.time>=stream.store.rows[0]![0]);
            const actual=stream.store.indicators.get(indicatorKey(spec))!.outputs.get(role as any)!;
            aligned&&=actual.length===visible.length&&actual.every((point,index)=>{
                const other=visible[index]!; return point.time===other.time&&point.state===other.state&&Object.is(point.value,other.value);
            });
            const api=registry.seriesMap.get(`market/${indicatorKey(spec)}/${role}`)!;
            const drawn=api.data().filter(point=>'value' in point);
            const finite=visible.filter(point=>point.state==='value');
            plotted&&=drawn.length===finite.length&&drawn.every((point,index)=>Object.is((point as any).value,finite[index]!.value)&&Number(point.time)*1000===finite[index]!.time);
        }
    }
    return {aligned,plotted,limits:[...limits],phase:stream.status.phase,bars:stream.store.rows.length,panes:chart.panes().length,
        referenceRows:referenceRows.map(row=>[...row]),results:[...stream.store.indicators].map(([key,result])=>({key,
            outputs:[...result.outputs].map(([role,points])=>({role,points:points.map(encoded)}))}))};
}

async function run(action:string){
    omit=undefined; failFull=false;
    if(action==='initial')referenceRows=sourceRows.slice(-32);
    if(action==='revise'){
        const last=sourceRows.at(-1)!; sourceRows[sourceRows.length-1]=[last[0],last[1],last[2]+.3,last[3],last[4]+.2,last[5]];
        referenceRows[referenceRows.length-1]=sourceRows.at(-1)!;
    }
    if(action==='append'){
        const fresh=rows(sourceRows.length+2).slice(-2); sourceRows.push(...fresh); referenceRows.push(...fresh);
    }
    if(action==='missing-tail')omit=referenceRows.at(-1)![0];
    if(action==='history'||action==='failed-reload'){
        const index=sourceRows.length-3; const prior=sourceRows[index]!;
        sourceRows[index]=[prior[0],prior[1],prior[2]+.3,prior[3],prior[4]+.2,prior[5]];
        failFull=action==='failed-reload';
    }
    if(['missing-tail','history','recover'].includes(action))referenceRows=sourceRows.slice(-32);
    await stream.poll();
    return report();
}
function recolor(next:Theme){
    theme=next; registry.apply(chartSeries(specs,theme),'reconcile',legend);
    applySeriesData(chart,registry.seriesMap,chartPatches(stream.store.snapshot(),specs,theme),true);
    return report();
}
declare global {interface Window {indicatorFixture:{run:typeof run;report:typeof report;recolor:typeof recolor}}}
window.indicatorFixture={run,report,recolor};
