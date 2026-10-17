import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { installTextRecorder } from '../fixtures/text-recording';

const fixture = 'http://127.0.0.1:43175/__fixture', orders = 'http://127.0.0.1:43175/__orders';
const hash = '#flat=true;binance,BTC/USDT:USDT;binance,ETH/USDT:USDT;kraken,BTC/USD:USD;tq,KQ.m@SHFE.rb';
const metrics = async (request: APIRequestContext) => (await request.get(orders)).json();
const failures = new WeakMap<Page, string[]>();
const panel = (page: Page) => page.getByRole('dialog', { name: '下单面板' });
const buy = (page: Page) => page.getByRole('button', { name: '做多 · 市价下单', exact: true });
const show = (page: Page, side = '做多参考') => page.getByRole('tabpanel', { name: side }).getByRole('button', { name: '画线示例', exact: true });
async function open(page: Page) { await page.getByRole('button', { name: '展开下单面板' }).click(); await expect(panel(page)).toBeVisible(); }
async function choose(page: Page, symbol: string, provider = 'binance') {
    await page.getByRole('button', { name: `自选 ${provider} ${symbol}`, exact: true }).click();
    await expect(panel(page)).toHaveCount(0); await open(page);
}
function frame() {
    return [...document.querySelectorAll('.crypto-chart')].map(chart => {
        const words = [...chart.querySelectorAll('canvas')].flatMap(canvas => window.textFrames.get(canvas) ?? []);
        // SDK 可能多次绘制同一标题；核对实际出现的角色，实例数由图表层测试独立保证。
        const labels = words.filter(word => /^[多空][入损盈] /.test(word.text));
        return { labels: [...new Set(labels.map(word => word.text.slice(0, 2)))].sort(),
            left: labels.every(word => word.x >= 0 && word.x < 20),
            prices: words.map(word => Number(word.text.replace(/^[多空][入损盈] /, '').replaceAll(',', ''))).filter(Number.isFinite) };
    });
}
async function lines(page: Page, direction: string | null, count = 1, roles = ['入', '损', '盈']) {
    const expected = direction ? roles.map(role => `${direction === '做多' ? '多' : '空'}${role}`).sort() : [];
    await expect.poll(async () => (await page.evaluate(frame)).map(chart => chart.labels)).toEqual(Array.from({ length: count }, () => expected));
    expect((await page.evaluate(frame)).every(chart => chart.left)).toBe(true);
}
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    failures.set(page, []); page.on('pageerror', error => failures.get(page)!.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        failures.get(page)!.push('测试访问外网'); return route.abort();
    });
    await page.addInitScript(installTextRecorder);
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

