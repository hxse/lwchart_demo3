import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const errors = new WeakMap<Page, string[]>();
async function state(request: APIRequestContext, value?: Record<string, unknown>) {
    const response = value ? await request.post(fixture, { data: value }) : await request.get(fixture);
    return response.json();
}
async function ready(page: Page, count = 4) {
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(count);
    await expect(page.locator('.crypto-chart canvas').first()).toBeVisible();
}
async function rememberCharts(page: Page) {
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__chartCanvases = nodes; });
}
async function sameCharts(page: Page) {
    return page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old = (window as any).__chartCanvases as Element[];
        return old.length === nodes.length && old.every((node, i) => node === nodes[i] && node.isConnected);
    });
}

test.beforeEach(async ({ page, request }) => {
    await state(request, { reset: true });
    errors.set(page, []);
    page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (['127.0.0.1', 'localhost'].includes(url.hostname)) await route.continue();
        else { errors.get(page)!.push(`离线页面请求了外部主机：${url.hostname}`); await route.abort(); }
    });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('默认四周期全屏、EMA 颜色、菜单隐藏、更新保持图表实例', async ({ page, request }) => {
    await page.goto('/'); await ready(page);
    const charts = page.locator('.crypto-chart');
    expect(await charts.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-timeframe')))).toEqual(['30m', '4h', '1d', '1w']);
    expect(await charts.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-bars')))).toEqual(['1000', '1000', '1000', '350']);
    const bounds = await charts.evaluateAll(nodes => nodes.map(n => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
    expect(bounds).toEqual([
        { x: 0, y: 0, width: 639, height: 399 }, { x: 641, y: 0, width: 639, height: 399 },
        { x: 0, y: 401, width: 639, height: 399 }, { x: 641, y: 401, width: 639, height: 399 },
    ]);
    expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth, y: document.documentElement.scrollHeight }))).toEqual({ x: 1280, y: 800 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await charts.first().locator('.indicator-labels span').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).color))).toEqual(['rgb(255, 152, 0)', 'rgb(76, 175, 80)', 'rgb(33, 150, 243)']);
    await rememberCharts(page);
    const before = await state(request);
    expect(before.reads.filter((r: any) => r.history)).toHaveLength(4);
    expect(before.reads.every((r: any) => r.limit === 1000)).toBe(true);
    expect(before.logins).toBe(1);
    await state(request, { revision: 50 });
    await expect.poll(async () => (await state(request)).reads.filter((r: any) => !r.history).length, { timeout: 9000 }).toBeGreaterThanOrEqual(4);
    expect(await sameCharts(page)).toBe(true);
    const increments = (await state(request)).reads.filter((r: any) => !r.history);
    expect(increments.every((r: any) => r.limit === 5 && r.path === '/ccxt/fetch_ohlcv/latest-limit' && !r.keys.includes('since'))).toBe(true);
    await page.screenshot({ path: 'test-results/crypto-default.png' });
});

test('真实鼠标光标在多周期对应时间联动，离开清除', async ({ page }) => {
    await page.goto('/'); await ready(page);
    await page.mouse.move(390, 190);
    const source = page.locator('[data-slot="slot-0"]');
    await expect(source).not.toHaveAttribute('data-crosshair-time', '');
    const time = Number(await source.getAttribute('data-crosshair-time'));
    for (const [slot, seconds] of [[1, 14400], [2, 86400], [3, 604800]] as const) {
        const target = page.locator(`[data-slot="slot-${slot}"]`);
        await expect(target).not.toHaveAttribute('data-crosshair-time', '');
        const mapped = Number(await target.getAttribute('data-crosshair-time'));
        expect(mapped).toBeLessThanOrEqual(time);
        expect(time - mapped).toBeLessThan(seconds);
        await expect(target.locator('.chart-legend')).toBeVisible();
    }
    await page.mouse.move(1279, 0);
    await expect.poll(async () => page.locator('.crypto-chart').evaluateAll(nodes => nodes.every(n => n.getAttribute('data-crosshair-time') === ''))).toBe(true);
});

