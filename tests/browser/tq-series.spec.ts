import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const errors = new WeakMap<Page, string[]>();
const main = 'KQ.m@SHFE.rb', index = 'KQ.i@SHFE.rb';
const menu = (page: Page) => page.getByRole('dialog', { name: '看盘设置' });
const choice = (page: Page, number: number) => menu(page).locator(`[name="chart.${number}.tq_series"]`);
const titles = (page: Page) => page.locator('.crypto-chart .caption strong');
const ready = (page: Page, count = 4) => expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(count);
const open = (page: Page) => page.getByRole('button', { name: '展开看盘设置' }).click();
const apply = (page: Page) => menu(page).getByRole('button', { name: '应用', exact: true }).click();
const reads = async (request: APIRequestContext) => (await (await request.get(fixture)).json()).reads;
async function remember(page: Page) {
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__tqSeriesCanvases = nodes; });
}
async function sameCanvases(page: Page) {
    expect(await page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old = (window as any).__tqSeriesCanvases as Element[];
        return old.length === nodes.length && old.every((node, i) => node === nodes[i] && node.isConnected);
    })).toBe(true);
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

test('TQ 设置按窗口显示，默认跟随；草稿取消不生效，应用只拉取改变身份的窗口并保持画布', async ({ page, request }) => {
    await page.goto('/?source=tq&refresh_seconds=3600'); await ready(page); await remember(page);
    await expect(titles(page)).toHaveText([main, main, main, main]); const original = page.url();
    await open(page);
    const fields = menu(page).getByRole('group', { name: '各窗口 TQ 品种形式' });
    await expect(fields.getByRole('combobox')).toHaveCount(4);
    await expect(fields.getByRole('combobox', { name: '窗口 2 · 4h', exact: true })).toHaveValue('inherit');
    await choice(page, 2).selectOption('index'); await choice(page, 4).selectOption('main');
    expect(page.url()).toBe(original); await expect(titles(page)).toHaveText([main, main, main, main]);
    await menu(page).getByRole('button', { name: '取消', exact: true }).click();
    expect(await reads(request)).toHaveLength(4);
    await open(page); await expect(choice(page, 2)).toHaveValue('inherit');
    await choice(page, 2).selectOption('index'); await choice(page, 4).selectOption('main'); await apply(page);
    await ready(page); await expect(titles(page)).toHaveText([main, index, main, main]); await sameCanvases(page);
    const params = new URL(page.url()).searchParams;
    expect(params.get('tq.symbol')).toBe(main); expect(params.get('chart.2.tq_series')).toBe('index');
    expect(params.get('chart.4.tq_series')).toBe('main'); expect(params.size).toBe(20);
    const actual = await reads(request);
    expect(actual).toHaveLength(5); expect(actual.at(-1)).toMatchObject({ source: 'tq', symbol: index, timeframe: '4h', path: '/tq/fetch_ohlcv' });
    expect(actual.every((read: any) => !read.keys.some((key: string) => key.includes('chart') || key.includes('series')))).toBe(true);
    await open(page); await expect(choice(page, 2)).toHaveValue('index');
    await page.screenshot({ path: 'test-results/tq-window-series-settings.png' });
});

test('URL 区分同周期主连／加权，切回可复用；前后退、刷新与恢复默认遵循完整设置', async ({ page, request }) => {
    await page.goto('/?source=tq&timeframes=30m,30m&refresh_seconds=3600&chart.2.tq_series=index'); await ready(page, 2);
    await expect(titles(page)).toHaveText([main, index]); expect(await reads(request)).toHaveLength(2); await remember(page);
    await open(page); await choice(page, 2).selectOption('inherit'); await apply(page);
    await expect(titles(page)).toHaveText([main, main]); await sameCanvases(page); expect(await reads(request)).toHaveLength(2);
    expect(new URL(page.url()).searchParams.has('chart.2.tq_series')).toBe(false);
    await page.goBack(); await ready(page, 2); await expect(titles(page)).toHaveText([main, index]);
    await page.goForward(); await expect(titles(page)).toHaveText([main, main]);
    await page.goBack(); await ready(page, 2); await page.reload(); await ready(page, 2);
    await expect(titles(page)).toHaveText([main, index]); await open(page); await expect(choice(page, 2)).toHaveValue('index');
    const original = page.url();
    await menu(page).getByRole('button', { name: '恢复默认值' }).click();
    await menu(page).getByRole('tab', { name: 'TQ', exact: true }).click();
    for (let n = 1; n <= 4; n++) await expect(choice(page, n)).toHaveValue('inherit');
    await menu(page).getByRole('button', { name: '取消', exact: true }).click(); expect(page.url()).toBe(original);
    await open(page); await menu(page).getByRole('button', { name: '恢复默认值' }).click();
    await menu(page).getByRole('tab', { name: 'TQ', exact: true }).click(); await apply(page); await ready(page);
    await expect(titles(page)).toHaveText([main, main, main, main]);
    expect([...new URL(page.url()).searchParams.keys()].some(key => key.endsWith('tq_series'))).toBe(false);
});

