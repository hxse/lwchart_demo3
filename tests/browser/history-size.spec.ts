import { test, expect } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('数量编辑不生效，应用后同步 URL 和取数，后退恢复且保留图表实例', async ({ page, request }) => {
    await page.goto('/?refresh_seconds=60');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__sizeCanvases = nodes; });
    const initial = page.url();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    const quantity = page.getByRole('spinbutton', { name: '历史 K 线数量', exact: true });
    await expect(quantity).toHaveValue('1000'); await expect(quantity).toHaveAttribute('max', '10000');
    await quantity.fill('500'); await page.waitForTimeout(350);
    expect(page.url()).toBe(initial);
    await expect(page.locator('.crypto-chart').first()).toHaveAttribute('data-bars', '1000');
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(4);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(quantity).toHaveValue('1000');
    await quantity.fill('500'); await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect.poll(() => page.locator('.crypto-chart').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-bars')))).toEqual(['500', '500', '500', '350']);
    expect(new URL(page.url()).searchParams.get('history_bars')).toBe('500');
    const metrics = await (await request.get(fixture)).json();
    expect(metrics.reads.map((r: any) => r.limit)).toEqual([1000, 1000, 1000, 1000, 500, 500, 500, 500]);
    await page.goBack();
    await expect.poll(() => page.locator('.crypto-chart').first().getAttribute('data-bars')).toBe('1000');
    expect(page.url()).toBe(initial);
    expect(await page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old = (window as any).__sizeCanvases as Element[];
        return old.length === nodes.length && old.every((node, index) => node === nodes[index] && node.isConnected);
    })).toBe(true);
});

test('请求 10000 的合法短响应仍显示，超限编辑在应用时拒绝且不取数', async ({ page, request }) => {
    await page.goto('/?timeframes=1w&history_bars=10000&refresh_seconds=60');
    const chart = page.locator('.crypto-chart');
    await expect(chart).toHaveAttribute('data-phase', 'ready'); await expect(chart).toHaveAttribute('data-bars', '350');
    const original = page.url();
    const before = await (await request.get(fixture)).json();
    expect(before.reads.map((r: any) => r.limit)).toEqual([10000]);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('spinbutton', { name: '历史 K 线数量', exact: true }).fill('10001');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('1..10000');
    expect(page.url()).toBe(original);
    expect((await (await request.get(fixture)).json()).reads).toEqual(before.reads);
    await expect(chart).toHaveAttribute('data-bars', '350');
});

test('超限 URL 在首次取数前失败，不静默夹到上限', async ({ page, request }) => {
    await page.goto('/?history_bars=10001');
    await expect(page.getByRole('alert')).toContainText('1..10000');
    expect((await (await request.get(fixture)).json()).reads).toEqual([]);
    await expect(page.locator('.crypto-chart')).toHaveCount(0);
});
