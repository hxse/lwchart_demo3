import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
    await request.post('http://127.0.0.1:43175/__fixture', { data: { reset: true } });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('裸地址与部分参数自动补全，实时预览不增加历史；非法值、取消及后退同步菜单', async ({ page }) => {
    await page.goto('/#watch');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    const original = page.url();
    const defaults = new URL(original);
    expect(defaults.searchParams.size).toBe(10);
    expect(defaults.searchParams.get('theme')).toBe('dark');
    expect(defaults.searchParams.get('timeframes')).toBe('30m,4h,1d,1w');
    expect(defaults.searchParams.get('indicators')).toBe('ema,14;ema,50;ema,100');
    expect(defaults.searchParams.get('refresh_seconds')).toBe('5');
    expect(defaults.searchParams.get('history_bars')).toBe('1500');
    expect(defaults.hash).toBe('#watch');
    const length = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('EMA 指标').fill('ema,5');
    await expect.poll(() => new URL(page.url()).searchParams.get('indicators')).toBe('ema,5');
    await expect(page.locator('.indicator-labels span')).toHaveCount(4);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(length);
    const valid = page.url();
    await page.getByLabel('EMA 指标').fill('ema,');
    await expect(page.getByRole('alert')).toContainText('EMA 周期');
    await page.waitForTimeout(300);
    expect(page.url()).toBe(valid);
    await expect(page.locator('.indicator-labels span').first()).toHaveText('EMA5');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(page.url()).toBe(original);
    await expect(page.locator('.indicator-labels span')).toHaveCount(12);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('更新间隔（秒）').fill('60');
    await expect.poll(() => new URL(page.url()).searchParams.get('refresh_seconds')).toBe('60');
    await page.getByRole('button', { name: '应用并更新 URL' }).click();
    expect(await page.evaluate(() => history.length)).toBe(length + 1);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('品种', { exact: true }).fill('ETH/USDT:USDT');
    await page.goBack();
    await expect(page.getByLabel('品种', { exact: true })).toHaveValue('BTC/USDT:USDT');
    await expect(page.getByLabel('更新间隔（秒）')).toHaveValue('5');
    await page.waitForTimeout(350);
    expect(page.url()).toBe(original);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/?timeframes=1h&indicators=none#one');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(1);
    const partial = new URL(page.url());
    expect(partial.searchParams.size).toBe(10);
    expect(partial.searchParams.get('layout')).toBe('1x1');
    expect(partial.searchParams.get('timeframes')).toBe('1h');
    expect(partial.searchParams.get('indicators')).toBe('none');
    expect(partial.hash).toBe('#one');
});

test('后退到无效 URL 时取消待提交文本，即使菜单回退默认值与原值相同', async ({ page }) => {
    await page.goto('/?password=PRIVATE_UNKNOWN');
    await expect(page.getByRole('alert')).toContainText('未知或重复参数');
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByRole('button', { name: '应用并更新 URL' }).click();
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    await page.getByRole('button', { name: '展开看盘设置' }).click();
    await page.getByLabel('品种', { exact: true }).fill('ETH/USDT:USDT');
    await page.goBack();
    await expect(page.getByRole('alert')).toContainText('未知或重复参数');
    await page.waitForTimeout(350);
    expect(new URL(page.url()).searchParams.get('password')).toBe('PRIVATE_UNKNOWN');
    await expect(page.locator('.crypto-chart')).toHaveCount(0);
    await expect(page.getByLabel('品种', { exact: true })).toHaveValue('BTC/USDT:USDT');
});

test('可见蜡烛 high／low 距边框约 3%，超出范围的 EMA 不撑大价格轴', async ({ page }) => {
    await page.goto('/?indicators=ema,1000&refresh_seconds=60');
    await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(4);
    await expect.poll(async () => page.locator('.crypto-chart').first().evaluate(panel => {
        const canvases = [...panel.querySelectorAll('canvas')].filter(canvas => canvas.clientWidth > 200 && canvas.clientHeight > 150);
        let top = Infinity; let bottom = -Infinity; let height = 0;
        for (const canvas of canvases) {
            const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
            height = canvas.height;
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                const offset = (y * canvas.width + x) * 4;
                const [r, g, b, a] = image.data.subarray(offset, offset + 4);
                const up = Math.abs(r! - 22) < 3 && Math.abs(g! - 160) < 3 && Math.abs(b! - 133) < 3;
                const down = Math.abs(r! - 231) < 3 && Math.abs(g! - 80) < 3 && Math.abs(b! - 90) < 3;
                if (a! > 240 && (up || down)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
            }
        }
        return Number.isFinite(top) && top / height > .015 && top / height < .055
            && (height - bottom) / height > .015 && (height - bottom) / height < .055;
    })).toBe(true);
    await page.screenshot({ path: 'test-results/crypto-tight-price-scale.png' });
});
