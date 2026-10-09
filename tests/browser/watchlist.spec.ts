import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const mixed = '#binance,BTC/USDT:USDT;tq,KQ.m@SHFE.rb;kraken,ETH/USD';
const failures = new WeakMap<Page, string[]>();
async function metrics(request: APIRequestContext) { return (await request.get(fixture)).json(); }
async function ready(page: Page, count = 1) { await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(count); }
async function capture(page: Page) {
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__watchCanvases = nodes; });
}
async function sameCanvases(page: Page) {
    return page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const before = (window as any).__watchCanvases as Element[];
        return before.length === nodes.length && before.every((node, index) => node === nodes[index] && node.isConnected);
    });
}
async function openList(page: Page) { await page.getByRole('button', { name: '展开自选列表', exact: true }).click(); }
async function editList(page: Page) {
    if (!(await page.locator('.watch-panel').count())) await openList(page);
    await page.getByRole('button', { name: '编辑自选', exact: true }).click();
}

test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    failures.set(page, []);
    page.on('pageerror', error => failures.get(page)!.push(error.message));
    await page.route('**/*', route => {
        const host = new URL(route.request().url()).hostname;
        if (host === '127.0.0.1') return route.continue();
        failures.get(page)!.push(`离线测试访问外网：${host}`);
        return route.abort();
    });
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

test('面板默认未锁定，外部点击收起；锁定保留选择与外部点击，刷新复位且不改 URL', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600' + mixed); await ready(page);
    const initial = page.url(); const initialHistory = await page.evaluate(() => history.length);
    const before = await metrics(request);
    await openList(page);
    await expect(page.getByRole('button', { name: '锁定自选面板', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.click(300, 150);
    await expect(page.locator('.watch-panel')).toHaveCount(0);
    expect(page.url()).toBe(initial); expect((await metrics(request)).reads).toEqual(before.reads);
    await openList(page);
    await page.getByRole('button', { name: '锁定自选面板', exact: true }).click();
    await expect(page.getByRole('button', { name: '解锁自选面板', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).toBe(initial); expect(await page.evaluate(() => history.length)).toBe(initialHistory);
    await page.locator('.watch-panel .entry').nth(1).click(); await ready(page);
    expect(new URL(page.url()).searchParams.get('source')).toBe('tq');
    await expect(page.locator('.watch-panel')).toBeVisible();
    await page.mouse.click(300, 150); await expect(page.locator('.watch-panel')).toBeVisible();
    const selected = page.url(); const selectedHistory = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: '解锁自选面板', exact: true }).click();
    expect(page.url()).toBe(selected); expect(await page.evaluate(() => history.length)).toBe(selectedHistory);
    await page.mouse.click(300, 150); await expect(page.locator('.watch-panel')).toHaveCount(0);
    await openList(page); await page.getByRole('button', { name: '锁定自选面板', exact: true }).click();
    await page.getByRole('button', { name: '折叠自选列表' }).click(); await openList(page);
    await expect(page.getByRole('button', { name: '解锁自选面板', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload(); await ready(page); await openList(page);
    await expect(page.getByRole('button', { name: '锁定自选面板', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(page.url()).toBe(selected);
});

test('鼠标进入按钮才触发悬浮控制，附近保留，离开即隐藏且不受点击焦点影响', async ({ page }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600' + mixed); await ready(page);
    const button = await page.locator('.dock .toggle').boundingBox();
    await page.mouse.move(button!.x - 8, button!.y + 10);
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'hidden');
    await page.getByRole('button', { name: '展开自选列表', exact: true }).hover();
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'visible');
    await page.mouse.move(button!.x - 8, button!.y + 10);
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'visible');
    await page.getByRole('button', { name: '下一个自选', exact: true }).hover();
    await page.getByRole('button', { name: '下一个自选', exact: true }).click();
    await expect(page.getByRole('button', { name: '下一个自选', exact: true })).toBeFocused();
    const arrows = await page.locator('.shortcuts').boundingBox();
    await page.mouse.move(arrows!.x - 11, arrows!.y + arrows!.height / 2);
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'visible');
    await page.mouse.move(arrows!.x - 13, arrows!.y + arrows!.height / 2);
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'hidden');
    await expect(page.locator('.shortcuts')).toHaveCSS('pointer-events', 'none');
    await page.mouse.move(button!.x - 8, button!.y + 10);
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'hidden');
    await page.getByRole('button', { name: '展开自选列表', exact: true }).hover();
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'visible');
    await page.mouse.move(300, 150);
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'hidden');
    await page.getByRole('button', { name: '展开自选列表', exact: true }).hover();
    await page.mouse.move(1290, button!.y + 10);
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'hidden');
});

