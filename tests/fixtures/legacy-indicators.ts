import {zipSync,strToU8} from 'fflate';
import {legacyRows} from './legacy';
import type {ChartConfigJSON,SeriesItemConfig} from '../../src/pages/ChartDashboard/chartDashboard.types';
import {parseIndicator} from '../../src/indicators/parameters';

const item=(id:string,spec:string,output:'value'|'macd'|'signal'|'histogram',dataName:string,fileName='indicators.json'):SeriesItemConfig=>({
    type:output==='histogram'?'histogram':'line',fileName,dataName,show:true,showInLegend:true,
    indicator:{id,spec:parseIndicator(spec),output},
});
const hline=(value:number):SeriesItemConfig=>({type:'hline',show:true,hLineOpt:{value,color:'#888888',label:String(value),showLabel:true}});
export const legacyIndicatorConfig:ChartConfigJSON={
    template:'single',showBottomRow:true,viewMode:'chart',selectedInternalFileName:'indicators.json',showLegendInAll:true,
    chart:[[
        [{type:'candle',fileName:'candles.json',dataName:['open','high','low','close'],show:true,showInLegend:true},
            item('ema-file','ema,14','value','ema')],
        [item('rsi-a','rsi,14','value','rsiA'),item('rsi-b','rsi,14','value','rsiB'),hline(30),hline(50),hline(70)],
        [item('macd-main','macd,12,26,9','macd','macd'),item('macd-main','macd,12,26,9','signal','signal'),
            {...item('macd-main','macd,12,26,9','histogram','hist'),histogramOpt:{color:'#123456'}}],
        [item('macd-alt','macd,12,26,9','histogram','hist','alt.json')],
    ]],
    bottomRowChart:[[[item('adx-file','adx,14','value','adx')]]],
};
export function legacyIndicatorZip(){
    return zipSync({
        'chartConfig.json':strToU8(JSON.stringify(legacyIndicatorConfig)),
        'candles.json':strToU8(JSON.stringify(legacyRows)),
        'indicators.json':strToU8(JSON.stringify(legacyRows.map(row=>({time:row.time,ema:101,rsiA:45,rsiB:55,macd:1.25,signal:.75,hist:.5,adx:28})))),
        'alt.json':strToU8(JSON.stringify(legacyRows.map(row=>({time:row.time,hist:-2})))),
    });
}
