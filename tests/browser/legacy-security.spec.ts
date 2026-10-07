import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('生产与 Vite 中间件共用 API，私有配置和 token 不进入浏览器', async ({ page, request }) => {
    const runtime = await (await request.get('/api/crypto/runtime')).text();
    expect(runtime).not.toMatch(/username|password|base_url|offline-jwt|OFFLINE_PRIVATE/);
    for (const path of ['/config.toml', '/config.toml.bak', '/.git/config', '/@fs' + resolve('config.toml')]) {
        expect((await request.get(path)).status()).toBe(404);
    }
    const dev = 'http://127.0.0.1:43176';
    await expect.poll(async () => { try { return (await request.get(`${dev}/api/crypto/runtime`)).status(); } catch { return 0; } }).toBe(200);
    expect(await (await request.get(`${dev}/api/crypto/runtime`)).text()).toBe(runtime);
    expect((await request.get(`${dev}/@fs${resolve('config.toml')}`)).status()).toBe(403);
    expect((await request.post('/api/ccxt/fetch_ohlcv/latest-limit')).status()).toBe(405);
    expect((await request.get('/api/ccxt/order')).status()).toBe(404);
    const requests: string[] = [];
    page.on('request', r => requests.push(r.url()));
    const dataResponse = page.waitForResponse(response => response.url().includes('/api/ccxt/fetch_ohlcv/') && response.status() === 200);
    await page.goto('/?timeframes=30m');
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
    expect(await (await dataResponse).headerValue('Server-Timing')).toMatch(/^upstream;dur=\d+\.\d{2}, local;dur=\d+\.\d{2}$/);
    expect(requests.some(url => url.includes('/auth/token') || url.includes('OFFLINE_PRIVATE'))).toBe(false);
    expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }))).toEqual({ local: {}, session: {}, cookies: '' });
    const script = page.locator('script[src]').first();
    const source = await (await request.get((await script.getAttribute('src'))!)).text();
    expect(source).not.toMatch(/OFFLINE_PRIVATE|offline-jwt/);
    const logs = await (await request.get('http://127.0.0.1:43175/__fixture')).json();
    expect(JSON.stringify(logs.logs)).not.toMatch(/OFFLINE_PRIVATE|offline-jwt/);
});

test('Notebook 原 UMD／ES 导出、ZIP 与回测图例继续工作，原网格同步', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
        if (new URL(route.request().url()).hostname === '127.0.0.1') await route.continue(); else await route.abort();
    });
    await page.goto('http://127.0.0.1:43175/legacy');
    await expect(page.locator('.chart-container')).toHaveCount(2);
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.locator('.chart-container').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await page.evaluate(() => Object.keys((window as any).ChartDashboardLib).sort())).toEqual(['default', 'mountDashboard']);
    const es = await (await request.get('http://127.0.0.1:43175/legacy-assets/chart-dashboard.es.js')).text();
    expect(es).toContain('mountDashboard');
    await page.waitForTimeout(500);
    const bounds = await page.locator('.chart-container').first().boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width * .55, bounds!.y + bounds!.height * .5);
    await expect(page.locator('.chart-legend').first()).toBeVisible();
    await expect(page.locator('.chart-legend').first().locator('span').nth(1)).toHaveCSS('color', 'rgb(34, 34, 34)');
    await expect(page.locator('.chart-legend').nth(1)).toBeVisible();
    // 样本风险线仅存在于单根进出场 K 线，移动到该根再验证图例。
    for (let x = 70; x < bounds!.width - 65; x += 4) {
        await page.mouse.move(bounds!.x + x, bounds!.y + bounds!.height * .5);
        if ((await page.locator('.chart-legend').first().textContent())?.includes('L-SL-PCT')) break;
    }
    await expect(page.locator('.chart-legend').first()).toContainText('L-SL-PCT');
    await expect(page.locator('.chart-legend').first()).toContainText('L-TP-PCT');
    await page.screenshot({ path: 'test-results/legacy-notebook.png' });
    expect(errors).toEqual([]);
});

test('旧浏览器入口的路由、ZIP 看图与 Parquet 表格在升级后可用', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('baseUrl', 'http://127.0.0.1:43175');
        localStorage.setItem('username', 'offline-user');
        localStorage.setItem('password', 'OFFLINE_PRIVATE_$()_MARKER');
    });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:43175/');
    await page.getByRole('button', { name: '图表看板', exact: true }).click();
    await page.locator('select').filter({ has: page.locator('option', { hasText: '选择 ZIP 文件...' }) }).selectOption('0');
    await expect(page.locator('.chart-container')).toHaveCount(2);
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.getByRole('button', { name: '表格', exact: true }).click();
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'samples/alltypes_plain.parquet' }) }).selectOption({ label: 'samples/alltypes_plain.parquet' });
    await expect(page.locator('.tabulator-row')).toHaveCount(8);
    await expect(page.locator('.tabulator-col-title', { hasText: /^id$/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/legacy-browser-parquet.png' });
    expect(errors).toEqual([]);
});
