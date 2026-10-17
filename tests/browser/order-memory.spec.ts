import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture', orders = 'http://127.0.0.1:43175/__orders';
const failures = new WeakMap<Page, string[]>();
const panel = (page: Page) => page.getByRole('dialog', { name: '下单面板' });
const field = (page: Page, name: string) => page.locator(`[name="order.${name}"]`);
const confirm = (page: Page) => page.getByRole('button', { name: '确认', exact: true });
const cancel = (page: Page) => page.getByRole('button', { name: '取消', exact: true });
const buy = (page: Page) => page.getByRole('button', { name: '做多 · 市价下单', exact: true });
const data = async (request: APIRequestContext) => (await request.get(orders)).json();
async function open(page: Page) { await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(panel(page)).toBeVisible(); }
async function close(page: Page) { await page.getByRole('button', { name: '关闭下单面板' }).click(); await expect(panel(page)).toHaveCount(0); }
async function offline(page: Page) {
    failures.set(page, []); page.on('pageerror', error => failures.get(page)!.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        failures.get(page)!.push('测试访问了外网'); return route.abort();
    });
}
test.beforeEach(async ({ page, request }) => { await request.post(fixture, { data: { reset: true } }); await offline(page); });
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

test('同页重开保留已确认参数、手填品种、非法草稿和折叠状态；刷新及另一 tab 独立', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    await field(page, 'symbol').fill('ETH/USDT:USDT'); await field(page, 'risk_amount').fill('2');
    await field(page, 'atr_period').fill('20'); await field(page, 'timeframe').selectOption('1h');
    await confirm(page).click(); await expect(buy(page)).toBeEnabled();
    await close(page); await open(page);
    await expect(field(page, 'symbol')).toHaveValue('ETH/USDT:USDT'); await expect(field(page, 'risk_amount')).toHaveValue('2');
    await expect(field(page, 'atr_period')).toHaveValue('20'); await expect(field(page, 'timeframe')).toHaveValue('1h');
    await expect(confirm(page)).toBeDisabled();
    await field(page, 'risk_amount').fill(''); await field(page, 'atr_period').fill('bad');
    for (const section of ['parameters', 'reference', 'log']) {
        await page.getByTestId(`order-${section}`).locator(':scope > summary').click();
        await expect(page.getByTestId(`order-${section}`)).toHaveJSProperty('open', false);
    }
    await close(page); const stopped = (await data(request)).reads.length;
    await page.waitForTimeout(1200); expect((await data(request)).reads).toHaveLength(stopped);
    await open(page);
    for (const section of ['parameters', 'reference', 'log']) await expect(page.getByTestId(`order-${section}`)).toHaveJSProperty('open', false);
    await page.getByTestId('order-parameters').locator(':scope > summary').click();
    await expect(field(page, 'risk_amount')).toHaveValue(''); await expect(field(page, 'atr_period')).toHaveValue('bad');
    await confirm(page).click(); await expect(panel(page).getByRole('alert')).toContainText('ATR 根数');
    await close(page); await open(page); await expect(panel(page).getByRole('alert')).toContainText('ATR 根数');
    await cancel(page).click(); await expect(field(page, 'risk_amount')).toHaveValue('2'); await expect(field(page, 'atr_period')).toHaveValue('20');
    const other = await page.context().newPage();
    try {
        await offline(other); await other.goto(page.url()); await open(other);
        await expect(field(other, 'risk_amount')).toHaveValue('1'); await expect(field(other, 'symbol')).toHaveValue('BTC/USDT:USDT');
        await field(other, 'risk_amount').fill('9'); await expect(field(page, 'risk_amount')).toHaveValue('2');
        expect(failures.get(other)).toEqual([]);
    } finally { await other.close(); }
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    await page.reload(); await open(page);
    await expect(field(page, 'risk_amount')).toHaveValue('1'); await expect(field(page, 'timeframe')).toHaveValue('30m');
    await expect(page.getByTestId('order-reference')).toHaveJSProperty('open', true);
});