test('示例拆分按钮默认全选，逐线开关及时清线且不取数，选项随页面记忆但不自动开启示例', async ({ page, request }) => {
    await page.goto(`/?timeframes=30m&refresh_seconds=3600${hash}`); await open(page); await expect(show(page)).toBeEnabled();
    const history = (await (await request.get(fixture)).json()).reads;
    const metadata = (await metrics(request)).reads.filter((read: any) => read.method === 'fetch_market_info');
    const options = page.getByRole('button', { name: '示例线显示选项' });
    const profit = page.getByRole('checkbox', { name: '止盈线显示' }), stop = page.getByRole('checkbox', { name: '止损线显示' }), entry = page.getByRole('checkbox', { name: '仓位线显示' });
    await options.click(); for (const checkbox of [profit, stop, entry]) await expect(checkbox).toBeChecked();
    await show(page).click(); await lines(page, '做多'); await options.click();
    await profit.uncheck(); await lines(page, '做多', 1, ['入', '损']);
    await stop.uncheck(); await lines(page, '做多', 1, ['入']);
    await entry.uncheck(); await lines(page, null); await expect(options).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape'); await expect(options).toHaveAttribute('aria-expanded', 'false'); await expect(panel(page)).toBeVisible();
    await page.getByRole('button', { name: '取消示例', exact: true }).click(); await expect(show(page)).toBeDisabled();
    await options.click(); await entry.check(); await expect(show(page)).toBeEnabled(); await lines(page, null);
    await show(page).click(); await lines(page, '做多', 1, ['入']);
    await expect(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled();
    expect((await (await request.get(fixture)).json()).reads).toEqual(history);
    expect((await metrics(request)).reads.filter((read: any) => read.method === 'fetch_market_info')).toEqual(metadata);
    await options.click(); await page.screenshot({ path: 'test-results/market-order-line-options.png' });
    await page.getByRole('button', { name: '关闭下单面板' }).click(); await open(page); await expect(show(page)).toBeEnabled();
    await lines(page, null); await options.click();
    await expect(entry).toBeChecked(); await expect(stop).not.toBeChecked(); await expect(profit).not.toBeChecked();
    await choose(page, 'ETH/USDT:USDT'); await expect(show(page)).toBeEnabled(); await options.click();
    await expect(entry).toBeChecked(); await expect(stop).not.toBeChecked(); await expect(profit).not.toBeChecked(); await lines(page, null);
    await page.reload(); await open(page); await options.click();
    for (const checkbox of [profit, stop, entry]) await expect(checkbox).toBeChecked();
});

test('右栏切品种关闭窗口，重开恢复数值和待确认状态，取消保留新品种', async ({ page, request }) => {
    await page.goto(`/?timeframes=30m&refresh_seconds=3600${hash}`); await open(page); await expect(buy(page)).toBeEnabled();
    const dialogs: string[] = []; page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.locator('[name="order.risk_amount"]').fill('2');
    await page.locator('[name="order.atr_period"]').fill('20');
    await page.locator('[name="order.timeframe"]').selectOption('1h');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await choose(page, 'ETH/USDT:USDT'); await expect(buy(page)).toBeEnabled();
    await expect(page.locator('[name="order.symbol"]')).toHaveValue('ETH/USDT:USDT');
    await expect(page.locator('.reference')).toContainText('ETH/USDT:USDT · 1h');
    await expect(page.locator('[name="order.atr_period"]')).toHaveValue('20');
    await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2');
    await expect(page.getByRole('button', { name: '确认', exact: true })).toBeDisabled();
    await page.locator('[name="order.risk_amount"]').fill('3');
    await choose(page, 'BTC/USDT:USDT');
    await expect(page.locator('[name="order.symbol"]')).toHaveValue('BTC/USDT:USDT');
    await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('3');
    await expect(page.locator('.reference')).toContainText('BTC/USDT:USDT'); await expect(buy(page)).toBeDisabled();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('[name="order.symbol"]')).toHaveValue('BTC/USDT:USDT');
    await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2');
    await expect(show(page)).toBeEnabled(); expect(new URL(page.url()).searchParams.get('ccxt.symbol')).toBe('BTC/USDT:USDT');
    await page.locator('[name="order.risk_amount"]').fill('4'); await choose(page, 'BTC/USDT:USDT');
    await page.getByRole('button', { name: '确认', exact: true }).click(); await expect(show(page)).toBeEnabled();
    await expect(page.locator('.reference')).toContainText('BTC/USDT:USDT · 1h');
    expect(dialogs).toEqual([]); expect((await metrics(request)).writes).toEqual([]);
});

