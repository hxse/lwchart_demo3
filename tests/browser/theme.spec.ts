import { test, expect, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    errors.set(page, []);
    page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function background(page: Page, theme: 'dark' | 'light') {
    await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.crypto-chart').first()).toHaveCSS('background-color', theme === 'dark' ? 'rgb(19, 23, 34)' : 'rgb(255, 255, 255)');
    // 读取实际画布，避免只验证 DOM 壳的配色而漏掉白色图表。
    await expect.poll(() => page.locator('.crypto-chart').evaluateAll((panels, selected) => {
        const expected = selected === 'dark' ? [19, 23, 34] : [255, 255, 255];
        return panels.every(panel => {
            const canvas = [...panel.querySelectorAll('canvas')].find(c => c.clientWidth > 200 && c.clientHeight > 150)!;
            const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
            let matches = 0; let samples = 0;
            for (let index = 0; index < pixels.length; index += 64) {
                samples++;
                if (pixels[index] === expected[0] && pixels[index + 1] === expected[1] && pixels[index + 2] === expected[2] && pixels[index + 3] === 255) matches++;
            }
            return matches / samples > .65;
        });
    }, theme)).toBe(true);
}

test('默认暗色，切换及取消／历史导航同步菜单、URL 和图例，保留图表与历史视口', async ({ page, request }) => {
    await page.goto('/?refresh_seconds=60');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    expect(new URL(page.url()).searchParams.get('theme')).toBe('dark');
    await background(page, 'dark');
    const original = page.url();
    const length = await page.evaluate(() => history.length);
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__themeCanvases = nodes; });
    await page.mouse.move(350, 180); await page.mouse.down();
    await page.mouse.move(550, 180, { steps: 10 }); await page.mouse.up();
    await page.mouse.move(350, 180);
    const source = page.locator('[data-slot="slot-0"]');
    await expect(source).not.toHaveAttribute('data-crosshair-time', '');
    const time = await source.getAttribute('data-crosshair-time');
    const value = source.locator('.chart-legend span').nth(1);
    await expect(value).toHaveCSS('color', 'rgb(209, 212, 220)');
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    const select = page.getByRole('combobox', { name: '主题', exact: true });
    await expect(select).toHaveValue('dark');
    await expect(page.getByLabel('品种', { exact: true })).toHaveCSS('background-color', 'rgb(19, 23, 34)');
    await page.screenshot({ path: 'test-results/crypto-dark-settings.png' });
    await select.selectOption('light');
    await background(page, 'dark');
    expect(page.url()).toBe(original);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await page.keyboard.press('Escape');
    await background(page, 'dark');
    expect(page.url()).toBe(original);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await select.selectOption('light');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await background(page, 'light');
    await page.mouse.move(350, 180);
    await expect(source).toHaveAttribute('data-crosshair-time', time!);
    await expect(value).toHaveCSS('color', 'rgb(37, 50, 71)');
    await page.screenshot({ path: 'test-results/crypto-light-settings.png' });
    expect(await page.evaluate(() => history.length)).toBe(length + 1);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.goBack();
    await background(page, 'dark');
    await expect(select).toHaveValue('dark');
    await page.goForward();
    await background(page, 'light');
    await expect(select).toHaveValue('light');
    await page.keyboard.press('Escape');
    await page.mouse.move(350, 180);
    await expect(source).toHaveAttribute('data-crosshair-time', time!);
    expect(await page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old = (window as any).__themeCanvases as Element[];
        return nodes.length === old.length && old.every((node, index) => node === nodes[index] && node.isConnected);
    })).toBe(true);
    expect((await (await request.get(fixture)).json()).reads.filter((r: any) => r.history)).toHaveLength(4);
});

test('浅色 URL 初始生效，切换暗色后仍继续增量更新而不重取历史', async ({ page, request }) => {
    await page.goto('/?theme=light&timeframes=30m&refresh_seconds=1');
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
    await background(page, 'light');
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await expect(page.getByRole('combobox', { name: '主题', exact: true })).toHaveValue('light');
    await page.getByRole('combobox', { name: '主题', exact: true }).selectOption('dark');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await background(page, 'dark');
    const before = (await (await request.get(fixture)).json()).reads.length;
    await request.post(fixture, { data: { revision: 40 } });
    await expect.poll(async () => (await (await request.get(fixture)).json()).reads.length).toBeGreaterThan(before);
    const after = await (await request.get(fixture)).json();
    expect(after.reads.filter((r: any) => r.history)).toHaveLength(1);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
});

test('无效主题 URL 在取数前失败，菜单可恢复为浅色', async ({ page, request }) => {
    for (const raw of ['auto', 'Dark', '']) {
        await page.goto(`/?theme=${raw}`);
        await expect(page.getByRole('alert')).toContainText(raw ? '主题必须是 dark 或 light' : 'URL 参数不能为空');
        await expect(page.locator('.crypto-chart')).toHaveCount(0);
        expect((await (await request.get(fixture)).json()).reads).toEqual([]);
    }
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('combobox', { name: '主题', exact: true }).selectOption('light');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    await background(page, 'light');
});