test('菜单覆盖不缩图，取消与非法输入不提交；EMA 和 URL 后退恢复', async ({ page, request }) => {
    await page.goto('/?refresh_seconds=60'); await ready(page);
    await rememberCharts(page);
    const original = page.url();
    const bounds = await page.locator('.crypto-chart').first().boundingBox();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '无指标', exact: true }).click();
    await expect(page.locator('.indicator-labels span')).toHaveCount(12);
    expect(page.url()).toBe(original);
    expect(await page.locator('.crypto-chart').first().boundingBox()).toEqual(bounds);
    expect(await sameCharts(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(page.url()).toBe(original);
    await expect(page.locator('.indicator-labels span')).toHaveCount(12);
    expect((await state(request)).reads.filter((r: any) => r.history)).toHaveLength(4);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('EMA 指标').fill('ema,0');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('EMA 周期');
    expect(page.url()).toBe(original); expect(await sameCharts(page)).toBe(true);
    await page.getByRole('button', { name: '无指标', exact: true }).click();
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.indicator-labels span')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('indicators')).toBe('none');
    expect(await sameCharts(page)).toBe(true);
    expect((await state(request)).reads.filter((r: any) => r.history)).toHaveLength(4);
    await page.goBack();
    await expect(page.locator('.indicator-labels span')).toHaveCount(12);
    expect(page.url()).toBe(original); expect(await sameCharts(page)).toBe(true);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('EMA 指标').fill('ema,5;ema,14;ema,50');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.indicator-labels span').first()).toHaveText('EMA5');
    expect(await sameCharts(page)).toBe(true);
});

test('单槽周期、品种与布局提交规范 URL，重复周期共用取数', async ({ page, request }) => {
    await page.goto('/?timeframes=30m,30m&indicators=none&refresh_seconds=60'); await ready(page, 2);
    expect((await state(request)).reads.filter((r: any) => r.history)).toHaveLength(1);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('品种', { exact: true }).fill('ETH/USDT:USDT');
    await page.getByRole('combobox', { name: '窗口 1', exact: true }).selectOption('15m');
    await page.getByRole('combobox', { name: '布局', exact: true }).selectOption('2x1');
    await page.getByRole('button', { name: '应用', exact: true }).click(); await ready(page, 2);
    const url = new URL(page.url());
    expect(url.searchParams.get('symbol')).toBe('ETH/USDT:USDT');
    expect(url.searchParams.get('timeframes')).toBe('15m,30m');
    expect(url.searchParams.get('layout')).toBe('2x1');
    expect(await page.locator('.crypto-chart').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-timeframe')))).toEqual(['15m', '30m']);
});

test('非法 URL 不取行情，菜单可恢复', async ({ page, request }) => {
    await page.goto('/?password=PRIVATE_UNKNOWN');
    await expect(page.getByRole('alert')).toContainText('未知或重复参数');
    expect((await state(request)).reads).toEqual([]);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('button', { name: '应用', exact: true }).click(); await ready(page);
    expect(page.url()).not.toContain('password');
});

test('单周期故障保留其它图，断开后重载；拖动历史后增量保持时间视口', async ({ page, request }) => {
    await page.goto('/?refresh_seconds=1'); await ready(page);
    await rememberCharts(page);
    await state(request, { errors: ['4h'] });
    await expect(page.locator('[data-timeframe="4h"]')).toHaveAttribute('data-phase', 'error');
    expect(await page.locator('.crypto-chart[data-phase="ready"]').count()).toBe(3);
    await state(request, { errors: [], advance: 27, delay: 80 });
    await expect.poll(async () => (await state(request)).reads.filter((r: any) => r.history && r.timeframe === '4h').length).toBe(2);
    await ready(page);
    expect(await sameCharts(page)).toBe(true);
    await page.mouse.move(350, 180); await page.mouse.down();
    await page.mouse.move(560, 180, { steps: 12 }); await page.mouse.up(); await page.mouse.move(350, 180);
    const source = page.locator('[data-slot="slot-0"]');
    await expect(source).not.toHaveAttribute('data-crosshair-time', '');
    const time = await source.getAttribute('data-crosshair-time');
    const count = (await state(request)).reads.length;
    await state(request, { advance: 29 });
    await expect.poll(async () => (await state(request)).reads.length).toBeGreaterThan(count + 3);
    await page.waitForTimeout(400);
    await page.mouse.move(349, 180); await page.mouse.move(350, 180);
    await expect(source).toHaveAttribute('data-crosshair-time', time!);
    expect(await sameCharts(page)).toBe(true);
});