test('来源 Tab 保留双方草稿；应用投影当前来源，数量与公共参数保持', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&history_bars=1500&refresh_seconds=3600'); await ready(page);
    const original = page.url();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    for (const section of ['.source-section', '.common-fields']) {
        await expect(page.locator(section)).toHaveCSS('border-top-width', '1px');
        await expect(page.locator(section)).toHaveCSS('border-top-color', 'rgb(54, 60, 78)');
    }
    await page.screenshot({ path: 'test-results/market-settings-framed-dark.png' });
    await page.getByRole('combobox', { name: '市场', exact: true }).selectOption('spot');
    await page.getByRole('combobox', { name: '环境', exact: true }).selectOption('false');
    await page.getByLabel('品种', { exact: true }).fill('ETH/USDT');
    await page.getByRole('tab', { name: 'TQ', exact: true }).click();
    await expect(page.getByLabel('历史 K 线数量', { exact: true })).toHaveValue('1500');
    await page.getByLabel('品种', { exact: true }).fill('SHFE.rb2701');
    await page.getByRole('tab', { name: 'CCXT', exact: true }).click();
    await expect(page.getByLabel('品种', { exact: true })).toHaveValue('ETH/USDT');
    await expect(page.getByRole('combobox', { name: '市场', exact: true })).toHaveValue('spot');
    await expect(page.getByRole('combobox', { name: '环境', exact: true })).toHaveValue('false');
    expect(page.url()).toBe(original); expect((await metrics(request)).reads).toHaveLength(1);
    await page.getByRole('tab', { name: 'TQ', exact: true }).click();
    await expect(page.getByLabel('品种', { exact: true })).toHaveValue('SHFE.rb2701');
    await page.getByRole('button', { name: '应用', exact: true }).click(); await ready(page);
    const params = new URL(page.url()).searchParams;
    expect(params.get('source')).toBe('tq'); expect(params.get('tq.symbol')).toBe('SHFE.rb2701');
    expect(params.get('ccxt.symbol')).toBe('ETH/USDT'); expect(params.get('ccxt.is_live')).toBe('false');
    const reads = (await metrics(request)).reads;
    expect(reads.map((r: any) => r.limit)).toEqual([1500, 1500]);
    expect(reads[1].keys).not.toContain('market'); expect(reads[1].keys).not.toContain('is_live');
    await page.reload(); await ready(page);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('tab', { name: 'CCXT', exact: true }).click();
    await expect(page.getByLabel('品种', { exact: true })).toHaveValue('ETH/USDT');
    await page.keyboard.press('Escape'); expect(new URL(page.url()).searchParams.get('source')).toBe('tq');
});

