import { expect, test, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const failures = new WeakMap<Page, string[]>();
const settings = (page: Page) => page.getByRole('dialog', { name: '看盘设置', exact: true });
const toggle = (page: Page) => page.getByRole('button', { name: '展开看盘设置' });
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    failures.set(page, []); page.on('pageerror', error => failures.get(page)!.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        failures.get(page)!.push('测试访问外网'); return route.abort();
    });
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

test('恢复默认值重置完整设置草稿及错误，取消不提交，应用恢复 runtime 默认且保留自选', async ({ page, request }) => {
    const hash = '#flat=true;binance,ETH/USDT:USDT';
    await page.goto('/' + hash); await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    const defaults = page.url();
    await page.goto('/?source=tq&tq.symbol=KQ.m@DCE.i&ccxt.symbol=ETH/USDT:USDT&timeframes=1h&theme=light&dock_position=left'
        + '&main_pane_ratio=0.5&indicators=atr,30&chart.1.indicators=none&refresh_seconds=3600'
        + '&order_panel_layout=inline&order_panel_inline_width=480&order_panel_floating_width=360' + hash);
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(1);
    const original = page.url(), reads = (await (await request.get(fixture)).json()).reads;
    await toggle(page).click(); await settings(page).getByLabel('技术指标').fill('ema,0');
    await settings(page).getByRole('button', { name: '应用', exact: true }).click();
    await expect(settings(page).getByRole('alert')).toContainText('EMA 周期');
    await settings(page).getByRole('button', { name: '恢复默认值' }).click();
    await expect(settings(page).getByRole('alert')).toHaveCount(0);
    await expect(settings(page).getByRole('tab', { name: 'CCXT', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(settings(page).getByLabel('品种', { exact: true })).toHaveValue('BTC/USDT:USDT');
    for (const name of ['平铺下单面板宽度（px）', '悬浮下单面板宽度（px）']) await expect(settings(page).getByLabel(name)).toHaveValue('230');
    expect(page.url()).toBe(original); expect((await (await request.get(fixture)).json()).reads).toEqual(reads);
    await settings(page).getByRole('button', { name: '取消', exact: true }).click(); await toggle(page).click();
    await expect(settings(page).getByRole('tab', { name: 'TQ', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(settings(page).getByLabel('品种', { exact: true })).toHaveValue('KQ.m@DCE.i');
    await settings(page).getByRole('button', { name: '恢复默认值' }).click();
    await settings(page).getByRole('button', { name: '应用', exact: true }).click();
    await expect(settings(page)).toHaveCount(0); await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    expect(page.url()).toBe(defaults);
});

test('设置内部切 Tab 不误关闭，外部点击丢弃设置草稿并保留平铺下单面板', async ({ page }) => {
    await page.goto('/?timeframes=30m&order_panel_layout=inline&refresh_seconds=3600');
    await page.getByRole('button', { name: '展开下单面板' }).click();
    await page.locator('[name="order.risk_amount"]').fill('2');
    const original = page.url();
    await toggle(page).click(); await settings(page).getByLabel('主图占比').fill('0.4');
    await settings(page).getByRole('tab', { name: 'TQ', exact: true }).click();
    await expect(settings(page)).toBeVisible();
    await page.mouse.click(30, 300);
    await expect(settings(page)).toHaveCount(0); expect(page.url()).toBe(original);
    await expect(page.getByRole('dialog', { name: '下单面板', exact: true })).toBeVisible();
    await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2');
    await toggle(page).click();
    await expect(settings(page).getByRole('tab', { name: 'CCXT', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(settings(page).getByLabel('主图占比')).toHaveValue('0.7');
    await toggle(page).click(); await expect(settings(page)).toHaveCount(0);
    await toggle(page).click(); await expect(settings(page)).toBeVisible();
});
