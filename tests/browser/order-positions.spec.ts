import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture', orders = 'http://127.0.0.1:43175/__orders';
const errors = new WeakMap<Page, string[]>();
const metrics = async (request: APIRequestContext) => (await request.get(orders)).json();
const panel = (page: Page) => page.getByRole('dialog', { name: '下单面板', exact: true });
const confirmation = (page: Page) => page.getByRole('dialog', { name: '确认市价下单', exact: true });
const buy = (page: Page) => page.getByRole('button', { name: '做多 · 市价下单', exact: true });
const query = (page: Page) => panel(page).getByRole('button', { name: '查询持仓', exact: true });
const positionStatus = (page: Page) => panel(page).getByRole('status', { name: '当前账户仓位' });
function watchLookups(page: Page) {
    const requests: string[] = [], cancelled: string[] = [];
    page.on('request', req => { if (new URL(req.url()).pathname === '/api/ccxt/fetch_positions') requests.push(req.url()); });
    page.on('requestfailed', req => { if (new URL(req.url()).pathname === '/api/ccxt/fetch_positions') cancelled.push(req.url()); });
    return { requests, cancelled };
}
async function open(page: Page) {
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(buy(page)).toBeEnabled();
    await panel(page).getByRole('checkbox', { name: '空仓时清理只减仓条件单' }).uncheck();
    await panel(page).getByRole('checkbox', { name: '下单前自动查询' }).uncheck();
}
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        errors.get(page)!.push('测试访问外网'); return route.abort();
    });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('关闭两项偏好后仅手动单飞查询，确认框不展示持仓，纯查询不阻止确认且行情不自动重查', async ({ page, request }) => {
    const lookups = watchLookups(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page);
    await expect(query(page)).toBeEnabled(); await expect(positionStatus(page)).toHaveCount(0);
    await buy(page).click(); await expect(confirmation(page).getByRole('button', { name: '确认做多' })).toBeEnabled();
    expect(lookups.requests).toHaveLength(0);
    await confirmation(page).getByRole('button', { name: '取消下单' }).click();
    await request.post(orders, { data: { position_delay: 3000, positions: [
        { symbol: 'BTC/USDT:USDT', side: 'long', contracts: 0.12, entryPrice: 59000, hedged: false },
        { symbol: 'ETH/USDT:USDT', side: 'short', contracts: 99, entryPrice: 3000, hedged: false },
    ] } });
    await query(page).click(); await expect(positionStatus(page)).toHaveAttribute('data-state', 'loading');
    await expect(query(page)).toBeDisabled(); await query(page).evaluate(element => (element as HTMLButtonElement).click());
    await buy(page).click();
    await expect(confirmation(page).getByRole('status', { name: '当前账户仓位' })).toHaveCount(0);
    await expect(confirmation(page).getByRole('button', { name: '确认做多' })).toBeEnabled();
    expect(lookups.requests).toHaveLength(1);
    await confirmation(page).getByRole('button', { name: '取消下单' }).click();
    await expect(positionStatus(page)).toHaveAttribute('data-state', 'loading');
    await expect(positionStatus(page)).toHaveAttribute('data-state', 'held');
    await expect(positionStatus(page)).toContainText('多头'); await expect(positionStatus(page)).toContainText('合约数量 0.12');
    await expect(positionStatus(page)).toContainText('持仓均价 59000'); await expect(positionStatus(page)).not.toContainText('合约数量 99');
    await request.post(orders, { data: { position_delay: 0, positions: [{ symbol: 'BTC/USDT:USDT', side: 'short', contracts: 0.3, entryPrice: 61000 }] } });
    const quotes = (await metrics(request)).reads.filter((read: any) => read.method === 'fetch_ticker').length;
    await expect.poll(async () => (await metrics(request)).reads.filter((read: any) => read.method === 'fetch_ticker').length).toBeGreaterThan(quotes + 1);
    const refreshed = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/ccxt/fetch_market_info');
    await page.getByRole('button', { name: '强制刷新', exact: true }).click(); await refreshed;
    await page.getByRole('tab', { name: '做空参考' }).click();
    await page.getByRole('button', { name: '做空 · 市价下单' }).click();
    await expect(confirmation(page).getByRole('status', { name: '当前账户仓位' })).toHaveCount(0);
    await expect(confirmation(page)).not.toContainText('合约数量 0.12');
    await expect(confirmation(page).getByRole('button', { name: '确认做空' })).toBeEnabled();
    await confirmation(page).getByRole('button', { name: '取消下单' }).click();
    await expect(positionStatus(page)).toContainText('合约数量 0.12'); expect(lookups.requests).toHaveLength(1);
    await query(page).click(); await expect(positionStatus(page)).toContainText('合约数量 0.3');
    await expect(positionStatus(page)).toContainText('空头'); expect(lookups.requests).toHaveLength(2);
    await page.getByTestId('order-parameters').locator(':scope > summary').click();
    await positionStatus(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/market-order-existing-position.png' });
    await request.post(orders, { data: { positions: [{ symbol: 'BTC/USDT:USDT', side: 'long', contracts: 0, entryPrice: 0 }] } });
    await query(page).click(); await expect(positionStatus(page)).toHaveAttribute('data-state', 'flat');
    await expect(positionStatus(page)).toContainText('当前空仓'); expect(lookups.requests).toHaveLength(3);
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(query(page)).toBeEnabled();
    await expect(positionStatus(page)).toHaveCount(0); expect(lookups.requests).toHaveLength(3);
    expect((await metrics(request)).writes).toEqual([]);
});

test('手动查询的未知数量和失败不伪装空仓，失败不重试且不阻止用户确认交易', async ({ page, request }) => {
    const lookups = watchLookups(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page);
    await request.post(orders, { data: { positions: [{ symbol: 'BTC/USDT:USDT', side: 'long', contracts: null, entryPrice: null }] } });
    await query(page).click(); await expect(positionStatus(page)).toHaveAttribute('data-state', 'unknown');
    await expect(positionStatus(page)).toContainText('合约数量 未知'); await expect(positionStatus(page)).not.toContainText('当前空仓');
    await request.post(orders, { data: { scenario: 'positions-fail' } });
    await query(page).click(); await expect(positionStatus(page)).toHaveAttribute('data-state', 'unknown');
    await expect(positionStatus(page)).toContainText('持仓未能确认'); await expect(positionStatus(page)).not.toContainText('当前空仓');
    await expect(query(page)).toBeEnabled();
    const quotes = (await metrics(request)).reads.filter((read: any) => read.method === 'fetch_ticker').length;
    await expect.poll(async () => (await metrics(request)).reads.filter((read: any) => read.method === 'fetch_ticker').length).toBeGreaterThan(quotes + 1);
    await buy(page).click(); await expect(confirmation(page).getByRole('button', { name: '确认做多' })).toBeEnabled();
    await expect(confirmation(page).getByRole('status', { name: '当前账户仓位' })).toHaveCount(0);
    await expect(confirmation(page)).not.toContainText('持仓未能确认');
    expect((await metrics(request)).writes).toEqual([]);
    await confirmation(page).getByRole('button', { name: '确认做多' }).click();
    await expect(page.locator('[data-leg="entry"]')).toContainText('已成交');
    expect((await metrics(request)).writes).toHaveLength(3); expect(lookups.requests).toHaveLength(2);
});

test('关闭面板和切换完整身份取消查询并清空旧快照，新身份只在手动点击后读取', async ({ page, request }) => {
    const lookups = watchLookups(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600&order_panel_layout=inline'); await open(page);
    await request.post(orders, { data: { position_delay: 3000, positions: [{ symbol: 'BTC/USDT:USDT', side: 'long', contracts: 0.7, entryPrice: 59000 }] } });
    await query(page).click(); await expect(positionStatus(page)).toHaveAttribute('data-state', 'loading');
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    await expect.poll(() => lookups.cancelled.length).toBe(1);
    await request.post(orders, { data: { position_delay: 0 } }); await open(page);
    await expect(positionStatus(page)).toHaveCount(0); expect(lookups.requests).toHaveLength(1);
    await request.post(orders, { data: { position_delay: 3000 } });
    await query(page).click(); await expect(positionStatus(page)).toHaveAttribute('data-state', 'loading');
    await page.evaluate(() => {
        const url = new URL(location.href); url.searchParams.set('ccxt.symbol', 'ETH/USDT:USDT');
        history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect.poll(() => lookups.cancelled.length).toBe(2);
    await expect(panel(page)).toBeVisible(); await expect(positionStatus(page)).toHaveCount(0);
    await expect(page.locator('[name="order.symbol"]')).toHaveValue('ETH/USDT:USDT');
    expect(lookups.requests).toHaveLength(2);
    await request.post(orders, { data: { position_delay: 0, positions: [
        { symbol: 'ETH/USDT:USDT', side: 'short', contracts: 2, entryPrice: 3100, hedged: false },
        { symbol: 'BTC/USDT:USDT', side: 'long', contracts: 0.7, entryPrice: 59000, hedged: false },
    ] } });
    await query(page).click(); await expect(positionStatus(page)).toHaveAttribute('data-state', 'held');
    await expect(positionStatus(page)).toContainText('ETH/USDT:USDT'); await expect(positionStatus(page)).toContainText('合约数量 2');
    await page.waitForTimeout(3100);
    await expect(positionStatus(page)).not.toContainText('合约数量 0.7');
    await page.locator('[name="order.symbol"]').fill('BTC/USDT:USDT');
    await expect(query(page)).toBeDisabled();
    await page.getByRole('button', { name: '确认', exact: true }).click(); await expect(buy(page)).toBeEnabled();
    await expect(positionStatus(page)).toHaveCount(0); expect(lookups.requests).toHaveLength(3);
    await query(page).click(); await expect(positionStatus(page)).toContainText('合约数量 0.7');
    expect(lookups.requests.map(url => new URL(url).searchParams.get('symbol')))
        .toEqual(['BTC/USDT:USDT', 'BTC/USDT:USDT', 'ETH/USDT:USDT', 'BTC/USDT:USDT']);
    expect((await metrics(request)).writes).toEqual([]);
});
