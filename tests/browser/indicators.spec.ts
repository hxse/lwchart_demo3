import { test, expect, type Page } from '@playwright/test';

const fixture='http://127.0.0.1:43175/__fixture';
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page,request})=>{
    await request.post(fixture,{data:{reset:true}}); errors.set(page,[]);
    page.on('pageerror',error=>errors.get(page)!.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});

async function panes(page:Page){
    return page.locator('.crypto-chart canvas').evaluateAll(nodes=>{
        const bounds=nodes.map(node=>node.getBoundingClientRect()).filter(box=>box.width>300&&box.height>30);
        return [...new Map(bounds.map(box=>[box.top,{top:box.top,height:box.height}])).values()];
    });
}
test('十种已准入指标显示六个 Pane，更新／主题保持主图，删除配置释放副图',async({page,request})=>{
    const list='sma,5;ema,14;dema,5;tema,5;rsi,14;cci,20;macd,12,26,9;atr,14;er,10;bbands,20,2';
    await page.goto(`/?timeframes=30m&history_bars=100&refresh_seconds=1&indicators=${encodeURIComponent(list)}`);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('.indicator-labels span')).toHaveCount(10);
    await expect.poll(async()=> (await panes(page)).length).toBe(6);
    const sizes=await panes(page); expect(sizes[0]!.height).toBeGreaterThan(sizes[1]!.height);
    await page.locator('.crypto-chart canvas').evaluateAll(nodes=>{
        (window as any).__indicatorPrimary=nodes.find(node=>{const b=node.getBoundingClientRect();return b.width>300&&b.height>30;});
    });
    await request.post(fixture,{data:{revision:20,advance:1}});
    await expect.poll(async()=> (await (await request.get(fixture)).json()).reads.filter((r:any)=>!r.history).length).toBeGreaterThan(0);
    await expect(page.locator('.status.error')).toHaveCount(0);
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    await expect(page.getByLabel('技术指标')).toHaveValue(list);
    await page.getByRole('combobox',{name:'主题',exact:true}).selectOption('light');
    await page.getByRole('button',{name:'应用',exact:true}).click();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme','light');
    await expect.poll(async()=> (await panes(page)).length).toBe(6);
    expect(await page.evaluate(()=> (window as any).__indicatorPrimary.isConnected)).toBe(true);
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    await page.getByRole('button',{name:'无指标',exact:true}).click();
    await page.getByRole('button',{name:'应用',exact:true}).click();
    await expect(page.locator('.indicator-labels span')).toHaveCount(0);
    await expect.poll(async()=> (await panes(page)).length).toBe(1);
    expect(new URL(page.url()).searchParams.get('indicators')).toBe('none');
    expect((await (await request.get(fixture)).json()).reads.filter((r:any)=>r.history)).toHaveLength(1);
});

test('暂不支持的 ADX URL 不请求行情，设置拒绝不改变 URL；合法技术指标可恢复',async({page,request})=>{
    await page.goto('/?indicators=adx,14&timeframes=30m');
    await expect(page.getByRole('alert')).toContainText('ADX 当前不支持');
    expect((await (await request.get(fixture)).json()).reads).toEqual([]);
    await page.getByRole('button',{name:'展开看盘设置'}).click();
    const original=page.url();
    await page.getByLabel('技术指标').fill('ema,14;adx,14');
    await page.getByRole('button',{name:'应用',exact:true}).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('ADX 当前不支持');
    expect(page.url()).toBe(original);
    await page.getByLabel('技术指标').fill('ema,14;rsi,14;macd,12,26,9');
    await page.getByRole('button',{name:'应用',exact:true}).click();
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    expect(new URL(page.url()).searchParams.get('indicators')).toBe('ema,14;rsi,14;macd,12,26,9');
    await expect(page.locator('.indicator-labels').first()).toContainText('MACD(12,26,9)');
});
