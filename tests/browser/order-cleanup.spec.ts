import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture', orders = 'http://127.0.0.1:43175/__orders';
const failures = new WeakMap<Page, string[]>();
const metrics = async (request: APIRequestContext) => (await request.get(orders)).json();
const panel = (page: Page) => page.getByRole('dialog', { name: '下单面板', exact: true });
const modal = (page: Page) => page.getByRole('dialog', { name: '确认市价下单', exact: true });
const buy = (page: Page) => panel(page).getByRole('button', { name: '做多 · 市价下单', exact: true });
const auto = (page: Page) => panel(page).getByRole('checkbox', { name: '下单前自动查询' });
const clean = (page: Page) => panel(page).getByRole('checkbox', { name: '空仓时清理只减仓条件单' });
const status = (page: Page) => panel(page).getByRole('status', { name: '当前账户仓位' });
const query = (page: Page) => panel(page).getByRole('button', { name: '查询并清理', exact: true });
const stop = (id = 'stop', patch: Record<string, unknown> = {}) => ({
    id, symbol: 'BTC/USDT:USDT', status: 'open', side: 'sell', type: 'stop_market', reduceOnly: true, triggerPrice: 59000, ...patch,
});
async function open(page: Page) {
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(buy(page)).toBeEnabled();
}
function watch(page: Page) {
    const actions: string[] = [];
    page.on('request', req => {
        const path = new URL(req.url()).pathname;
        if (['/api/ccxt/manual-order/cleanup', '/api/ccxt/fetch_positions'].includes(path)) actions.push(path);
    });
    return actions;
}
async function symbol(page: Page, value: string) {
    await page.evaluate(value => {
        const url = new URL(location.href); url.searchParams.set('ccxt.symbol', value);
        history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate'));
    }, value);
}
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    failures.set(page, []); page.on('pageerror', error => failures.get(page)!.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        failures.get(page)!.push('测试访问外网'); return route.abort();
    });
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

test('默认勾选且不在打开／刷新时执行；多空确认立即打开并显示持仓，持仓和开仓挂单均跳过清理', async ({ page, request }) => {
    const actions = watch(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page);
    await expect(clean(page)).toBeChecked(); await expect(auto(page)).toBeChecked(); expect(actions).toEqual([]);
    await clean(page).uncheck(); await clean(page).check();
    await page.getByRole('button', { name: '强制刷新', exact: true }).click();
    await expect(buy(page)).toBeEnabled(); expect(actions).toEqual([]);
    await request.post(orders, { data: { position_delay: 2000, positions: [{ symbol: 'BTC/USDT:USDT', side: 'short', contracts: 0.3, entryPrice: 61000 }] } });
    await buy(page).click();
    await expect(modal(page)).toBeVisible();
    const shown = modal(page).getByRole('status', { name: '当前账户仓位' });
    await expect(shown).toHaveAttribute('data-state', 'loading');
    await expect(modal(page).getByRole('button', { name: '确认做多' })).toBeDisabled();
    await expect(shown).toContainText('合约数量 0.3'); await expect(shown).toContainText('空头');
    await expect(shown).toContainText('当前仍有仓位，已跳过清理');
    await expect(modal(page).getByRole('button', { name: '确认做多' })).toBeEnabled();
    await modal(page).getByRole('button', { name: '取消下单' }).click();
    await request.post(orders, { data: { position_delay: 0, positions: [], open_orders: [stop(), stop('entry', { type: 'limit', triggerPrice: null, reduceOnly: false })] } });
    await page.getByRole('tab', { name: '做空参考' }).click(); await page.getByRole('button', { name: '做空 · 市价下单' }).click();
    await expect(shown).toContainText('存在开仓挂单，已跳过清理');
    await expect(modal(page).getByRole('button', { name: '确认做空' })).toBeEnabled();
    expect(actions).toEqual(Array(2).fill('/api/ccxt/manual-order/cleanup'));
    expect((await metrics(request)).writes).toEqual([]);
    await page.screenshot({ path: 'test-results/market-order-cleanup-skip.png' });
});