test('悬浮控制保持可点击，跨来源列表选择保留 query 其它值与 hash；主题贴边尺寸', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&history_bars=1500&ccxt.is_live=false&refresh_seconds=3600' + mixed); await ready(page);
    const initial = new URL(page.url());
    await page.getByRole('button', { name: '展开自选列表', exact: true }).hover();
    await expect(page.locator('.shortcuts')).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: '下一个自选', exact: true }).hover();
    await expect(page.locator('.shortcuts')).toHaveCSS('pointer-events', 'auto');
    const toggle = await page.locator('.dock .toggle').boundingBox();
    const shortcuts = await page.locator('.shortcuts').boundingBox();
    expect(shortcuts!.y).toBeGreaterThanOrEqual(toggle!.y + toggle!.height);
    await page.getByRole('button', { name: '下一个自选', exact: true }).click(); await ready(page);
    let url = new URL(page.url());
    expect(url.hash).toBe(initial.hash); expect(url.searchParams.get('source')).toBe('tq');
    expect(url.searchParams.get('ccxt.is_live')).toBe('false'); expect(url.searchParams.get('history_bars')).toBe('1500');
    expect(url.searchParams.get('ccxt.symbol')).toBe('BTC/USDT:USDT');
    await openList(page);
    await expect(page.locator('.watch-panel')).toBeVisible();
    const bounds = await page.locator('.watch-panel').boundingBox();
    expect(bounds!.width).toBe(150); expect(bounds!.height).toBe(320);
    const bar = await page.locator('.button-bar').boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(bar!.x);
    expect(await page.locator('.watch-panel header').evaluate(header => header.scrollWidth <= header.clientWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '编辑自选', exact: true })).toHaveCSS('white-space', 'nowrap');
    await expect(page.locator('.watch-panel .entry').nth(1)).toHaveAttribute('aria-current', 'true');
    await page.locator('.watch-panel .entry').nth(2).click(); await ready(page);
    url = new URL(page.url());
    expect(url.searchParams.get('ccxt.exchange_name')).toBe('kraken'); expect(url.searchParams.get('ccxt.symbol')).toBe('ETH/USD');
    expect(url.searchParams.get('tq.symbol')).toBe('KQ.m@SHFE.rb'); expect(url.searchParams.get('ccxt.is_live')).toBe('false');
    await expect(page.locator('.watch-panel')).toHaveCount(0);
    await openList(page);
    const history = await page.evaluate(() => window.history.length);
    await page.locator('.watch-panel .entry').nth(2).click();
    expect(await page.evaluate(() => window.history.length)).toBe(history);
    await expect(page.locator('.watch-panel')).toHaveCount(0);
    await openList(page);
    expect((await metrics(request)).reads.map((r: any) => [r.source, r.limit])).toEqual([['ccxt', 1500], ['tq', 1500], ['ccxt', 1500]]);
    await page.screenshot({ path: 'test-results/market-watchlist-dark.png' });
    await page.getByRole('button', { name: '锁定自选面板', exact: true }).click();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('combobox', { name: '主题', exact: true }).selectOption('light');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.watch-panel')).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.98)');
    await page.screenshot({ path: 'test-results/market-watchlist-light.png' });
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    for (const section of ['.source-section', '.common-fields']) {
        await expect(page.locator(section)).toHaveCSS('border-top-width', '1px');
        await expect(page.locator(section)).toHaveCSS('border-top-color', 'rgb(219, 226, 236)');
    }
    await page.screenshot({ path: 'test-results/market-settings-framed-light.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '折叠自选列表' }).click();
    await expect(page.locator('.watch-panel')).toHaveCount(0);
});

