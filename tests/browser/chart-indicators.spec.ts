import { expect, test, type Page } from '@playwright/test';
import { parseIndicatorList } from '../../src/indicators/parameters';
import { indicatorLabel } from '../../src/indicators/presentation';
import { chartSeries } from '../../src/crypto/data/chartData';
import { directResults } from '../fixtures/indicator-reference';
import { installLineRecorder } from '../fixtures/line-recording';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';

const fixture='http://127.0.0.1:43175/__fixture';
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async ({page,request}) => {
    await request.post(fixture,{data:{reset:true}}); errors.set(page,[]);
    page.on('pageerror',error => errors.get(page)!.push(error.message));
    await page.route('**/*',route => new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(installLineRecorder);
});
test.afterEach(async ({page}) => { expect(errors.get(page)).toEqual([]); });
const open=async (page:Page) => page.getByRole('button',{name:'展开看盘设置'}).click();
const apply=async (page:Page) => page.getByRole('button',{name:'应用',exact:true}).click();
async function windowTab(page:Page,number:number) {
    await page.getByRole('tablist',{name:'图表窗口'}).getByRole('tab',{name:new RegExp(`^窗口 ${number} ·`)}).click();
}
async function configureWindow(page:Page,number:number,mode:string,list?:string) {
    await windowTab(page,number); await page.getByRole('combobox',{name:'指标模式',exact:true}).selectOption(mode);
    if (list!==undefined) await page.getByLabel('独立指标',{exact:true}).fill(list);
}
async function heights(page:Page,index:number) {
    return page.locator('.crypto-chart').nth(index).evaluate(node => [...node.querySelector('table')!.rows]
        .filter(row => row.cells.length===3).slice(0,-1).map(row => row.cells[1]!.getBoundingClientRect().height));
}
async function windowPlot(page:Page,index:number,list:string) {
    const chart=page.locator('.crypto-chart').nth(index); const specs=parseIndicatorList(list);
    await expect(chart).toHaveAttribute('data-phase','ready');
    await expect(chart.locator('.indicator-labels span')).toHaveText(specs.map(indicatorLabel));
    const expected=chartSeries(specs); const panes=Math.max(...expected.map(series => series.pane))+1;
    await expect.poll(async () => (await heights(page,index)).length).toBe(panes);
    await expect.poll(async () => {
        const strokes=await chart.locator('canvas').evaluateAll(nodes => {
            const grouped=new Map<number,Set<string>>();
            for (const canvas of nodes as HTMLCanvasElement[]) {
                const rect=canvas.getBoundingClientRect(); if (rect.width<200 || rect.height<30) continue;
                const colors=grouped.get(rect.top)??new Set<string>();
                for (const stroke of window.lineFrames.get(canvas)?.strokes??[]) colors.add(stroke.color.toLowerCase());
                grouped.set(rect.top,colors);
            }
            return [...grouped].sort(([a],[b]) => a-b).map(([,colors]) => [...colors]);
        });
        return expected.filter(series => series.type==='Line').every(series => strokes[series.pane]?.includes(series.options.color.toLowerCase()));
    }).toBe(true);
}
async function lastCrosshair(page:Page,index:number,time:number) {
    const chart=page.locator('.crypto-chart').nth(index); const bounds=(await chart.boundingBox())!;
    for (let offset=65;offset<=150;offset+=2) {
        await page.mouse.move(bounds.x+bounds.width-offset,bounds.y+bounds.height*.3);
        if (await chart.getAttribute('data-crosshair-time')===String(time/1000)) return;
    }
    throw new Error(`窗口 ${index+1} 未定位到最新时间 ${time}`);
}

