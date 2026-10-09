import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const failures = new WeakMap<Page, string[]>();
async function ready(page: Page) { await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(1); }
async function metrics(request: APIRequestContext) { return (await request.get(fixture)).json(); }
const buttons = '.button-bar > .toggle, .dock > .toggle, .flat-rail button';

test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    failures.set(page, []); page.on('pageerror', error => failures.get(page)!.push(error.message));
    await page.route('**/*', route => {
        const host = new URL(route.request().url()).hostname;
        if (host === '127.0.0.1') return route.continue();
        failures.get(page)!.push(`离线测试访问外网：${host}`); return route.abort();
    });
});
test.afterEach(async ({ page }) => { expect(failures.get(page)).toEqual([]); });

for (const position of ['top', 'bottom', 'left', 'right']) test(`${position} 按钮栏占位、统一尺寸及方向滚动，浮层不占位且不遮住栏首`, async ({ page }) => {
    const entries = ['binance,BTC/USDT:USDT', ...Array.from({ length: 79 }, (_, index) => `binance,COIN${index}/USDT:USDT`)].join(';');
    await page.goto(`/?timeframes=30m&refresh_seconds=3600&dock_position=${position}#flat=true;${entries}`); await ready(page);
    const bar = await page.locator('.button-bar').boundingBox(); const area = await page.locator('.chart-area').boundingBox();
    const vertical = position === 'left' || position === 'right';
    expect(bar).toEqual(vertical ? { x: position === 'right' ? 1238 : 0, y: 0, width: 42, height: 800 }
        : { x: 0, y: position === 'bottom' ? 758 : 0, width: 1280, height: 42 });
    expect(area).toEqual(vertical ? { x: position === 'left' ? 42 : 0, y: 0, width: 1238, height: 800 }
        : { x: 0, y: position === 'top' ? 42 : 0, width: 1280, height: 758 });
    expect(await page.locator('.crypto-chart').boundingBox()).toEqual(area);
    await expect(page.locator('.button-bar')).toHaveCSS('position', 'static');
    expect(await page.locator(buttons).evaluateAll(nodes => nodes.every(node => {
        const rect = node.getBoundingClientRect(); return rect.width === 32 && rect.height === 30 && getComputedStyle(node).position !== 'fixed';
    }))).toBe(true);
    const rail = page.locator('.flat-rail');
    await expect(rail).toHaveCSS('overflow-y', vertical ? 'auto' : 'hidden');
    await expect(rail).toHaveCSS('overflow-x', vertical ? 'hidden' : 'auto');
    expect(await rail.evaluate((node, vertical) => vertical ? node.scrollHeight > node.clientHeight : node.scrollWidth > node.clientWidth, vertical)).toBe(true);
    await expect(rail).toHaveCSS('scrollbar-width', 'thin');
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(page.locator('.menu')).toHaveCSS('position', 'fixed');
    await expect(page.getByRole('combobox', { name: '按钮栏位置', exact: true })).toHaveValue(position);
    const menu = await page.locator('.menu').boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0); expect(menu!.y).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(1280); expect(menu!.y + menu!.height).toBeLessThanOrEqual(800);
    if (position === 'right') expect(menu!.x + menu!.width).toBeLessThanOrEqual(bar!.x);
    else if (position === 'left') expect(menu!.x).toBeGreaterThanOrEqual(bar!.x + bar!.width);
    else if (position === 'top') expect(menu!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
    else expect(menu!.y + menu!.height).toBeLessThanOrEqual(bar!.y);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '展开自选列表', exact: true }).click();
    await expect(page.locator('.watch-panel')).toHaveCSS('position', 'fixed');
    expect(await page.locator('.chart-area').boundingBox()).toEqual(area);
    await page.getByRole('button', { name: '折叠自选列表' }).click();
    await page.screenshot({ path: `test-results/market-dock-${position}.png` });
});

test('位置草稿不生效、应用与后退同步，移动及 resize 保留画布和取数状态；悬浮控制仍可操作', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600#binance,BTC/USDT:USDT;tq,KQ.m@SHFE.rb'); await ready(page);
    const initial = page.url(); const before = await metrics(request);
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__dockCanvases = nodes; });
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('combobox', { name: '按钮栏位置', exact: true }).selectOption('left');
    expect(page.url()).toBe(initial); await expect(page.locator('.dashboard')).toHaveAttribute('data-dock', 'right');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(page.getByRole('combobox', { name: '按钮栏位置', exact: true })).toHaveValue('right');
    await page.getByRole('combobox', { name: '按钮栏位置', exact: true }).selectOption('bottom');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-dock', 'bottom');
    expect(new URL(page.url()).searchParams.get('dock_position')).toBe('bottom');
    expect(new URL(page.url()).hash).toBe(new URL(initial).hash);
    expect((await metrics(request)).reads).toEqual(before.reads);
    expect(await page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old = (window as any).__dockCanvases as Element[];
        return old.length === nodes.length && old.every((node, index) => node === nodes[index] && node.isConnected);
    })).toBe(true);
    await page.getByRole('button', { name: '展开自选列表', exact: true }).hover();
    await expect(page.locator('.shortcuts')).toHaveCSS('position', 'fixed');
    const toggle = await page.locator('.dock .toggle').boundingBox(); const controls = await page.locator('.shortcuts').boundingBox();
    expect(controls!.y + controls!.height).toBeLessThanOrEqual(toggle!.y);
    await page.getByRole('button', { name: '下一个自选', exact: true }).hover();
    await expect(page.locator('.shortcuts')).toHaveCSS('visibility', 'visible');
    await page.setViewportSize({ width: 360, height: 320 });
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    const menu = await page.locator('.menu').boundingBox();
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(360); expect(menu!.y + menu!.height).toBeLessThanOrEqual(320);
    await page.keyboard.press('Escape'); await page.goBack();
    await expect(page.locator('.dashboard')).toHaveAttribute('data-dock', 'right'); expect(page.url()).toBe(initial);
    expect((await metrics(request)).reads).toEqual(before.reads);
});

test('非法按钮栏 URL 在取数前拒绝，设置可恢复', async ({ page, request }) => {
    await page.goto('/?dock_position=center');
    await expect(page.getByRole('alert')).toContainText('按钮栏位置必须');
    expect((await metrics(request)).reads).toEqual([]);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    await expect(page.locator('.dashboard')).toHaveAttribute('data-dock', 'right');
});
