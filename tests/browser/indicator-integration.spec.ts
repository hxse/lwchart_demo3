import {test,expect} from '@playwright/test';
import {parseIndicator} from '../../src/indicators/parameters';
import {directResults} from '../fixtures/indicator-reference';
import type {OhlcvRow} from '../../src/crypto/data/ohlcv';

test('真实浏览器原生计算、绘图、裁剪、完整重载与 Bun 原生重放严格对齐',async({page})=>{
    const errors:string[]=[]; const warnings:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='warning')warnings.push(message.text());});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:43175/indicator-fixture');
    await page.waitForFunction(()=>!!window.indicatorFixture);
    for(const action of ['initial','revise','revise','append','append','missing-tail','history','failed-reload','recover']){
        const report=await page.evaluate(action=>window.indicatorFixture.run(action),action);
        expect(report.aligned).toBe(true); expect(report.plotted).toBe(true); expect(report.bars).toBe(32);
        expect(report.panes).toBe(7);
        expect(report.phase).toBe(action==='failed-reload'?'error':'ready');
        const inputs=(report.referenceRows as OhlcvRow[]).map(row=>({time:row[0],high:row[2],low:row[3],close:row[4]}));
        for(const result of report.results){
            const expected=directResults(parseIndicator(result.key),inputs);
            for(const output of result.outputs){
                const raw=expected.get(output.role)!;
                const visible=raw.slice(-32);
                expect(output.points).toHaveLength(visible.length);
                const expectedPoints=visible.map(point=>{
                    const value=point.value;
                    return {time:point.time,state:point.state,value:value===undefined?'missing':Number.isNaN(value)?'NaN':Object.is(value,-0)?'-0':value};
                });
                expect(output.points,`${result.key}/${output.role} 原始序列`).toEqual(expectedPoints);
                expect(output.points.every((point,index)=>{
                    const value=visible[index]!.value;
                    const encoded=value===undefined?'missing':Number.isNaN(value)?'NaN':Object.is(value,-0)?'-0':value;
                    return point.time===visible[index]!.time&&point.state===visible[index]!.state&&Object.is(point.value,encoded);
                }),`${result.key}/${output.role} Object.is`).toBe(true);
            }
        }
    }
    const light=await page.evaluate(()=>window.indicatorFixture.recolor('light'));
    expect(light.aligned&&light.plotted).toBe(true);
    expect(light.limits).toEqual([32,5,5,5,5,5,32,5,32,5,32,32]);
    expect(warnings.filter(text=>text.includes('行情校验异常'))).toHaveLength(3);
    expect(errors).toEqual([]);
    await page.screenshot({path:'test-results/indicator-integration.png'});
});

test('真实浏览器 ADX 平盘、末根替换和恢复波动使用补丁，零值与参考线正确显示',async({page})=>{
    const errors:string[]=[]; const warnings:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='warning')warnings.push(message.text());});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:43175/indicator-fixture');
    await page.waitForFunction(()=>!!window.indicatorFixture);
    for(const [action,value] of [['flat-initial',0],['flat-revise-up',20],['flat-revise-down',20],
        ['flat-revise-reset',0],['flat-append',36],['flat-append',59.04]] as const){
        const report=await page.evaluate(action=>window.indicatorFixture.run(action),action);
        expect(report.phase).toBe('ready'); expect(report.panes).toBe(7);
        expect(report.aligned&&report.plotted).toBe(true);
        const output=report.results.find(result=>result.key==='adx,5')!.outputs[0]!.points.at(-1)!;
        expect(output.state).toBe('value'); expect(Object.is(output.value,value)).toBe(true);
        expect(report.references.find(reference=>reference.key==='market/adx,5/value')!.prices).toEqual([25]);
        await page.mouse.move(0,0);
        const coordinate=await page.evaluate(()=>window.indicatorFixture.coordinates('adx,5'));
        await page.mouse.move(coordinate.x,coordinate.y);
        await expect(page.locator('.legend-item').filter({hasText:'ADX5'}).locator('span:last-child')).toHaveText(String(value));
    }
    for(const theme of ['light','dark'] as const){
        const report=await page.evaluate(theme=>window.indicatorFixture.recolor(theme),theme);
        expect(report.aligned&&report.plotted).toBe(true);
        expect(report.references.find(reference=>reference.key==='market/adx,5/value')!.prices).toEqual([25]);
    }
    expect(warnings).toEqual([]); expect(errors).toEqual([]);
});

test('实际 UMD 的文件指标注记、同参多组、固定柱色和底部 ADX 展示保持',async({page})=>{
    const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:43175/legacy-indicators');
    await expect(page.locator('.chart-container')).toHaveCount(2);
    await expect(page.locator('.chart-container canvas').first()).toBeVisible();
    const chart=page.locator('.chart-container').first(); const bounds=await chart.boundingBox();
    await page.mouse.move(bounds!.x+bounds!.width*.5,bounds!.y+bounds!.height*.3);
    await expect(chart.locator('.chart-legend')).toBeVisible();
    const rsi=chart.locator('.legend-item').filter({hasText:'RSI14'});
    await expect(rsi).toHaveCount(2);
    expect(await rsi.locator('span:last-child').allTextContents()).toEqual(['45','55']);
    await expect(chart.locator('.chart-legend')).toContainText('MACD(12,26,9) Signal');
    const histograms=chart.locator('.legend-item').filter({hasText:'Histogram'});
    await expect(histograms).toHaveCount(2);
    expect(await histograms.locator('span:last-child').allTextContents()).toEqual(['0.5','-2']);
    await expect(page.locator('.chart-container').nth(1).locator('.chart-legend')).toContainText('ADX14');
    await page.screenshot({path:'test-results/legacy-indicators.png'});
    expect(errors).toEqual([]);
});