test('展开与导航将当前项居中，首尾停在边界；未在列表中的下一项从第一项开始', async ({ page }) => {
    const hash = '#' + Array.from({ length: 40 }, (_, index) => `binance,ITEM${index}`).join(';');
    await page.goto('/?timeframes=30m&refresh_seconds=3600&ccxt.symbol=ITEM20' + hash); await ready(page);
    const scroll = () => page.locator('.watch-panel .list').evaluate(container => {
        const selected = container.querySelector('.entry.active')!;
        const rect = selected.getBoundingClientRect(); const list = container.getBoundingClientRect();
        return { center: Math.abs(rect.top + rect.height / 2 - list.top - list.height / 2),
            top: container.scrollTop, bottom: container.scrollHeight - container.clientHeight - container.scrollTop };
    });
    await openList(page);
    await expect.poll(async () => (await scroll()).center).toBeLessThan(1.5);
    await page.getByRole('button', { name: '列表下一个自选', exact: true }).click();
    await expect(page.locator('.watch-panel .entry.active')).toContainText('ITEM21');
    await expect.poll(async () => (await scroll()).center).toBeLessThan(1.5);
    await page.locator('.watch-panel .entry').first().click();
    await expect(page.locator('.watch-panel')).toHaveCount(0);
    await openList(page);
    await expect.poll(async () => (await scroll()).top).toBe(0);
    await page.locator('.watch-panel .entry').last().click();
    await expect(page.locator('.watch-panel')).toHaveCount(0);
    await openList(page);
    await expect.poll(async () => Math.abs((await scroll()).bottom)).toBeLessThan(1.5);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('品种', { exact: true }).fill('NOT_IN_LIST');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await openList(page);
    await expect(page.locator('.watch-panel .entry.active')).toHaveCount(0);
    await page.getByRole('button', { name: '展开自选列表', exact: true }).hover();
    await page.getByRole('button', { name: '下一个自选', exact: true }).click();
    expect(new URL(page.url()).searchParams.get('ccxt.symbol')).toBe('ITEM0');
    await expect(page.locator('.watch-panel .entry.active')).toContainText('ITEM0');
    await expect.poll(async () => (await scroll()).top).toBe(0);
});

test('独立编辑新增、上下排序、真实拖拽、删除；保存只改 hash，前后退无取数', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await ready(page); await capture(page);
    const initial = page.url(); const query = new URL(initial).search; const before = await metrics(request);
    await page.getByRole('button', { name: '新建自选', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑自选' })).toBeVisible();
    for (const [index, provider, symbol] of [[1, 'binance', 'BTC/USDT:USDT'], [2, 'tq', 'KQ.m@SHFE.rb'], [3, 'binance', 'ETH/USDT:USDT']] as const) {
        await page.getByRole('button', { name: '新增品种' }).click();
        await page.getByLabel(`第 ${index} 项来源`, { exact: true }).selectOption(provider);
        await page.getByLabel(`第 ${index} 项品种`, { exact: true }).fill(symbol);
    }
    await page.getByRole('button', { name: '下移第 1 项', exact: true }).click();
    await expect(page.getByLabel('第 1 项品种', { exact: true })).toHaveValue('KQ.m@SHFE.rb');
    await page.getByRole('button', { name: '拖拽第 3 项', exact: true }).dragTo(page.locator('[data-watch-row="0"]'));
    await expect(page.getByLabel('第 1 项品种', { exact: true })).toHaveValue('ETH/USDT:USDT');
    await page.getByRole('button', { name: '删除第 3 项', exact: true }).click();
    expect(page.url()).toBe(initial); expect((await metrics(request)).reads).toEqual(before.reads);
    await page.screenshot({ path: 'test-results/market-watchlist-editor.png' });
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    const saved = new URL(page.url());
    expect(saved.search).toBe(query); expect(decodeURIComponent(saved.hash)).toBe('#binance,ETH/USDT:USDT;tq,KQ.m@SHFE.rb');
    await expect(page.locator('.crypto-chart .caption strong')).toHaveText('BTC/USDT:USDT');
    expect(await sameCanvases(page)).toBe(true); expect((await metrics(request)).reads).toEqual(before.reads);
    await page.goBack(); await expect(page.getByRole('button', { name: '新建自选', exact: true })).toBeVisible();
    expect(page.url()).toBe(initial); expect(await sameCanvases(page)).toBe(true);
    await page.goForward(); await openList(page);
    await expect(page.locator('.watch-panel .entry')).toHaveCount(2);
    expect((await metrics(request)).reads).toEqual(before.reads);
    await page.getByRole('button', { name: '列表下一个自选', exact: true }).click(); await ready(page);
    expect(new URL(page.url()).searchParams.get('ccxt.symbol')).toBe('ETH/USDT:USDT');
});

test('编辑取消、无变化保存、hash 导航保留设置草稿；外部 hash 丢弃旧自选草稿', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600' + mixed); await ready(page); await capture(page);
    const initial = page.url(); const before = await metrics(request);
    await openList(page); await editList(page);
    await page.getByLabel('第 1 项品种', { exact: true }).fill('UNSAVED');
    await page.keyboard.press('Escape'); expect(page.url()).toBe(initial);
    await editList(page);
    await expect(page.getByLabel('第 1 项品种', { exact: true })).toHaveValue('BTC/USDT:USDT');
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    const canonical = page.url(); const history = await page.evaluate(() => window.history.length);
    await editList(page);
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    expect(page.url()).toBe(canonical); expect(await page.evaluate(() => window.history.length)).toBe(history);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('品种', { exact: true }).fill('UNSAVED_SETTINGS');
    await page.evaluate(() => { location.hash = '#tq,SHFE.rb2701'; });
    await expect(page.getByLabel('品种', { exact: true })).toHaveValue('UNSAVED_SETTINGS');
    await page.keyboard.press('Escape');
    await editList(page);
    await page.getByLabel('第 1 项品种', { exact: true }).fill('UNSAVED_LIST');
    await page.evaluate(() => { location.hash = '#tq,KQ.m@DCE.i'; });
    await expect(page.getByRole('dialog', { name: '编辑自选' })).toHaveCount(0);
    await openList(page);
    await expect(page.locator('.watch-panel .entry')).toContainText('KQ.m@DCE.i');
    expect(new URL(page.url()).search).toBe(new URL(initial).search);
    expect(await sameCanvases(page)).toBe(true); expect((await metrics(request)).reads).toEqual(before.reads);
});

