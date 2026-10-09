import { test, expect, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
test.use({ timezoneId: 'Asia/Shanghai' });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function remember(page: Page) { await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__tqCanvases = nodes; }); }
async function sameCharts(page: Page) {
    return page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old = (window as any).__tqCanvases as Element[];
        return old.length === nodes.length && old.every((node, index) => node === nodes[index] && node.isConnected);
    });
}

test('TQ 默认螺纹主连四周期、最新数量与图例；来源和品种只在应用后修改', async ({ page, request }) => {
    await page.goto('/?source=tq&refresh_seconds=1');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    expect(new URL(page.url()).searchParams.size).toBe(14);
    expect(new URL(page.url()).searchParams.get('tq.symbol')).toBe('KQ.m@SHFE.rb');
    await expect(page.locator('.crypto-chart .caption strong').first()).toHaveText('KQ.m@SHFE.rb');
    const before = await (await request.get(fixture)).json();
    expect(before.reads.filter((r: any) => r.history).map((r: any) => r.timeframe)).toEqual(['30m','4h','1d','1w']);
    expect(before.reads.every((r: any) => r.source === 'tq' && r.path === '/tq/fetch_ohlcv' && !r.keys.includes('is_live') && !r.keys.includes('since'))).toBe(true);
    await page.mouse.move(390, 190);
    await expect(page.locator('.legend-time').first()).toContainText('Asia/Shanghai');
    await expect(page.locator('.legend-volume').first()).toBeVisible();
    await remember(page);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(page.getByRole('combobox', { name: '交易所', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '环境', exact: true })).toHaveCount(0);
    const original = page.url();
    await page.getByLabel('品种', { exact: true }).fill('SHFE.rb2701');
    await page.getByRole('combobox', { name: '主题', exact: true }).selectOption('light');
    await page.waitForTimeout(350);
    expect(page.url()).toBe(original); await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    await expect(page.locator('.crypto-chart .caption strong').first()).toHaveText('SHFE.rb2701');
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'light');
    expect(await sameCharts(page)).toBe(true);
    await expect.poll(async () => (await (await request.get(fixture)).json()).reads.filter((r: any) => !r.history && r.source === 'tq').length).toBeGreaterThanOrEqual(4);
    await page.mouse.move(390, 190);
    await page.screenshot({ path: 'test-results/tq-default.png' });
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('tab', { name: 'CCXT', exact: true }).click();
    await expect(page.getByLabel('品种', { exact: true })).toHaveValue('BTC/USDT:USDT');
    await expect(page.getByRole('combobox', { name: '交易所', exact: true })).toHaveValue('binance');
    await expect(page.locator('.crypto-chart').first()).toHaveAttribute('data-source', 'tq');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.crypto-chart[data-source="ccxt"][data-phase="ready"]')).toHaveCount(4);
    expect(new URL(page.url()).searchParams.size).toBe(14); expect(await sameCharts(page)).toBe(true);
});

test('图例和光标时间按本地／UTC 显示，UTC 时间与视口保持，非法时区不提交', async ({ page, request }) => {
    await page.goto('/?source=tq&refresh_seconds=60');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    const chart = page.locator('[data-slot="slot-0"]');
    await expect(chart).toHaveAttribute('data-timezone', 'Asia/Shanghai');
    await remember(page); await page.mouse.move(390, 190);
    await expect(chart).not.toHaveAttribute('data-crosshair-time', '');
    const time = Number(await chart.getAttribute('data-crosshair-time'));
    await expect(chart.locator('.legend-time')).toContainText('Asia/Shanghai');
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    const original = page.url(); await page.getByLabel('显示时区', { exact: true }).fill('UTC');
    await page.waitForTimeout(350); expect(page.url()).toBe(original);
    await expect(chart).toHaveAttribute('data-timezone', 'Asia/Shanghai');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(chart).toHaveAttribute('data-timezone', 'UTC');
    await page.mouse.move(390, 190);
    await expect(chart).toHaveAttribute('data-crosshair-time', String(time));
    const expected = new Date(time * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await expect(chart.locator('.legend-time')).toHaveText(`T ${expected} · UTC`);
    expect(await sameCharts(page)).toBe(true);
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(4);
    await page.screenshot({ path: 'test-results/tq-utc-legend.png' });
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    const valid = page.url(); await page.getByLabel('显示时区', { exact: true }).fill('Invalid/Zone');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('显示时区'); expect(page.url()).toBe(valid);
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(4);
});

test('最近五根中的较旧蜡烛修正实际显示，保持画布且不重取历史', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&history_bars=100&refresh_seconds=1&timezone=UTC');
    const chart = page.locator('.crypto-chart');
    await expect(chart).toHaveAttribute('data-phase', 'ready'); await remember(page);
    const target = Date.UTC(2026, 9, 7, 11) / 1000;
    const bounds = await chart.boundingBox();
    let x = 0;
    for (let position = bounds!.width - 170; position < bounds!.width - 45; position += 2) {
        await page.mouse.move(position, 200);
        if (Number(await chart.getAttribute('data-crosshair-time')) === target) { x = position; break; }
    }
    expect(x).toBeGreaterThan(0);
    const close = chart.locator('.chart-legend .legend-item').first().locator('span').nth(7);
    const original = 60000 + 2997 * .8 + Math.sin(2997 / 13) * 130;
    await expect(close).toHaveText(original.toFixed(2));
    await request.post(fixture, { data: { correction: 40 } });
    await expect.poll(async () => {
        await page.mouse.move(x - 1, 200); await page.mouse.move(x, 200);
        return close.textContent();
    }).toBe((original + 40).toFixed(2));
    expect(await sameCharts(page)).toBe(true);
    expect((await (await request.get(fixture)).json()).reads.filter((r: any) => r.history)).toHaveLength(1);
    await expect(chart).toHaveAttribute('data-phase', 'ready');
});