test('跨交易所和 TQ 同步完整身份，TQ 停止预览；执行中的旧订单和日志保留原品种', async ({ page, request }) => {
    await request.post(orders, { data: { entry_delay: 500 } });
    await page.goto(`/?timeframes=30m&refresh_seconds=3600${hash}`); await open(page); await expect(buy(page)).toBeEnabled();
    await buy(page).click(); await page.getByRole('button', { name: '确认做多', exact: true }).click(); await choose(page, 'ETH/USDT:USDT');
    await expect(page.locator('[data-leg="entry"]')).toContainText('已成交');
    await expect(page.getByRole('region', { name: '下单结果' })).toContainText('BTC/USDT:USDT');
    expect((await metrics(request)).writes.map((write: any) => write.body.symbol)).toEqual(Array(3).fill('BTC/USDT:USDT'));
    await choose(page, 'BTC/USD:USD', 'kraken'); await expect(buy(page)).toBeEnabled();
    await expect(panel(page).locator('p.identity').first()).toContainText('Kraken');
    await expect(page.locator('.reference')).toContainText('BTC/USD:USD'); await expect(show(page)).toBeEnabled();
    await page.locator('[name="order.risk_amount"]').fill('2');
    await choose(page, 'KQ.m@SHFE.rb', 'tq'); await expect(panel(page)).toContainText('待实现');
    const count = (await metrics(request)).reads.length;
    await page.waitForTimeout(1300); expect((await metrics(request)).reads).toHaveLength(count);
    await expect(page.getByRole('button', { name: '取消', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click(); await expect(panel(page)).toContainText('待实现');
    await expect(buy(page)).toHaveCount(0);
    await choose(page, 'BTC/USDT:USDT'); await expect(buy(page)).toBeEnabled();
    await expect(panel(page).locator('p.identity').first()).toContainText('Binance');
});

test('编辑中所有关闭入口直接收起并记住草稿，不再弹出关闭确认', async ({ page }) => {
    await page.goto(`/?timeframes=30m&refresh_seconds=3600${hash}`); await open(page); await expect(buy(page)).toBeEnabled();
    const dialogs: string[] = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.locator('[name="order.risk_amount"]').fill('2');
    await page.mouse.click(30, 300);
    await expect(panel(page)).toHaveCount(0); await open(page);
    await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2'); await expect(buy(page)).toBeDisabled();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(panel(page)).toHaveCount(0); await expect(page.getByRole('dialog', { name: '看盘设置' })).toBeVisible();
    await page.keyboard.press('Escape'); await open(page);
    await page.keyboard.press('Escape'); await expect(panel(page)).toHaveCount(0); await open(page);
    await choose(page, 'ETH/USDT:USDT'); await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2');
    await expect(buy(page)).toBeDisabled();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await page.mouse.click(30, 300); await expect(panel(page)).toHaveCount(0); await open(page);
    await expect(page.locator('[name="order.risk_amount"]')).toHaveValue('2'); await expect(buy(page)).toBeEnabled();
    expect(dialogs).toEqual([]);
});

test('真实四图示例跟随参考价，方向互斥，折叠保留，编辑／失败隐藏，取消和切品种结束示例', async ({ page, request }) => {
    await page.goto(`/?timeframes=30m,4h,1d,1w&indicators=none&refresh_seconds=3600${hash}`);
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    const history = (await (await request.get(fixture)).json()).reads;
    const canvases = await page.locator('.crypto-chart canvas').elementHandles();
    await open(page); await expect(show(page)).toBeEnabled();
    const count = (await metrics(request)).reads.filter((read: any) => read.method === 'fetch_market_info').length;
    await show(page).click(); await lines(page, '做多', 4);
    await expect(page.getByRole('button', { name: '取消示例', exact: true })).toHaveCount(1);
    await expect(show(page)).toHaveCount(0);
    await request.post(orders, { data: { price: 60020 } });
    await expect.poll(async () => (await page.evaluate(frame)).every(chart => chart.prices.includes(60020))).toBe(true);
    await page.getByRole('tab', { name: '做空参考' }).click(); await lines(page, null, 4);
    await show(page, '做空参考').click(); await lines(page, '做空', 4);
    await page.getByTestId('order-reference').locator(':scope > summary').click(); await lines(page, '做空', 4);
    await page.getByTestId('order-reference').locator(':scope > summary').click();
    await page.locator('[name="order.risk_amount"]').fill('2'); await lines(page, null, 4);
    await expect(page.getByRole('button', { name: '取消示例', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '取消', exact: true }).click(); await lines(page, '做空', 4);
    await request.post(orders, { data: { scenario: 'quote-fail' } }); await lines(page, null, 4);
    await request.post(orders, { data: { scenario: 'ok' } }); await lines(page, '做空', 4);
    expect((await (await request.get(fixture)).json()).reads).toEqual(history);
    expect((await metrics(request)).reads.filter((read: any) => read.method === 'fetch_market_info')).toHaveLength(count);
    for (const canvas of canvases) expect(await canvas.evaluate(node => node.isConnected)).toBe(true);
    await page.getByRole('button', { name: '取消示例', exact: true }).click(); await lines(page, null, 4);
    await expect(show(page, '做空参考')).toBeEnabled();
    await expect(page.getByRole('button', { name: '取消示例', exact: true })).toHaveCount(0);
    await page.waitForTimeout(1200); await lines(page, null, 4);
    await page.getByRole('tab', { name: '做多参考' }).click();
    await show(page).click(); await lines(page, '做多', 4);
    await choose(page, 'ETH/USDT:USDT'); await expect(show(page)).toBeEnabled(); await lines(page, null, 4);
    await show(page).click(); await lines(page, '做多', 4);
    await page.getByRole('button', { name: '关闭下单面板' }).click(); await lines(page, null, 4);
    await open(page); await expect(show(page)).toBeEnabled(); await lines(page, null, 4);
});

test('品种不匹配不能示例，下单点击立即结束示例且成交后不重新出现', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await open(page); await expect(show(page)).toBeEnabled();
    await page.locator('[name="order.symbol"]').fill('ETH/USDT:USDT');
    await page.getByRole('button', { name: '确认', exact: true }).click(); await expect(buy(page)).toBeEnabled();
    await expect(show(page)).toBeDisabled(); await lines(page, null);
    await page.locator('[name="order.symbol"]').fill('BTC/USDT:USDT');
    await page.getByRole('button', { name: '确认', exact: true }).click(); await expect(show(page)).toBeEnabled();
    await show(page).click(); await lines(page, '做多');
    await page.screenshot({ path: 'test-results/market-order-preview.png' });
    await request.post(orders, { data: { entry_delay: 700 } });
    await buy(page).click(); await page.getByRole('button', { name: '确认做多', exact: true }).click(); await lines(page, null);
    await expect(page.locator('[data-leg="entry"]')).toContainText('已成交');
    await expect(show(page)).toBeEnabled(); await lines(page, null);
    expect((await metrics(request)).writes).toHaveLength(3);
});
