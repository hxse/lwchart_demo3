import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture', orders = 'http://127.0.0.1:43175/__orders';
const failures = new WeakMap<Page, string[]>();
const metrics = async (request: APIRequestContext) => (await request.get(orders)).json();
const panel = (page: Page) => page.getByRole('dialog', { name: '下单面板', exact: true });
const confirmation = (page: Page) => page.getByRole('dialog', { name: '确认市价下单', exact: true });
const buy = (page: Page) => page.getByRole('button', { name: '做多 · 市价下单', exact: true });
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    failures.set(page, []); page.on('pageerror', error => failures.get(page)!.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        failures.get(page)!.push('测试访问外网'); return route.abort();
    });
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

test('多空均须确认，取消及 Esc 不写入；弹窗持续报价，最终确认只提交一次最新计划', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600&ccxt.is_live=false');
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(buy(page)).toBeEnabled();
    const sent: any[] = [];
    page.on('request', req => { if (req.url().endsWith('/api/ccxt/manual-order')) sent.push(req.postDataJSON()); });
    await buy(page).click();
    await expect(confirmation(page)).toContainText('模拟盘交易 · 做多');
    await expect(confirmation(page)).toContainText('Binance · BTC/USDT:USDT');
    await expect(confirmation(page).locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540 USDT');
    await expect(confirmation(page).locator('dt:has-text("预计止盈净收益") + dd')).toHaveText('0.7195392 USDT');
    expect(sent).toEqual([]); expect((await metrics(request)).writes).toEqual([]);
    await confirmation(page).getByRole('button', { name: '取消下单' }).click();
    await expect(confirmation(page)).toHaveCount(0); await expect(panel(page)).toBeVisible();
    await buy(page).click(); await page.keyboard.press('Escape');
    await expect(confirmation(page)).toHaveCount(0); await expect(panel(page)).toBeVisible();
    expect(sent).toEqual([]);
    await page.getByRole('tab', { name: '做空参考' }).click();
    await page.getByRole('button', { name: '做空 · 市价下单', exact: true }).click();
    await expect(confirmation(page)).toContainText('模拟盘交易 · 做空');
    await request.post(orders, { data: { price: 60020, entry_delay: 500 } });
    await expect(confirmation(page)).toContainText('60020 ／');
    await expect(confirmation(page).locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540.18 USDT');
    await expect(confirmation(page).locator('dt:has-text("预计止盈净收益") + dd')).toHaveText('0.7203168 USDT');
    expect(sent).toEqual([]); expect((await metrics(request)).writes).toEqual([]);
    await page.screenshot({ path: 'test-results/market-order-confirmation.png' });
    await confirmation(page).getByRole('button', { name: '确认做空', exact: true }).evaluate(element => {
        (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click();
    });
    await expect(confirmation(page)).toHaveCount(0);
    await expect(page.locator('[data-leg="entry"]')).toContainText('已成交');
    await expect(page.getByTestId('order-submitted-plan').locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540.18 USDT');
    await expect(page.getByTestId('order-submitted-plan').locator('dt:has-text("预计止盈净收益") + dd')).toHaveText('0.7203168 USDT');
    expect(sent).toHaveLength(1); expect(sent[0].side).toBe('sell'); expect(sent[0].is_live).toBe(false);
    expect(sent[0].quote_snapshot.ticker.last).toBe('60020');
    expect((await metrics(request)).writes.map((write: any) => write.body.side)).toEqual(['sell', 'buy', 'buy']);
});

test('Kraken 部分成交日志使用实际数量和 USD，行情更新、查询及重开保留原名义价值和收益', async ({ page, request }) => {
    await request.post(orders, { data: { scenario: 'partial' } });
    await page.goto('/?timeframes=30m&refresh_seconds=3600&ccxt.exchange_name=kraken&ccxt.symbol=BTC/USD:USD');
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(buy(page)).toBeEnabled();
    const reference = page.getByRole('tabpanel', { name: '做多参考' });
    await expect(reference.locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540 USD');
    await buy(page).click();
    await expect(confirmation(page).locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540 USD');
    await confirmation(page).getByRole('button', { name: '确认做多' }).click();
    await expect(page.locator('[data-leg="entry"]')).toContainText('部分成交');
    const summary = page.getByTestId('order-submitted-plan');
    await expect(summary.locator('dt:has-text("仓位名义价值") + dd')).toHaveText('240 USD');
    await expect(summary.locator('dt:has-text("预计止盈净收益") + dd')).toHaveText('0.3197952 USD');
    const original = await summary.textContent();
    await request.post(orders, { data: { price: 60020 } });
    await expect(reference.locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540.18 USD');
    await expect(summary).toHaveText(original!);
    await page.getByRole('button', { name: '查询结果', exact: true }).click();
    await expect(page.getByRole('button', { name: '查询结果', exact: true })).toBeEnabled();
    await expect(summary).toHaveText(original!);
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    await page.getByRole('button', { name: '展开下单面板' }).click();
    await expect(summary).toHaveText(original!);
    expect((await metrics(request)).writes).toHaveLength(3);
    for (const section of ['parameters', 'reference']) await page.getByTestId(`order-${section}`).locator(':scope > summary').click();
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/market-order-notional-result.png' });
});

test('确认期间报价失效禁用提交，恢复后可继续；切身份取消尚未提交的确认', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600&order_panel_layout=inline');
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(buy(page)).toBeEnabled();
    await buy(page).click(); await expect(confirmation(page)).toContainText('实盘交易 · 做多');
    await request.post(orders, { data: { scenario: 'quote-fail' } });
    await expect(confirmation(page).getByRole('button', { name: '确认做多' })).toBeDisabled();
    await expect(confirmation(page).getByRole('alert')).not.toBeEmpty();
    expect((await metrics(request)).writes).toEqual([]);
    await request.post(orders, { data: { scenario: 'ok' } });
    await expect(confirmation(page).getByRole('button', { name: '确认做多' })).toBeEnabled();
    await page.evaluate(() => {
        const url = new URL(location.href); url.searchParams.set('ccxt.symbol', 'ETH/USDT:USDT');
        history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(confirmation(page)).toHaveCount(0); await expect(panel(page)).toBeVisible();
    await expect(page.locator('[name="order.symbol"]')).toHaveValue('ETH/USDT:USDT');
    await expect(buy(page)).toBeEnabled(); expect((await metrics(request)).writes).toEqual([]);
});