test('超长手写 URL、设置提交及自选点击都弹窗；编辑缩短恢复，失败状态保持', async ({ page, request }) => {
    const alerts: string[] = [];
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await ready(page);
    const before = await metrics(request);
    await page.evaluate(() => { location.hash = Array.from({ length: 65 }, (_, i) => `tq,${String(i).padStart(3, '0')}${'A'.repeat(125)}`).join(';'); });
    await expect.poll(() => alerts.length).toBe(1);
    expect(alerts[0]).toContain('8192 字符上限'); const oversized = page.url();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('combobox', { name: '主题', exact: true }).selectOption('light');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect.poll(() => alerts.length).toBe(2);
    expect(page.url()).toBe(oversized); await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape'); await openList(page);
    await page.locator('.watch-panel .entry').first().click();
    await expect.poll(() => alerts.length).toBe(3); expect(page.url()).toBe(oversized);
    await editList(page);
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    await expect.poll(() => alerts.length).toBe(4);
    await expect(page.getByRole('dialog', { name: '编辑自选' })).toBeVisible();
    await expect(page.locator('[data-watch-row]')).toHaveCount(65); expect(page.url()).toBe(oversized);
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: '删除第 1 项', exact: true }).click();
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '编辑自选' })).toHaveCount(0);
    expect(page.url().length).toBeLessThanOrEqual(8192);
    expect(new URL(page.url()).search).toBe(new URL(oversized).search);
    expect((await metrics(request)).reads).toEqual(before.reads);
    await openList(page);
    await expect(page.locator('.watch-panel .list')).toHaveCSS('overflow-y', 'auto');
});

test('坏 hash 仅影响自选，可清空；旧裸 symbol 参数不再取行情', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600#tq,%'); await ready(page);
    const before = await metrics(request); await openList(page);
    await expect(page.locator('.watch-panel [role="alert"]')).toContainText('自选 URL 编码无效');
    await editList(page);
    await page.getByRole('button', { name: '新增品种' }).click();
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('品种');
    await page.getByRole('button', { name: '删除第 1 项', exact: true }).click();
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    expect(new URL(page.url()).hash).toBe(''); expect((await metrics(request)).reads).toEqual(before.reads);
    await request.post(fixture, { data: { reset: true } });
    await page.goto('/?symbol=BTC%2FUSDT%3AUSDT');
    await expect(page.getByRole('alert')).toContainText('未知或重复参数');
    expect((await metrics(request)).reads).toEqual([]);
});
