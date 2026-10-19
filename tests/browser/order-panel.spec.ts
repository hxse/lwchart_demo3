import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const orders = 'http://127.0.0.1:43175/__orders';
const errors = new WeakMap<Page, string[]>();
const metrics = async (request: APIRequestContext) => (await request.get(orders)).json();
async function open(page: Page) {
    await page.getByRole('button', { name: '展开下单面板', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '下单面板' })).toBeVisible();
}
const buy = (page: Page) => page.getByRole('button', { name: '做多 · 市价下单', exact: true });
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        errors.get(page)!.push('测试访问了外网'); return route.abort();
    });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('默认最小周期、内部 Tab、多空含费预览；一秒 ticker 单飞且关闭停止', async ({ page, request }) => {
    await page.goto('/?timeframes=4h,30m,1d,1w&refresh_seconds=3600');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    const originalUrl = page.url();
    const before = (await (await request.get(fixture)).json()).reads;
    await open(page); await expect(buy(page)).toBeEnabled();
    const panel = page.getByRole('dialog', { name: '下单面板' });
    expect((await panel.boundingBox())!.width).toBe(230);
    expect(new URL(page.url()).searchParams.get('order_panel_floating_width')).toBe('230');
    const period = (await page.locator('[name="order.timeframe"]').boundingBox())!;
    const atr = (await page.locator('[name="order.atr_period"]').boundingBox())!;
    expect(period.y).toBe(atr.y); expect(period.x + period.width).toBeLessThan(atr.x);
    expect(atr.width).toBeLessThanOrEqual(80);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/market-order-parameters.png' });
    await expect(page.getByRole('tab', { name: '固定风险金额＋ATR' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[name="order.symbol"]')).toHaveValue('BTC/USDT:USDT');
    await expect(page.locator('[name="order.timeframe"]')).toHaveValue('30m');
    await expect(page.locator('[name="order.atr_period"]')).toHaveValue('14');
    await expect(page.locator('[name="order.take_profit_multiplier"]')).toHaveValue('2');
    await expect(page.getByRole('tab', { name: '做多参考' })).toHaveAttribute('aria-selected', 'true');
    const labels = ['参考入场', '合约数量', '基础币数量', '仓位名义价值', '价格风险', '开仓／止损费用', '金额／ATR 误差',
        '止损／止盈', '实际 ATR／止盈倍数', '预计含费风险', '预计止盈净收益'];
    await expect(page.getByRole('tabpanel', { name: '做多参考' }).locator('dt')).toHaveText(labels);
    await expect(page.getByRole('tabpanel', { name: '做多参考' }).locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540 USDT');
    await expect(page.getByRole('tabpanel', { name: '做空参考' })).toBeHidden();
    await page.getByRole('tab', { name: '做空参考' }).click();
    await expect(page.getByRole('tabpanel', { name: '做空参考' })).toContainText('预计含费风险');
    await expect(page.getByRole('tabpanel', { name: '做空参考' }).locator('dt')).toHaveText(labels);
    await expect(page.getByRole('tabpanel', { name: '做空参考' }).locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540 USDT');
    await expect(page.getByRole('tabpanel', { name: '做多参考' })).toBeHidden();
    await page.getByRole('tab', { name: '做多参考' }).click();
    expect((await (await request.get(fixture)).json()).reads).toEqual(before);
    await expect.poll(async () => (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_ticker').length).toBeGreaterThanOrEqual(2);
    const dataCount = (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_market_info').length;
    await page.locator('[name="order.risk_amount"]').fill('2');
    await expect(buy(page)).toBeDisabled(); await expect(page.getByText('参数有未确认的改动，请确认或取消；下单、强制刷新和查询暂不可用。')).toBeVisible();
    await page.getByRole('button', { name: '确认', exact: true }).click(); await expect(buy(page)).toBeEnabled();
    expect((await metrics(request)).reads.filter((r: any) => r.method === 'fetch_market_info')).toHaveLength(dataCount);
    expect((await (await request.get(fixture)).json()).reads).toEqual(before);
    expect(page.url()).toBe(originalUrl);
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    const closed = (await metrics(request)).reads.length;
    await page.waitForTimeout(2200);
    expect((await metrics(request)).reads).toHaveLength(closed);
    await open(page); await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2');
    await page.getByTestId('order-parameters').locator(':scope > summary').click();
    await page.screenshot({ path: 'test-results/market-order-panel.png' });
});

test('市价入场后双保护，单腿失败分别展示；关闭重开保留结果且只读查询不补单', async ({ page, request }) => {
    await request.post(orders, { data: { scenario: 'take-profit-rejected', entry_delay: 500 } });
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    await buy(page).click(); await page.getByRole('button', { name: '确认做多', exact: true }).click();
    await expect(buy(page)).toBeDisabled();
    await expect.poll(async () => (await metrics(request)).writes.length).toBe(1);
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    await expect.poll(async () => (await metrics(request)).writes.length).toBe(3);
    await open(page);
    const result = page.getByRole('region', { name: '下单结果' });
    await expect(result.locator('[data-leg="entry"]')).toContainText('已成交');
    await expect(result.locator('[data-leg="stop_loss"]')).toContainText('已挂单');
    await expect(result.locator('[data-leg="take_profit"]')).toContainText('失败');
    await expect(result.locator('dt:has-text("仓位名义价值") + dd')).toHaveText('540 USDT');
    await expect(result.locator('dt:has-text("预计止盈净收益") + dd')).toHaveText('0.7195392 USDT');
    await page.getByTestId('order-log').locator(':scope > summary').click(); await expect(result).toBeHidden();
    await page.getByTestId('order-log').locator(':scope > summary').click(); await expect(result.locator('[data-leg="entry"]')).toContainText('已成交');
    await page.getByRole('button', { name: '查询结果', exact: true }).click();
    await expect(page.getByRole('button', { name: '查询结果', exact: true })).toBeEnabled();
    expect((await metrics(request)).writes).toHaveLength(3);
    await page.screenshot({ path: 'test-results/market-order-result.png' });
});

test('用户改品种／周期可独立预览；TQ 空面板不发交易预览请求', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    const original = page.url();
    await page.locator('[name="order.symbol"]').fill('ETH/USDT:USDT');
    await page.locator('[name="order.timeframe"]').selectOption('1h');
    await page.locator('[name="order.atr_period"]').fill('20');
    await page.getByRole('button', { name: '确认', exact: true }).click(); await expect(buy(page)).toBeEnabled();
    await expect(page.locator('.reference')).toContainText('ETH/USDT:USDT · 1h');
    expect(page.url()).toBe(original);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(page.getByRole('dialog', { name: '下单面板' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/?source=tq&timeframes=30m&refresh_seconds=3600');
    const before = (await metrics(request)).reads.length;
    await open(page); await expect(page.getByRole('dialog', { name: '下单面板' })).toContainText('待实现');
    await page.waitForTimeout(1200);
    expect((await metrics(request)).reads).toHaveLength(before);
    await expect(buy(page)).toHaveCount(0);
});

test('生产和 Vite 使用相同 JSON POST、同源判断及拒单语义', async ({ page, request }) => {
    await request.post(orders, { data: { scenario: 'insufficient' } });
    await page.goto('http://127.0.0.1:43176/?timeframes=30m&refresh_seconds=3600');
    await open(page); await expect(buy(page)).toBeEnabled(); await buy(page).click(); await page.getByRole('button', { name: '确认做多', exact: true }).click();
    await expect(page.locator('[data-leg="entry"]')).toContainText('资金不足');
    await expect(page.getByTestId('order-submitted-plan')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '下单结果' })).toContainText('本轮暂无可用的成交估算');
    const writes = (await metrics(request)).writes;
    expect(writes).toHaveLength(1); expect(writes[0].body.reduceOnly).toBeUndefined();
    expect(writes[0].body.positionSide).toBe('BOTH');
    for (const port of [43174, 43176]) {
        const wrong = await request.post(`http://127.0.0.1:${port}/api/ccxt/manual-order`, { headers: { Origin: 'http://untrusted' }, data: {} });
        expect(wrong.status()).toBe(403);
        const forwarded = await request.post(`http://127.0.0.1:${port}/api/ccxt/manual-order`, {
            headers: { Host: '127.0.0.1:15174', Origin: 'http://127.0.0.1:15174' }, data: {},
        });
        expect(forwarded.status()).toBe(400);
    }
    expect((await metrics(request)).writes).toHaveLength(1);
});

test('四向按钮栏与明暗主题均可打开关闭浮层，锁定自选也与下单面板互斥', async ({ page }) => {
    for (const [position, theme] of [['top', 'light'], ['bottom', 'dark'], ['left', 'light'], ['right', 'dark']]) {
        await page.goto(`/?timeframes=30m&refresh_seconds=3600&dock_position=${position}&theme=${theme}#flat=true;binance,BTC/USDT:USDT`);
        expect(await page.locator('.button-bar > button, .dock > .toggle').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))))
            .toEqual(['展开看盘设置', '展开下单面板', '展开自选列表']);
        await page.getByRole('button', { name: '展开自选列表', exact: true }).click();
        await page.getByRole('button', { name: '锁定自选面板', exact: true }).click();
        await open(page); await expect(page.locator('.watch-panel')).toHaveCount(0);
        const panel = await page.getByRole('dialog', { name: '下单面板' }).boundingBox();
        expect(panel!.x).toBeGreaterThanOrEqual(0); expect(panel!.y).toBeGreaterThanOrEqual(0);
        expect(panel!.x + panel!.width).toBeLessThanOrEqual(1280); expect(panel!.y + panel!.height).toBeLessThanOrEqual(800);
        const toggle = await page.getByRole('button', { name: '展开下单面板' }).boundingBox();
        expect(toggle!.width).toBe(32); expect(toggle!.height).toBe(30);
        await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '下单面板' })).toHaveCount(0);
    }
});

test('生产交易超过默认十秒闲置时间仍返回完整三腿结果，各个上游请求不超过预算', async ({ page, request }) => {
    await request.post(orders, { data: { entry_delay: 6000, protection_delay: 6000 } });
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    const response = page.waitForResponse(reply => reply.url().endsWith('/api/ccxt/manual-order'));
    await buy(page).click(); await page.getByRole('button', { name: '确认做多', exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    const body = await result.json();
    expect(body.legs.entry.confirmation).toBe('filled');
    expect(body.legs.stop_loss.confirmation).toBe('open');
    expect(body.legs.take_profit.confirmation).toBe('open');
    expect((await metrics(request)).writes).toHaveLength(3);
});

test('编辑参数必须确认或取消，统一锁住下单、强制刷新及持仓和结果查询，取消还原整份已确认参数', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await expect(buy(page)).toBeEnabled();
    const confirm = page.getByRole('button', { name: '确认', exact: true });
    const cancel = page.getByRole('button', { name: '取消', exact: true });
    const refresh = page.getByRole('button', { name: '强制刷新', exact: true });
    const check = page.getByRole('button', { name: '查询结果', exact: true });
    const positions = page.getByRole('button', { name: '查询并清理', exact: true });
    const amount = page.locator('[name="order.risk_amount"]');
    const fields = () => page.locator('.order-panel form [name]').evaluateAll(elements =>
        Object.fromEntries(elements.map(element => [(element as HTMLInputElement).name, (element as HTMLInputElement).value])));
    await expect(confirm).toBeDisabled(); await expect(cancel).toBeDisabled();
    await amount.fill('2'); await confirm.click(); await expect(buy(page)).toBeEnabled();
    const applied = await fields();
    await buy(page).click(); await page.getByRole('button', { name: '确认做多', exact: true }).click(); await expect(check).toBeEnabled();
    const before = await metrics(request);
    const history = (await (await request.get(fixture)).json()).reads;
    const requests: string[] = [];
    page.on('request', req => { if (req.method() === 'POST') requests.push(req.url()); });
    await page.locator('[name="order.timeframe"]').selectOption('1h');
    await expect(refresh).toBeDisabled(); await expect(check).toBeDisabled(); await expect(buy(page)).toBeDisabled();
    await page.locator('[name="order.symbol"]').fill('ETH/USDT:USDT');
    await page.locator('[name="order.atr_period"]').fill('100');
    await amount.fill('3');
    await page.locator('[name="order.atr_multiplier"]').fill('3');
    await page.locator('[name="order.risk_tolerance"]').fill('6');
    await page.locator('[name="order.atr_tolerance"]').fill('7');
    await page.locator('[name="order.take_profit_multiplier"]').fill('3');
    await expect(page.locator('.reference')).toContainText('BTC/USDT:USDT · 30m');
    for (const button of [buy(page), refresh, check, positions]) {
        await expect(button).toBeDisabled(); await button.evaluate(element => (element as HTMLButtonElement).click());
    }
    await page.getByRole('tab', { name: '做空参考' }).click();
    await expect(page.getByRole('button', { name: '做空 · 市价下单', exact: true })).toBeDisabled();
    await page.getByRole('tab', { name: '做多参考' }).click();
    expect(requests).toEqual([]);
    await cancel.click(); expect(await fields()).toEqual(applied);
    await expect(positions).toBeEnabled();
    await expect(buy(page)).toBeEnabled(); await expect(check).toBeEnabled(); await expect(refresh).toBeEnabled();
    await amount.fill('0'); await confirm.click();
    await expect(page.getByRole('alert')).toHaveText('风险金额 必须大于零');
    await expect(buy(page)).toBeDisabled(); await expect(check).toBeDisabled(); await expect(refresh).toBeDisabled();
    await cancel.click(); await expect(page.getByRole('alert')).toHaveCount(0); await expect(amount).toHaveValue('2');
    await amount.fill('9'); await amount.fill('2');
    await expect(buy(page)).toBeDisabled(); await expect(confirm).toBeEnabled();
    await confirm.click(); await expect(buy(page)).toBeEnabled();
    expect((await metrics(request)).reads.filter((r: any) => r.method === 'fetch_market_info')).toEqual(before.reads.filter((r: any) => r.method === 'fetch_market_info'));
    expect((await (await request.get(fixture)).json()).reads).toEqual(history);
    await check.click(); await expect(check).toBeEnabled();
    expect(requests).toEqual([expect.stringContaining('/api/ccxt/manual-order/check')]);
    expect((await metrics(request)).writes).toHaveLength(3);
});

test('参数紧凑排列，三个区域独立折叠且不停止报价，窄屏无水平溢出', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600&order_panel_floating_width=560'); await open(page); await expect(buy(page)).toBeEnabled();
    const parameters = page.getByTestId('order-parameters'), reference = page.getByTestId('order-reference'), log = page.getByTestId('order-log');
    expect((await parameters.locator('form').boundingBox())!.height).toBeLessThan(160);
    for (const input of await parameters.locator('input[inputmode]').all()) expect((await input.boundingBox())!.width).toBeLessThanOrEqual(80);
    const referenceTop = (await reference.boundingBox())!.y;
    await parameters.locator('summary').click();
    await expect(page.locator('[name="order.symbol"]')).toBeHidden(); await expect(buy(page)).toBeVisible();
    expect((await reference.boundingBox())!.y).toBeLessThan(referenceTop);
    await reference.locator('summary').click(); await expect(buy(page)).toBeHidden();
    await expect(log.getByText('暂无下单记录。')).toBeVisible();
    await log.locator('summary').click(); await expect(log.getByText('暂无下单记录。')).toBeHidden();
    const count = (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_ticker').length;
    await expect.poll(async () => (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_ticker').length).toBeGreaterThan(count);
    await expect(page.getByTestId('order-quote-status')).toContainText('秒前更新');
    await parameters.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('[name="order.symbol"]')).toBeVisible();
    await page.locator('[name="order.risk_amount"]').fill('2'); await parameters.locator('summary').click();
    await expect(page.getByRole('status')).toContainText('参数有未确认的改动');
    await reference.locator('summary').click(); await expect(buy(page)).toBeDisabled();
    await parameters.locator('summary').click(); await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = page.getByRole('dialog', { name: '下单面板' });
    await expect.poll(async () => panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    for (const input of await parameters.locator('input,select').all()) {
        const field = (await input.boundingBox())!;
        expect(field.x).toBeGreaterThanOrEqual(bounds.x); expect(field.x + field.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    await page.screenshot({ path: 'test-results/market-order-panel-mobile.png' });
});

test('按钮旁显示最近成功报价年龄，强制刷新有冷却且自动报价不中断', async ({ page, request }) => {
    await request.post(orders, { data: { ticker_delay: 1200 } });
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page);
    const age = page.getByTestId('order-quote-status'), refresh = page.getByRole('button', { name: '强制刷新', exact: true });
    await expect(age).toContainText('尚未成功刷新'); await expect(buy(page)).toBeEnabled();
    await expect(age).toContainText('0 秒前更新');
    await request.post(orders, { data: { ticker_delay: 0 } });
    const dataCount = (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_market_info').length;
    await refresh.click(); await expect(refresh).toBeDisabled();
    await expect(refresh).toHaveText(/强制刷新（[1-5]s）/);
    for (let i = 0; i < 5; i++) await refresh.evaluate(element => (element as HTMLButtonElement).click());
    await expect.poll(async () => (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_market_info').length).toBe(dataCount + 1);
    const quotes = (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_ticker').length;
    await expect.poll(async () => (await metrics(request)).reads.filter((r: any) => r.method === 'fetch_ticker').length).toBeGreaterThan(quotes);
    await expect(refresh).toBeDisabled();
    await expect(refresh).toBeEnabled({ timeout: 7000 });
    await request.post(orders, { data: { scenario: 'quote-fail' } });
    await expect(age).toContainText('报价不可用');
    await expect(age).toHaveText(/ticker：[2-9]\d* 秒前更新 · 报价不可用/);
    await expect(buy(page)).toBeDisabled();
    await request.post(orders, { data: { scenario: 'ok' } });
    await refresh.click(); await expect(age).toContainText('0 秒前更新');
    await expect(buy(page)).toBeEnabled(); await expect(refresh).toBeDisabled();
    expect((await metrics(request)).reads.filter((r: any) => r.method === 'fetch_market_info')).toHaveLength(dataCount + 2);
});