test('四窗口分别继承、独立和关闭：同周期只取一次，真实图例与原生库值匹配', async ({page,request}) => {
    const data=new Map<string,OhlcvRow[]>();
    page.on('response',async response => {
        const url=new URL(response.url());
        if (url.pathname==='/api/ccxt/fetch_ohlcv/latest-limit' && response.ok()) {
            data.set(url.searchParams.get('timeframe')!,(await response.json()).rows);
        }
    });
    const lists=['rsi,14','macd,12,26,9','ema,14','none'];
    await page.goto('/?timeframes=30m,30m,4h,1d&history_bars=100&refresh_seconds=3600&indicators=ema,14&chart.1.indicators=rsi,14&chart.2.indicators=macd,12,26,9&chart.4.indicators=none');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    for (let index=0;index<4;index++) {
        await windowPlot(page,index,lists[index]!);
        const timeframe=['30m','30m','4h','1d'][index]!;
        await expect.poll(() => data.get(timeframe)?.length).toBe(100);
        const rows=data.get(timeframe)!; const chart=page.locator('.crypto-chart').nth(index);
        await lastCrosshair(page,index,rows.at(-1)![0]);
        const specs=parseIndicatorList(lists[index]);
        const descriptions=chartSeries(specs).filter(series => series.name!=='candles');
        await expect(chart.locator('.legend-item')).toHaveCount(1+descriptions.length);
        for (const spec of specs) {
            const reference=directResults(spec,rows.map(row => ({time:row[0],high:row[2],low:row[3],close:row[4]})));
            for (const description of descriptions.filter(series => series.name?.startsWith(`market/${spec.type},`))) {
                const role=description.name!.split('/').at(-1)!; const point=reference.get(role)!.at(-1)!;
                expect(point.state).toBe('value');
                const item=chart.locator('.legend-item').filter({has:page.getByText(description.displayName!,{exact:true})});
                await expect(item.locator('span:last-child')).toHaveText(description.valueFormatter!(point.value!));
            }
        }
    }
    const reads=(await (await request.get(fixture)).json()).reads;
    expect(reads).toHaveLength(3); expect(reads.filter((read:any) => read.timeframe==='30m')).toHaveLength(1);
});

test('窗口 Tab 与模式的草稿保留、统一错误、取消、同值覆盖和公共变更', async ({page,request}) => {
    await page.goto('/?timeframes=30m,4h&history_bars=100&refresh_seconds=3600&indicators=ema,14');
    await windowPlot(page,0,'ema,14'); await windowPlot(page,1,'ema,14'); const original=page.url();
    await open(page); await configureWindow(page,1,'custom','rsi,14');
    await configureWindow(page,2,'none'); await windowTab(page,1);
    await expect(page.getByLabel('独立指标',{exact:true})).toHaveValue('rsi,14');
    await page.getByRole('combobox',{name:'指标模式',exact:true}).selectOption('inherit');
    await page.getByLabel('技术指标',{exact:true}).fill('ema,20');
    await page.getByRole('combobox',{name:'指标模式',exact:true}).selectOption('custom');
    await expect(page.getByLabel('独立指标',{exact:true})).toHaveValue('rsi,14');
    expect(page.url()).toBe(original);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await open(page); await expect(page.getByRole('combobox',{name:'指标模式',exact:true})).toHaveValue('inherit');
    await configureWindow(page,1,'custom');
    await expect(page.getByLabel('独立指标',{exact:true})).toHaveValue('ema,14');
    await page.getByLabel('独立指标',{exact:true}).fill('ema,0'); await apply(page);
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('窗口 1 指标：EMA 周期'); expect(page.url()).toBe(original);
    await page.getByLabel('独立指标',{exact:true}).fill('ema,14'); await apply(page);
    expect(new URL(page.url()).searchParams.get('chart.1.indicators')).toBe('ema,14');
    await open(page); await page.getByLabel('技术指标',{exact:true}).fill('rsi,14'); await apply(page);
    await windowPlot(page,0,'ema,14'); await windowPlot(page,1,'rsi,14');
    await page.goBack(); await windowPlot(page,1,'ema,14');
    await page.goForward(); await windowPlot(page,1,'rsi,14');
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(2);
});

