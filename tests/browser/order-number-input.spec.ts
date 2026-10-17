import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture', orders = 'http://127.0.0.1:43175/__orders';
const errors = new WeakMap<Page, string[]>();
const metrics = async (request: APIRequestContext) => (await request.get(orders)).json();
const panel = (page: Page) => page.getByRole('dialog', { name: '下单面板', exact: true });
const field = (page: Page, name: string) => page.locator(`[name="order.${name}"]`);
const arrow = (page: Page, name: string, direction: '增加' | '减少') => field(page, name).locator('..').getByRole('button', { name: new RegExp(`^${direction} `) });
const confirm = (page: Page) => page.getByRole('button', { name: '确认', exact: true });
const cancel = (page: Page) => page.getByRole('button', { name: '取消', exact: true });
const buy = (page: Page) => page.getByRole('button', { name: '做多 · 市价下单', exact: true });
async function open(page: Page) {
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(buy(page)).toBeEnabled();
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

test('六个数值参数共用紧凑箭头，按 1 精确微调，只改草稿且保留确认取消及重开记忆', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page);
    const originalUrl = page.url(), before = await metrics(request);
    const history = (await (await request.get(fixture)).json()).reads;
    await expect(panel(page).getByRole('spinbutton')).toHaveCount(6);
    await page.getByTestId('order-parameters').screenshot({ path: 'test-results/market-order-number-input-dark.png' });
    const defaults = { atr_period: 14, risk_amount: 1, atr_multiplier: 2, risk_tolerance: 5, atr_tolerance: 5, take_profit_multiplier: 2 };
    for (const [name, initial] of Object.entries(defaults)) {
        const control = (await field(page, name).boundingBox())!;
        const up = (await arrow(page, name, '增加').boundingBox())!, down = (await arrow(page, name, '减少').boundingBox())!;
        expect(control.width).toBeLessThanOrEqual(80); expect(control.height).toBe(26);
        expect(up.x + up.width).toBeLessThanOrEqual(control.x + control.width);
        expect(up.x).toBeGreaterThan(control.x + control.width / 2); expect(up.y + up.height).toBeLessThanOrEqual(down.y);
        await arrow(page, name, '增加').click(); await expect(field(page, name)).toHaveValue(String(initial + 1));
        await expect(field(page, name)).toBeFocused();
        await arrow(page, name, '减少').click(); await expect(field(page, name)).toHaveValue(String(initial));
    }
    await expect(buy(page)).toBeDisabled(); await expect(confirm(page)).toBeEnabled();
    await expect(page.getByRole('button', { name: '强制刷新', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '查询持仓', exact: true })).toBeDisabled();
    await field(page, 'risk_amount').fill('0.1234567890123456789');
    await arrow(page, 'risk_amount', '增加').click(); await expect(field(page, 'risk_amount')).toHaveValue('1.1234567890123456789');
    await field(page, 'risk_amount').press('ArrowDown'); await expect(field(page, 'risk_amount')).toHaveValue('0.1234567890123456789');
    await field(page, 'risk_amount').press('ArrowUp'); await expect(field(page, 'risk_amount')).toHaveValue('1.1234567890123456789');
    const after = await metrics(request);
    expect(after.reads.filter((read: any) => read.method !== 'fetch_ticker')).toEqual(before.reads.filter((read: any) => read.method !== 'fetch_ticker'));
    expect((await (await request.get(fixture)).json()).reads).toEqual(history); expect(after.writes).toEqual([]);
    await cancel(page).click(); await expect(field(page, 'risk_amount')).toHaveValue('1'); await expect(buy(page)).toBeEnabled();
    await arrow(page, 'risk_amount', '增加').click();
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    await page.getByRole('button', { name: '展开下单面板' }).click();
    await expect(field(page, 'risk_amount')).toHaveValue('2'); await expect(buy(page)).toBeDisabled();
    await confirm(page).click(); await expect(buy(page)).toBeEnabled();
    await expect(field(page, 'risk_amount')).toHaveValue('2'); expect(page.url()).toBe(originalUrl);
    expect((await metrics(request)).writes).toEqual([]);
});