test('关闭自动查询后手动清理单飞，只撤条件只减仓，确认框不显示持仓且最终确认不再清理', async ({ page, request }) => {
    const actions = watch(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await auto(page).uncheck();
    await request.post(orders, { data: { positions: [], cancel_delay: 600, cancel_sparse: true,
        open_orders: [stop('stop'), stop('take', { type: 'take_profit_market', triggerPrice: 61000 }), stop('limit', { type: 'limit', triggerPrice: null })] } });
    await query(page).click(); await expect(query(page)).toBeDisabled();
    await query(page).evaluate(element => (element as HTMLButtonElement).click()); await expect(buy(page)).toBeDisabled();
    await expect(query(page)).toBeEnabled();
    await expect(status(page)).toContainText('已不在挂单列表，最终状态未确认');
    expect((await metrics(request)).writes.map((w: any) => [w.method, w.body.id])).toEqual([['cancel_order', 'stop'], ['cancel_order', 'take']]);
    await buy(page).click(); await expect(modal(page).getByRole('status', { name: '当前账户仓位' })).toHaveCount(0);
    await modal(page).getByRole('button', { name: '确认做多' }).click();
    await expect(page.locator('[data-leg="entry"]')).toContainText('已成交');
    expect(actions).toEqual(['/api/ccxt/manual-order/cleanup']); expect((await metrics(request)).writes).toHaveLength(5);
});

test('关闭清理后下单自动纯查询，不等待持仓也能确认，手动在途查询与确认框复用', async ({ page, request }) => {
    const actions = watch(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await clean(page).uncheck();
    await request.post(orders, { data: { position_delay: 2000 } });
    await panel(page).getByRole('button', { name: '查询持仓', exact: true }).click();
    await buy(page).click();
    await expect(modal(page).getByRole('status', { name: '当前账户仓位' })).toHaveAttribute('data-state', 'loading');
    await expect(modal(page).getByRole('button', { name: '确认做多' })).toBeEnabled();
    await modal(page).getByRole('button', { name: '确认做多' }).click();
    await expect(page.locator('[data-leg="entry"]')).toContainText('已成交');
    expect(actions).toEqual(['/api/ccxt/fetch_positions']);
    expect((await metrics(request)).writes.map((w: any) => w.method)).toEqual(['create_market_order', 'create_stop_market_order', 'create_take_profit_market_order']);
    await request.post(orders, { data: { position_delay: 0 } });
    await buy(page).click(); await expect(modal(page).getByRole('status', { name: '当前账户仓位' })).toContainText('已有仓位');
    expect(actions).toEqual(Array(2).fill('/api/ccxt/fetch_positions'));
});

test('清理中取消确认、关闭及切品种后继续并保留原身份，重新打开仍锁住开仓；偏好跨关闭和切换记住', async ({ page, request }) => {
    const actions = watch(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page);
    await request.post(orders, { data: { positions: [], open_orders: [stop()], cancel_delay: 3000 } });
    await buy(page).click();
    await expect.poll(async () => (await metrics(request)).writes.length).toBe(1);
    await modal(page).getByRole('button', { name: '取消下单' }).click();
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    await symbol(page, 'ETH/USDT:USDT');
    await page.getByRole('button', { name: '展开下单面板' }).click();
    await expect(page.locator('[name="order.symbol"]')).toHaveValue('ETH/USDT:USDT');
    await expect(status(page)).toContainText('BTC/USDT:USDT'); await expect(buy(page)).toBeDisabled();
    await expect(panel(page)).toContainText('以下为上次操作的品种');
    await expect(status(page)).toContainText('已确认取消'); await expect(buy(page)).toBeEnabled();
    await expect(status(page)).toContainText('取消下单不会恢复已撤条件单');
    expect(actions).toEqual(['/api/ccxt/manual-order/cleanup']);
    await clean(page).uncheck(); await auto(page).uncheck();
    await expect(panel(page).getByRole('button', { name: '确认', exact: true })).toBeDisabled();
    await page.locator('[name="order.risk_amount"]').fill('2');
    await page.getByRole('button', { name: '关闭下单面板' }).click(); await symbol(page, 'BTC/USDT:USDT');
    await page.getByRole('button', { name: '展开下单面板' }).click();
    await expect(clean(page)).not.toBeChecked(); await expect(auto(page)).not.toBeChecked();
    await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2');
    await expect(panel(page).getByRole('button', { name: '查询持仓', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '重置默认值', exact: true }).click();
    await expect(clean(page)).not.toBeChecked(); await expect(auto(page)).not.toBeChecked();
    expect(page.url()).not.toMatch(/cleanupOnQuery|inspectBeforeSubmit/);
    const another = await page.context().newPage();
    try {
        await another.goto(page.url()); await open(another);
        await expect(clean(another)).toBeChecked(); await expect(auto(another)).toBeChecked();
    } finally { await another.close(); }
    expect((await metrics(request)).writes).toHaveLength(1);
});

test('自动清理失败明确展示并解锁，不重试；用户仍可确认有效的新入场', async ({ page, request }) => {
    const actions = watch(page);
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page);
    await request.post(orders, { data: { positions: [], open_orders: [stop()], scenario: 'cancel-rejected' } });
    await buy(page).click();
    await expect(modal(page)).toContainText('撤单被拒绝'); await expect(modal(page)).toContainText('仍在挂单列表');
    await expect(modal(page).getByRole('button', { name: '确认做多' })).toBeEnabled();
    await modal(page).getByRole('button', { name: '确认做多' }).click();
    await expect(page.locator('[data-leg="entry"]')).toContainText('已成交');
    expect(actions).toEqual(['/api/ccxt/manual-order/cleanup']); expect((await metrics(request)).writes).toHaveLength(4);
});

test('开发和生产清理 POST 共用准入与实际撤单路径，不接受跨源、GET 或指定订单列表', async ({ request }) => {
    const identity = { exchange_name: 'binance', market: 'future', is_live: false, symbol: 'BTC/USDT:USDT' };
    for (const port of [43174, 43176]) {
        const origin = `http://127.0.0.1:${port}`, url = origin + '/api/ccxt/manual-order/cleanup';
        await request.post(orders, { data: { reset: true, open_orders: [stop()], positions: [] } });
        expect((await request.get(url)).status()).toBe(405);
        expect((await request.post(url, { headers: { Origin: 'http://untrusted' }, data: identity })).status()).toBe(403);
        expect((await request.post(url, { headers: { Origin: origin }, data: { ...identity, ids: ['stop'] } })).status()).toBe(400);
        expect((await metrics(request)).writes).toEqual([]);
        const reply = await request.post(url, { headers: { Origin: origin }, data: identity });
        expect(reply.status()).toBe(200); expect((await reply.json()).orders).toEqual([
            { id: 'stop', write_state: 'accepted', confirmation: 'canceled', error: null },
        ]);
        expect((await metrics(request)).writes.map((w: any) => w.body)).toEqual([{ ...identity, id: 'stop' }]);
    }
});
