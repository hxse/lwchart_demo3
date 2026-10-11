import { expect, test, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const colors = {
    dark: { line: 'rgb(42, 46, 57)', hover: 'rgb(54, 60, 78)' },
    light: { line: 'rgb(220, 226, 234)', hover: 'rgb(219, 226, 236)' },
};
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

function separators(page: Page) { return page.locator('.crypto-chart td[colspan="3"]'); }
function handle(page: Page) { return separators(page).first().locator('div[style*="position: absolute"]'); }
async function verifyColors(page: Page, theme: 'dark' | 'light') {
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', theme);
    await expect(separators(page)).toHaveCount(2);
    for (const separator of await separators(page).all()) await expect(separator).toHaveCSS('background-color', colors[theme].line);
    await handle(page).hover();
    await expect(handle(page)).toHaveCSS('background-color', colors[theme].hover);
    await page.mouse.move(5, 5);
}
async function heights(page: Page) {
    return page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const bounds = nodes.map(node => node.getBoundingClientRect()).filter(box => box.width > 300 && box.height > 30);
        return [...new Map(bounds.map(box => [box.top, box.height])).entries()].sort((a, b) => a[0] - b[0]).map(([, height]) => height);
    });
}

for (const initial of ['dark', 'light'] as const) test(`${initial} 初始分割线跟随主题，悬浮／拖拽及主题导航保留 Pane 布局`, async ({ page, request }) => {
    await page.goto(`/?theme=${initial}&timeframes=30m&refresh_seconds=60&indicators=rsi,14;macd,12,26,9`);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
    await verifyColors(page, initial);
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__separatorCanvases = nodes; });
    const before = await heights(page); expect(before).toHaveLength(3);
    const bounds = (await handle(page).boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 36, { steps: 6 });
    await page.mouse.up(); await page.mouse.move(5, 5);
    await expect.poll(async () => (await heights(page))[0]).toBeGreaterThan(before[0]!);
    const resized = await heights(page);
    expect(resized[1]).toBeLessThan(before[1]!);
    const target = initial === 'dark' ? 'light' : 'dark';
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('combobox', { name: '主题', exact: true }).selectOption(target);
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await verifyColors(page, target); expect(await heights(page)).toEqual(resized);
    await page.goBack(); await verifyColors(page, initial); expect(await heights(page)).toEqual(resized);
    await page.goForward(); await verifyColors(page, target); expect(await heights(page)).toEqual(resized);
    expect(await page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const previous = (window as any).__separatorCanvases as Element[];
        return nodes.length === previous.length && previous.every((node, index) => node === nodes[index] && node.isConnected);
    })).toBe(true);
    expect((await (await request.get(fixture)).json()).reads).toHaveLength(1);
});