test('重置使用当前默认值且须确认，不覆盖已确认值和显示设置', async ({ page }) => {
    await page.goto('/?timeframes=4h,30m&order_panel_layout=inline&order_panel_inline_width=480&refresh_seconds=3600');
    await open(page); await expect(buy(page)).toBeEnabled();
    await field(page, 'risk_amount').fill('2'); await field(page, 'atr_period').fill('100'); await field(page, 'timeframe').selectOption('1h');
    await confirm(page).click(); await expect(buy(page)).toBeEnabled();
    await page.getByRole('button', { name: '重置默认值' }).click();
    await expect(field(page, 'risk_amount')).toHaveValue('1'); await expect(field(page, 'atr_period')).toHaveValue('14');
    await expect(field(page, 'timeframe')).toHaveValue('30m'); await expect(buy(page)).toBeDisabled();
    await cancel(page).click(); await expect(field(page, 'risk_amount')).toHaveValue('2'); await expect(field(page, 'atr_period')).toHaveValue('100');
    await page.getByRole('button', { name: '重置默认值' }).click(); await close(page); await open(page);
    await expect(field(page, 'risk_amount')).toHaveValue('1'); await expect(confirm(page)).toBeEnabled();
    await confirm(page).click(); await expect(buy(page)).toBeEnabled();
    expect(new URL(page.url()).searchParams.get('order_panel_layout')).toBe('inline');
    expect(new URL(page.url()).searchParams.get('order_panel_inline_width')).toBe('480');
    expect(new URL(page.url()).searchParams.has('risk_amount')).toBe(false);
});

test('悬浮与平铺切换复用窗口和画布，未确认参数与示例保留，不额外取行情', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    const history = (await (await request.get(fixture)).json()).reads;
    const metadata = (await data(request)).reads.filter((item: any) => item.method === 'fetch_market_info');
    const canvases = await page.locator('.crypto-chart canvas').elementHandles();
    const original = (await page.locator('.chart-area').boundingBox())!;
    const panelHandle = await panel(page).elementHandle();
    await field(page, 'risk_amount').fill('2.');
    await page.getByRole('button', { name: '切换为平铺' }).click();
    await expect(panel(page)).toHaveAttribute('data-layout', 'inline'); await expect(field(page, 'risk_amount')).toHaveValue('2.');
    await expect(confirm(page)).toBeEnabled(); await expect(buy(page)).toBeDisabled();
    const chart = (await page.locator('.chart-area').boundingBox())!, inline = (await panel(page).boundingBox())!;
    expect(chart.width + inline.width).toBeCloseTo(original.width, 1); expect(chart.x + chart.width).toBeCloseTo(inline.x, 1);
    await page.mouse.click(chart.x + 20, chart.y + 300); await expect(panel(page)).toBeVisible();
    await field(page, 'risk_amount').fill('2'); await confirm(page).click(); await expect(buy(page)).toBeEnabled();
    const example = page.getByRole('tabpanel', { name: '做多参考' }).locator('.example');
    await example.click(); await expect(example).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '切换为悬浮' }).click();
    await expect(panel(page)).toHaveAttribute('data-layout', 'floating'); await expect(example).toHaveAttribute('aria-pressed', 'true');
    expect(await panelHandle!.evaluate(node => node.isConnected)).toBe(true);
    expect((await page.locator('.chart-area').boundingBox())!.width).toBe(original.width);
    for (const canvas of canvases) expect(await canvas.evaluate(node => node.isConnected)).toBe(true);
    expect((await (await request.get(fixture)).json()).reads).toEqual(history);
    expect((await data(request)).reads.filter((item: any) => item.method === 'fetch_market_info')).toEqual(metadata);
    await page.getByRole('button', { name: '切换为平铺' }).click();
    await page.screenshot({ path: 'test-results/market-order-inline.png' });
    await close(page); expect((await page.locator('.chart-area').boundingBox())!.width).toBe(original.width);
    await open(page); await expect(panel(page)).toHaveAttribute('data-layout', 'inline');
    await expect(field(page, 'risk_amount')).toHaveValue('2'); await expect(example).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('tab', { name: '做多参考' }).focus(); await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '做空参考' })).toBeFocused();
    await close(page); await open(page);
    await expect(page.getByRole('tab', { name: '做空参考' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: '做空参考' })).toBeVisible();
});