test('窗口配置跟随周期和布局位置，减少删除覆盖，前后退与刷新恢复', async ({page,request}) => {
    await page.goto('/?timeframes=30m,4h,1d,1w&history_bars=100&refresh_seconds=3600&indicators=ema,14&chart.1.indicators=rsi,14&chart.4.indicators=none#binance,BTC/USDT:USDT');
    await windowPlot(page,0,'rsi,14'); await windowPlot(page,3,'none');
    await open(page); await windowTab(page,1); await page.getByRole('combobox',{name:'周期',exact:true}).selectOption('15m'); await apply(page);
    await windowPlot(page,0,'rsi,14'); expect(new URL(page.url()).searchParams.get('chart.1.indicators')).toBe('rsi,14');
    await open(page); await page.getByRole('combobox',{name:'布局',exact:true}).selectOption('1x1'); await apply(page);
    await expect(page.locator('.crypto-chart')).toHaveCount(1); expect(new URL(page.url()).searchParams.has('chart.4.indicators')).toBe(false);
    await open(page); await page.getByRole('combobox',{name:'布局',exact:true}).selectOption('2x2'); await apply(page);
    await windowPlot(page,3,'ema,14'); expect(new URL(page.url()).searchParams.has('chart.4.indicators')).toBe(false);
    await page.goBack(); await expect(page.locator('.crypto-chart')).toHaveCount(1);
    await page.goBack(); await windowPlot(page,3,'none');
    await page.reload(); await windowPlot(page,0,'rsi,14'); await windowPlot(page,3,'none');
    expect(new URL(page.url()).hash).toContain('binance');
    expect((await (await request.get(fixture)).json()).reads.some((read:any) => read.timeframe==='15m')).toBe(true);
});

test('只改一个同周期窗口，其它窗口画布和临时高度保持，主图占比按各自副图数分配', async ({page,request}) => {
    const own='rsi,14;macd,12,26,9';
    await page.goto(`/?timeframes=30m,30m&history_bars=100&refresh_seconds=3600&main_pane_ratio=0.7&indicators=${encodeURIComponent(own)}`);
    await windowPlot(page,0,own); await windowPlot(page,1,own);
    await page.locator('.crypto-chart').nth(1).locator('canvas').evaluateAll(nodes => { (window as any).__otherIndicatorCanvases=nodes; });
    const handle=page.locator('.crypto-chart').nth(1).locator('td[colspan="3"]').first().locator('div[style*="position: absolute"]');
    const box=(await handle.boundingBox())!; const before=await heights(page,1);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2+20,{steps:5}); await page.mouse.up(); await page.mouse.move(5,5);
    await expect.poll(async () => (await heights(page,1))[0]!).toBeGreaterThan(before[0]!); const temporary=await heights(page,1);
    await open(page); await configureWindow(page,1,'none'); await apply(page);
    await windowPlot(page,0,'none'); await windowPlot(page,1,own); expect(await heights(page,1)).toEqual(temporary);
    expect(await page.locator('.crypto-chart').nth(1).locator('canvas').evaluateAll(nodes => {
        const old=(window as any).__otherIndicatorCanvases as Element[];
        return nodes.length===old.length && nodes.every((node,index) => node===old[index] && node.isConnected);
    })).toBe(true);
    await open(page); await configureWindow(page,1,'custom','rsi,14'); await apply(page);
    await windowPlot(page,0,'rsi,14');
    const ownHeights=await heights(page,0); const total=ownHeights.reduce((sum,value) => sum+value,0);
    expect(Math.abs(ownHeights[0]!-total*.7)).toBeLessThanOrEqual(2);
    expect(await heights(page,1)).toEqual(temporary);
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(1);
});

test('非法窗口 URL 在取数前拒绝，越界、重复和错误配置可以在设置里恢复', async ({page,request}) => {
    for (const query of ['?layout=1x1&chart.2.indicators=none','?chart.01.indicators=none','?chart.1.indicators=ema,0',
        '?chart.1.indicators=none&chart.1.indicators=rsi,14']) {
        await page.goto(query); await expect(page.getByRole('alert')).toBeVisible();
    }
    expect((await (await request.get(fixture)).json()).reads).toEqual([]);
    await open(page); await apply(page); await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    expect(new URL(page.url()).searchParams.has('chart.1.indicators')).toBe(false);
});
