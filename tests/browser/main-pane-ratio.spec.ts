import { expect, test, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const indicators = 'rsi,14;macd,12,26,9';
const errors = new WeakMap<Page,string[]>();
test.beforeEach(async ({ page,request }) => {
    await request.post(fixture,{data:{reset:true}}); errors.set(page,[]);
    page.on('pageerror',error => errors.get(page)!.push(error.message));
    await page.route('**/*',route => new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function heights(page: Page, slot = 0) {
    return page.locator('.crypto-chart').nth(slot).evaluate(node => {
        const table = node.querySelector('table')!;
        // SDK 的三单元格行是绘图 Pane 和末尾时间轴；分隔线是单单元格行。
        return [...table.rows].filter(row => row.cells.length===3).slice(0,-1)
            .map(row => row.cells[1]!.getBoundingClientRect().height);
    });
}
async function preset(page: Page, ratio: number, subPanes: number, slot = 0) {
    await expect.poll(async () => {
        const values = await heights(page,slot); const total = values.reduce((sum,height) => sum+height,0);
        const target = subPanes ? [ratio,...Array(subPanes).fill((1-ratio)/subPanes)] : [1];
        return values.length===target.length && total>0 && values.every((height,index) => Math.abs(height-total*target[index]!)<=2);
    }).toBe(true);
}
async function settings(page: Page, values: { ratio?: string; indicators?: string; theme?: string; timezone?: string }) {
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    if (values.ratio!==undefined) await page.getByLabel('主图占比',{exact:true}).fill(values.ratio);
    if (values.indicators!==undefined) await page.getByLabel('技术指标').fill(values.indicators);
    if (values.theme!==undefined) await page.getByRole('combobox',{name:'主题',exact:true}).selectOption(values.theme);
    if (values.timezone!==undefined) await page.getByLabel('显示时区').fill(values.timezone);
    await page.getByRole('button',{name:'应用',exact:true}).click();
}
async function drag(page: Page, slot = 0) {
    const before = await heights(page,slot);
    const handle = page.locator('.crypto-chart').nth(slot).locator('td[colspan="3"]').first().locator('div[style*="position: absolute"]');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2+24,{steps:6});
    await page.mouse.up(); await page.mouse.move(5,5);
    await expect.poll(async () => (await heights(page,slot))[0]!).toBeGreaterThan(before[0]!);
    return heights(page,slot);
}

test('公共主图占比的草稿、错误、应用、导航和刷新，两个复合副图均分余量', async ({ page,request }) => {
    await page.goto(`/?timeframes=30m&refresh_seconds=3600&indicators=${encodeURIComponent(indicators)}#binance,BTC/USDT:USDT`);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase','ready');
    await preset(page,.7,2);
    const original = page.url();
    expect(new URL(original).searchParams.get('main_pane_ratio')).toBe('0.7');
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__ratioCanvases=nodes; });
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    await expect(page.locator('.common-fields').getByLabel('主图占比',{exact:true})).toHaveValue('0.7');
    await page.getByLabel('主图占比',{exact:true}).fill('0.6');
    expect(page.url()).toBe(original); await preset(page,.7,2);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    for (const invalid of ['0','1','']) {
        await page.getByLabel('主图占比',{exact:true}).fill(invalid);
        await page.getByRole('button',{name:'应用',exact:true}).click();
        await expect(page.getByRole('dialog').getByRole('alert')).toContainText('主图占比');
        expect(page.url()).toBe(original); await preset(page,.7,2);
    }
    await page.getByLabel('主图占比',{exact:true}).fill('0.6');
    await page.getByRole('button',{name:'应用',exact:true}).click();
    await preset(page,.6,2);
    expect(new URL(page.url()).hash).toBe(new URL(original).hash);
    expect(new URL(page.url()).searchParams.get('main_pane_ratio')).toBe('0.6');
    await page.goBack(); await preset(page,.7,2);
    await page.goForward(); await preset(page,.6,2);
    expect(await page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old=(window as any).__ratioCanvases as Element[];
        return nodes.length===old.length && nodes.every((node,index) => node===old[index] && node.isConnected);
    })).toBe(true);
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(1);
    await page.reload(); await preset(page,.6,2);
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    await expect(page.getByLabel('主图占比',{exact:true})).toHaveValue('0.6');
});

test('拖动只是临时高度，行情／主题／时区／参数更新不回写配置或覆盖高度', async ({ page,request }) => {
    await page.goto(`/?timeframes=30m&refresh_seconds=1&indicators=${encodeURIComponent(indicators)}&main_pane_ratio=0.7`);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase','ready');
    await preset(page,.7,2);
    const original = page.url(); const temporary = await drag(page);
    expect(page.url()).toBe(original);
    await request.post(fixture,{data:{advance:1}});
    await expect.poll(async () => (await (await request.get(fixture)).json()).reads.filter((read:any) => !read.history).length).toBeGreaterThan(0);
    expect(await heights(page)).toEqual(temporary);
    await settings(page,{theme:'light',timezone:'UTC'}); expect(await heights(page)).toEqual(temporary);
    await settings(page,{indicators:'rsi,20;macd,12,26,9'}); expect(await heights(page)).toEqual(temporary);
    expect(new URL(page.url()).searchParams.get('main_pane_ratio')).toBe('0.7');
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    await expect(page.getByLabel('主图占比',{exact:true})).toHaveValue('0.7');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.reload(); await preset(page,.7,2);
});

test('增删副图重新应用默认占比，叠加指标不计副图，无副图时主图占满', async ({ page,request }) => {
    await page.goto(`/?timeframes=30m&refresh_seconds=3600&indicators=${encodeURIComponent(indicators)}&main_pane_ratio=0.7`);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase','ready'); await preset(page,.7,2);
    await drag(page);
    await settings(page,{indicators:`${indicators};adx,14`}); await preset(page,.7,3);
    await drag(page);
    await settings(page,{indicators:'macd,12,26,9;adx,14'}); await preset(page,.7,2);
    await settings(page,{indicators:'macd,12,26,9'}); await preset(page,.7,1);
    await settings(page,{indicators:'ema,14;bbands,20,2'}); await preset(page,.7,0);
    await settings(page,{indicators}); await preset(page,.7,2);
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(1);
});

test('多窗口共用默认占比，临时拖动彼此独立，修改默认占比统一生效', async ({ page,request }) => {
    await page.goto(`/?timeframes=30m,4h&refresh_seconds=3600&indicators=${encodeURIComponent(indicators)}&main_pane_ratio=0.7`);
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(2);
    await preset(page,.7,2,0); await preset(page,.7,2,1);
    const second = await heights(page,1); await drag(page,0);
    expect(await heights(page,1)).toEqual(second);
    expect(new URL(page.url()).searchParams.get('main_pane_ratio')).toBe('0.7');
    await settings(page,{ratio:'0.6'}); await preset(page,.6,2,0); await preset(page,.6,2,1);
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(2);
});

test('非法占比 URL 在取数前拒绝，设置修正后恢复', async ({ page,request }) => {
    for (const raw of ['0','1','NaN','0.7&main_pane_ratio=0.6']) {
        await page.goto(`/?main_pane_ratio=${raw}`);
        await expect(page.getByRole('alert')).toContainText(raw.includes('&') ? '重复参数' : '主图占比');
    }
    expect((await (await request.get(fixture)).json()).reads).toEqual([]);
    await settings(page,{ratio:'0.6'});
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    expect(new URL(page.url()).searchParams.get('main_pane_ratio')).toBe('0.6');
});