test('两种宽度独立设置，URL 前后退与布局切换各取对应宽度；草稿保持，非法宽度不应用', async ({ page }) => {
    await page.goto('/?timeframes=30m&order_panel_inline_width=480&order_panel_floating_width=360&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    expect((await panel(page).boundingBox())!.width).toBe(360);
    await field(page, 'risk_amount').fill('3');
    await page.getByRole('button', { name: '切换为平铺' }).click();
    expect((await panel(page).boundingBox())!.width).toBe(480);
    await page.goBack(); await expect(panel(page)).toHaveAttribute('data-layout', 'floating');
    expect((await panel(page).boundingBox())!.width).toBe(360);
    await expect(field(page, 'risk_amount')).toHaveValue('3'); await expect(buy(page)).toBeDisabled();
    await page.goForward(); await expect(panel(page)).toHaveAttribute('data-layout', 'inline');
    await page.getByRole('button', { name: '展开看盘设置' }).click(); await expect(panel(page)).toBeVisible();
    await page.getByRole('combobox', { name: '下单面板布局' }).selectOption('floating');
    await page.getByRole('spinbutton', { name: '悬浮下单面板宽度（px）' }).fill('0');
    const original = page.url(); await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('下单面板宽度'); expect(page.url()).toBe(original);
    await page.getByRole('spinbutton', { name: '悬浮下单面板宽度（px）' }).fill('420');
    await page.getByRole('button', { name: '应用', exact: true }).click(); await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toHaveAttribute('data-layout', 'floating'); expect((await panel(page).boundingBox())!.width).toBe(420);
    await expect(field(page, 'risk_amount')).toHaveValue('3'); await expect(buy(page)).toBeDisabled();
    await page.goBack(); await expect(panel(page)).toHaveAttribute('data-layout', 'inline');
    expect((await panel(page).boundingBox())!.width).toBe(480); await expect(field(page, 'risk_amount')).toHaveValue('3');
    await page.goForward(); await expect(panel(page)).toHaveAttribute('data-layout', 'floating');
    await page.reload(); await open(page);
    expect((await panel(page).boundingBox())!.width).toBe(420); await expect(field(page, 'risk_amount')).toHaveValue('1');
});

test('四向按钮栏平铺位置和两种宽度正确，窄屏限制显示宽度但保留 URL 设定值', async ({ page }) => {
    for (const position of ['right', 'left', 'top', 'bottom']) {
        await page.goto(`/?timeframes=30m&dock_position=${position}&order_panel_layout=inline&order_panel_inline_width=420&order_panel_floating_width=300&refresh_seconds=3600`);
        await open(page); await expect(buy(page)).toBeEnabled();
        const chart = (await page.locator('.chart-area').boundingBox())!, order = (await panel(page).boundingBox())!;
        const bar = (await page.locator('.button-bar').boundingBox())!;
        expect(order.width).toBe(420); expect(order.height).toBe(chart.height); expect(order.y).toBe(chart.y);
        if (position === 'left') { expect(bar.x + bar.width).toBe(order.x); expect(order.x + order.width).toBe(chart.x); }
        else { expect(chart.x + chart.width).toBe(order.x); if (position === 'right') expect(order.x + order.width).toBe(bar.x); }
        await page.getByRole('button', { name: '切换为悬浮' }).click(); expect((await panel(page).boundingBox())!.width).toBe(300);
        await page.getByRole('button', { name: '切换为平铺' }).click(); expect((await panel(page).boundingBox())!.width).toBe(420);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await panel(page).boundingBox())!.width).toBeLessThan(390);
    expect((await page.locator('.chart-area').boundingBox())!.width).toBeGreaterThan(100);
    expect(new URL(page.url()).searchParams.get('order_panel_inline_width')).toBe('420');
    await expect.poll(() => panel(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('平铺切品种保持同一窗口与草稿，重启对应读取并清线，TQ 停读且可恢复 CCXT', async ({ page, request }) => {
    const hash = '#flat=true;binance,BTC/USDT:USDT;binance,ETH/USDT:USDT;tq,KQ.m@SHFE.rb;kraken,BTC/USD:USD';
    await page.goto('/?timeframes=30m&order_panel_layout=inline&refresh_seconds=3600' + hash);
    await open(page); await expect(buy(page)).toBeEnabled();
    const handle = await panel(page).elementHandle();
    await field(page, 'risk_amount').fill('2'); await confirm(page).click(); await expect(buy(page)).toBeEnabled();
    await page.getByRole('tabpanel', { name: '做多参考' }).getByRole('button', { name: '画线示例' }).click();
    await expect(page.getByRole('button', { name: '取消示例', exact: true })).toBeEnabled();
    const tickerCount = (await data(request)).reads.filter((item: any) => item.method === 'fetch_ticker').length;
    await request.post(orders, { data: { ticker_delay: 1200 } });
    await expect.poll(async () => (await data(request)).reads.filter((item: any) => item.method === 'fetch_ticker').length).toBeGreaterThan(tickerCount);
    await page.getByRole('button', { name: '自选 binance ETH/USDT:USDT', exact: true }).click();
    await expect(panel(page)).toBeVisible(); await expect(field(page, 'symbol')).toHaveValue('ETH/USDT:USDT');
    await expect(field(page, 'risk_amount')).toHaveValue('2'); await expect(buy(page)).toBeDisabled();
    await expect(buy(page)).toBeEnabled();
    await expect(page.getByRole('tabpanel', { name: '做多参考' })).toContainText('3000（最新成交）');
    await expect(page.getByRole('button', { name: '取消示例', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tabpanel', { name: '做多参考' }).getByRole('button', { name: '画线示例' })).toBeEnabled();
    const oldQuotes = (await data(request)).reads.filter((item: any) => item.method === 'fetch_ticker' && item.symbol === 'BTC/USDT:USDT');
    await request.post(orders, { data: { ticker_delay: 0 } });
    await page.waitForTimeout(1400);
    expect((await data(request)).reads.filter((item: any) => item.method === 'fetch_ticker' && item.symbol === 'BTC/USDT:USDT')).toEqual(oldQuotes);
    await expect(page.locator('.reference')).toContainText('ETH/USDT:USDT');
    await field(page, 'risk_amount').fill('3'); await field(page, 'atr_period').fill('');
    await page.getByRole('button', { name: '自选 binance BTC/USDT:USDT', exact: true }).click();
    await expect(panel(page)).toBeVisible(); await expect(field(page, 'symbol')).toHaveValue('BTC/USDT:USDT');
    await expect(field(page, 'risk_amount')).toHaveValue('3'); await expect(field(page, 'atr_period')).toHaveValue('');
    await expect(confirm(page)).toBeEnabled(); await expect(buy(page)).toBeDisabled();
    await cancel(page).click(); await expect(buy(page)).toBeEnabled(); await expect(field(page, 'risk_amount')).toHaveValue('2');
    await page.getByRole('button', { name: '自选 tq KQ.m@SHFE.rb', exact: true }).click();
    await expect(panel(page)).toContainText('待实现'); const paused = (await data(request)).reads.length;
    await page.waitForTimeout(1200); expect((await data(request)).reads).toHaveLength(paused);
    await page.getByRole('button', { name: '自选 kraken BTC/USD:USD', exact: true }).click();
    await expect(buy(page)).toBeEnabled(); await expect(panel(page).locator('p.identity').first()).toContainText('Kraken');
    await expect(field(page, 'symbol')).toHaveValue('BTC/USD:USD'); await expect(field(page, 'risk_amount')).toHaveValue('2');
    expect(await handle!.evaluate(node => node.isConnected)).toBe(true);
});

test('平铺与设置弹层共存，应用宽度或品种、取消及 Esc 均不收起面板', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&order_panel_layout=inline&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    const handle = await panel(page).elementHandle();
    await field(page, 'risk_amount').fill('2');
    const metadata = (await data(request)).reads.filter((item: any) => item.method === 'fetch_market_info');
    const settings = page.getByRole('dialog', { name: '看盘设置', exact: true });
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(settings).toBeVisible(); await expect(panel(page)).toBeVisible();
    await settings.getByRole('spinbutton', { name: '平铺下单面板宽度（px）' }).fill('480');
    await settings.getByRole('button', { name: '应用', exact: true }).click();
    await expect(settings).toHaveCount(0); await expect(panel(page)).toBeVisible();
    expect((await panel(page).boundingBox())!.width).toBe(480); await expect(field(page, 'risk_amount')).toHaveValue('2');
    expect((await data(request)).reads.filter((item: any) => item.method === 'fetch_market_info')).toEqual(metadata);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.screenshot({ path: 'test-results/market-inline-settings.png' });
    await page.keyboard.press('Escape'); await expect(settings).toHaveCount(0); await expect(panel(page)).toBeVisible();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await settings.getByRole('button', { name: '取消', exact: true }).click(); await expect(panel(page)).toBeVisible();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await settings.getByRole('textbox', { name: '品种', exact: true }).fill('ETH/USDT:USDT');
    await settings.getByRole('button', { name: '应用', exact: true }).click();
    await expect(settings).toHaveCount(0); await expect(field(page, 'symbol')).toHaveValue('ETH/USDT:USDT');
    await expect(field(page, 'risk_amount')).toHaveValue('2'); await expect(buy(page)).toBeDisabled();
    await expect(page.getByRole('tabpanel', { name: '做多参考' })).toContainText('3000（最新成交）');
    await confirm(page).click(); await expect(buy(page)).toBeEnabled();
    expect(await handle!.evaluate(node => node.isConnected)).toBe(true);
    await page.keyboard.press('Escape'); await expect(panel(page)).toHaveCount(0);
});