test('具体合约忽略选择且不重取行情，切回连续品种恢复选择，切来源保留形式并使用真实标题', async ({ page, request }) => {
    await page.goto('/?source=tq&tq.symbol=SHFE.rb2701&timeframes=30m,30m&refresh_seconds=3600&chart.1.tq_series=main&chart.2.tq_series=index');
    await ready(page, 2); await expect(titles(page)).toHaveText(['SHFE.rb2701', 'SHFE.rb2701']);
    expect(await reads(request)).toHaveLength(1); await remember(page); await open(page);
    await expect(menu(page)).toContainText('当前为具体合约，此设置不生效');
    await choice(page, 1).selectOption('index'); await choice(page, 2).selectOption('main'); await apply(page);
    expect(await reads(request)).toHaveLength(1); await sameCanvases(page);
    await open(page); await menu(page).locator('[name="tq.symbol"]').fill(index); await apply(page);
    await ready(page, 2); await expect(titles(page)).toHaveText([index, main]); await sameCanvases(page);
    expect((await reads(request)).map((r: any) => r.symbol)).toEqual(['SHFE.rb2701', index, main]);
    await open(page); await menu(page).getByRole('tab', { name: 'CCXT', exact: true }).click(); await apply(page);
    await ready(page, 2); await expect(titles(page)).toHaveText(['BTC/USDT:USDT', 'BTC/USDT:USDT']);
    expect(new URL(page.url()).searchParams.get('chart.1.tq_series')).toBe('index');
    await open(page); await menu(page).getByRole('tab', { name: 'TQ', exact: true }).click();
    await expect(choice(page, 1)).toHaveValue('index'); await expect(choice(page, 2)).toHaveValue('main');
    await apply(page); await ready(page, 2); await expect(titles(page)).toHaveText([index, main]);
});

test('窗口形式随位置而非周期，布局裁剪移除越界选择，新增窗口跟随且历史可恢复', async ({ page }) => {
    await page.goto('/?source=tq&refresh_seconds=3600&chart.1.tq_series=index&chart.4.tq_series=main'); await ready(page);
    await open(page);
    await menu(page).getByRole('tablist', { name: '图表窗口' }).getByRole('tab', { name: /^窗口 1 ·/ }).click();
    await menu(page).getByRole('combobox', { name: '周期', exact: true }).selectOption('1h');
    await expect(menu(page).getByRole('combobox', { name: '窗口 1 · 1h', exact: true })).toHaveValue('index');
    await menu(page).getByRole('combobox', { name: '布局', exact: true }).selectOption('1x1');
    await expect(choice(page, 4)).toHaveCount(0); await apply(page); await ready(page, 1);
    expect(new URL(page.url()).searchParams.get('chart.1.tq_series')).toBe('index');
    expect(new URL(page.url()).searchParams.has('chart.4.tq_series')).toBe(false);
    await open(page); await menu(page).getByRole('combobox', { name: '布局', exact: true }).selectOption('2x2');
    await expect(choice(page, 1)).toHaveValue('index');
    for (let n = 2; n <= 4; n++) await expect(choice(page, n)).toHaveValue('inherit');
    await apply(page); await ready(page); await expect(titles(page)).toHaveText([index, main, main, main]);
    await page.goBack(); await ready(page, 1); await page.goBack(); await ready(page);
    await open(page); await expect(choice(page, 4)).toHaveValue('main');
});

test('非法窗口键、越界及形式值在取数前拒绝，可用设置恢复', async ({ page, request }) => {
    for (const query of ['chart.0.tq_series=index', 'timeframes=30m&chart.2.tq_series=index', 'chart.1.tq_series=weighted']) {
        await page.goto('/?source=tq&' + query);
        await expect(page.getByRole('alert')).not.toBeEmpty(); await expect(page.locator('.crypto-chart')).toHaveCount(0);
        expect(await reads(request)).toEqual([]);
    }
    await open(page); await menu(page).getByRole('button', { name: '恢复默认值' }).click(); await apply(page); await ready(page);
    expect(new URL(page.url()).searchParams.has('chart.1.tq_series')).toBe(false);
});