test('滚轮只调当前聚焦数字框，未聚焦可正常滚动，聚焦微调不滚动面板且不拦截缩放', async ({ page }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600&order_panel_layout=inline'); await open(page);
    const risk = field(page, 'risk_amount'), atr = field(page, 'atr_period');
    const scroll = () => panel(page).evaluate(element => element.scrollTop);
    await risk.hover(); const unfocusedScroll = await scroll();
    await page.mouse.wheel(0, 100); await expect.poll(scroll).toBeGreaterThan(unfocusedScroll);
    await expect(risk).toHaveValue('1'); await expect(confirm(page)).toBeDisabled();
    await risk.fill('1.5'); await risk.hover(); await expect(risk).toBeFocused();
    const focusedScroll = await scroll();
    await page.mouse.wheel(0, -120); await expect(risk).toHaveValue('2.5');
    expect(await scroll()).toBe(focusedScroll);
    await page.mouse.wheel(0, 120); await expect(risk).toHaveValue('1.5');
    await page.mouse.wheel(0, -960); await expect(risk).toHaveValue('2.5');
    expect(await scroll()).toBe(focusedScroll);
    await atr.hover(); const otherScroll = await scroll();
    await page.mouse.wheel(0, 100); await expect.poll(scroll).toBeGreaterThan(otherScroll);
    await expect(atr).toHaveValue('14'); await expect(risk).toHaveValue('2.5');
    await field(page, 'atr_multiplier').click(); await risk.hover(); const blurredScroll = await scroll();
    await page.mouse.wheel(0, -100); await expect.poll(scroll).toBeLessThan(blurredScroll);
    await expect(risk).toHaveValue('2.5');
    await risk.click();
    const defaultsAllowed = await risk.evaluate(element => [
        { deltaY: -120, ctrlKey: true }, { deltaY: -120, shiftKey: true }, { deltaY: 0, deltaX: 120 },
    ].map(options => element.dispatchEvent(new WheelEvent('wheel', { ...options, bubbles: true, cancelable: true }))));
    expect(defaultsAllowed).toEqual([true, true, true]); await expect(risk).toHaveValue('2.5');
    await risk.press('Tab'); await expect(field(page, 'atr_multiplier')).toBeFocused();
    await expect(buy(page)).toBeDisabled();
});

test('空值及半输入不被微调覆盖，原始草稿保留；箭头产生的越界值仍由确认校验', async ({ page }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600&theme=light'); await open(page);
    const risk = field(page, 'risk_amount');
    await page.getByTestId('order-parameters').screenshot({ path: 'test-results/market-order-number-input-light.png' });
    for (const value of ['', '-', '1e', 'bad']) {
        await risk.fill(value); await expect(arrow(page, 'risk_amount', '增加')).toBeDisabled();
        await expect(arrow(page, 'risk_amount', '减少')).toBeDisabled();
        await risk.press('ArrowUp');
        await risk.dispatchEvent('wheel', { deltaY: -120 }); await expect(risk).toHaveValue(value);
    }
    await page.getByRole('button', { name: '关闭下单面板' }).click();
    await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(risk).toHaveValue('bad');
    await cancel(page).click(); await expect(risk).toHaveValue('1');
    await arrow(page, 'risk_amount', '减少').click(); await expect(risk).toHaveValue('0');
    await confirm(page).click(); await expect(panel(page).getByRole('alert')).toHaveText('风险金额 必须大于零');
    await expect(buy(page)).toBeDisabled();
    await arrow(page, 'risk_amount', '增加').click(); await expect(panel(page).getByRole('alert')).toHaveCount(0);
    await confirm(page).click(); await expect(buy(page)).toBeEnabled();
});
