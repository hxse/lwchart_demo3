import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const fixture = 'http://127.0.0.1:43175/__fixture';
const mixed = '#binance,BTC/USDT:USDT;kraken,ETH/USD;tq,KQ.m@SHFE.rb';
const failures = new WeakMap<Page, string[]>();
async function ready(page: Page) { await expect(page.locator('.crypto-chart[data-phase="ready"]')).toHaveCount(1); }
async function metrics(request: APIRequestContext) { return (await request.get(fixture)).json(); }
async function openList(page: Page) { await page.getByRole('button', { name: '展开自选列表', exact: true }).click(); }

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

test('平铺默认关闭；开关只改 hash，原按钮不移动，前后退及书签恢复且不重取行情', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&refresh_seconds=3600' + mixed); await ready(page);
    const initial = page.url(); const query = new URL(initial).search;
    const button = await page.locator('.dock .toggle').boundingBox();
    const before = await metrics(request);
    await page.locator('.crypto-chart canvas').evaluateAll(nodes => { (window as any).__flatCanvases = nodes; });
    await expect(page.locator('.flat-rail')).toHaveCount(0); await openList(page);
    await expect(page.getByRole('button', { name: '开启平铺自选' })).toHaveAttribute('aria-pressed', 'false');
    const history = await page.evaluate(() => window.history.length);
    await page.getByRole('button', { name: '开启平铺自选' }).click();
    await expect(page.getByRole('button', { name: '关闭平铺自选' })).toHaveAttribute('aria-pressed', 'true');
    expect(new URL(page.url()).hash).toMatch(/^#flat=true;/); expect(new URL(page.url()).search).toBe(query);
    expect(await page.locator('.dock .toggle').boundingBox()).toEqual(button);
    expect(await page.evaluate(() => window.history.length)).toBe(history + 1);
    await page.mouse.click(300, 150);
    await expect(page.locator('.watch-panel')).toHaveCount(0);
    await expect(page.locator('.flat-rail')).toBeVisible();
    expect(await page.locator('.flat-rail button').allTextContents()).toEqual(['↑', '↓', '编辑', 'BTC', 'ETH', 'rb']);
    expect(await page.locator('.flat-rail').evaluate(rail => rail.scrollHeight === rail.clientHeight)).toBe(true);
    await expect(page.locator('.flat-rail')).toHaveCSS('overflow-y', 'auto');
    await expect(page.locator('.shortcuts')).toHaveCount(0);
    expect((await metrics(request)).reads).toEqual(before.reads);
    expect(await page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const old = (window as any).__flatCanvases as Element[];
        return old.length === nodes.length && old.every((node, index) => node === nodes[index] && node.isConnected);
    })).toBe(true);
    const saved = page.url();
    await page.goBack(); await expect(page.locator('.flat-rail')).toHaveCount(0); expect(page.url()).toBe(initial);
    await page.goForward(); await expect(page.locator('.flat-rail .flat-entry')).toHaveCount(3);
    expect((await metrics(request)).reads).toEqual(before.reads);
    await page.reload(); await ready(page); await expect(page.locator('.flat-rail .flat-entry')).toHaveCount(3);
    expect(page.url()).toBe(saved);
    await openList(page); await page.getByRole('button', { name: '关闭平铺自选' }).click();
    await expect(page.locator('.flat-rail')).toHaveCount(0);
    expect(new URL(page.url()).hash).not.toContain('flat='); expect(new URL(page.url()).search).toBe(query);
});

test('平铺候选及导航复用完整身份，编辑保留模式，清空后仍可关闭或新增', async ({ page, request }) => {
    await page.goto('/?timeframes=30m&history_bars=1500&ccxt.is_live=false&refresh_seconds=3600#flat=true;' + mixed.slice(1)); await ready(page);
    const hash = new URL(page.url()).hash;
    await page.getByRole('button', { name: '自选 tq KQ.m@SHFE.rb', exact: true }).click(); await ready(page);
    expect(new URL(page.url()).searchParams.get('source')).toBe('tq'); expect(new URL(page.url()).hash).toBe(hash);
    expect(new URL(page.url()).searchParams.get('history_bars')).toBe('1500');
    await expect(page.locator('.flat-rail .flat-entry').nth(2)).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: '平铺下一个自选' }).click(); await ready(page);
    expect(new URL(page.url()).searchParams.get('source')).toBe('ccxt');
    await page.getByRole('button', { name: '自选 kraken ETH/USD', exact: true }).click(); await ready(page);
    expect(new URL(page.url()).searchParams.get('ccxt.exchange_name')).toBe('kraken');
    expect(new URL(page.url()).searchParams.get('ccxt.symbol')).toBe('ETH/USD');
    expect(new URL(page.url()).searchParams.get('ccxt.is_live')).toBe('false');
    const query = new URL(page.url()).search; const before = await metrics(request);
    await page.getByRole('button', { name: '平铺编辑自选' }).click();
    await page.getByLabel('第 1 项品种', { exact: true }).fill('SOL/USDT:USDT');
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    await expect(page.locator('.flat-rail .flat-entry').first()).toHaveText('SOL');
    expect(new URL(page.url()).hash).toMatch(/^#flat=true;/); expect(new URL(page.url()).search).toBe(query);
    expect((await metrics(request)).reads).toEqual(before.reads);
    await page.getByRole('button', { name: '平铺编辑自选' }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '删除第 1 项', exact: true }).click();
    await page.getByRole('button', { name: '保存自选', exact: true }).click();
    expect(new URL(page.url()).hash).toBe('#flat=true');
    await expect(page.getByRole('button', { name: '平铺下一个自选' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '平铺编辑自选' })).toBeEnabled();
    await openList(page); await page.getByRole('button', { name: '关闭平铺自选' }).click();
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.getByRole('button', { name: '新建自选', exact: true })).toHaveAttribute('aria-expanded', 'false');
    expect(new URL(page.url()).search).toBe(query); expect((await metrics(request)).reads).toEqual(before.reads);
});

for (const theme of ['dark', 'light']) test(`长平铺栏仅内部滚动，当前项居中；${theme} 锁图标使用主题单色`, async ({ page }) => {
    const entries = Array.from({ length: 50 }, (_, index) => `tq,SHFE.rb${index}`).join(';');
    await page.goto(`/?source=tq&tq.symbol=SHFE.rb25&timeframes=30m&refresh_seconds=3600&theme=${theme}#flat=true;${entries}`); await ready(page);
    await expect(page.locator('.flat-rail .flat-entry')).toHaveCount(50);
    await expect(page.locator('.flat-rail')).toHaveCSS('scrollbar-width', 'thin');
    expect(await page.locator('.flat-rail').evaluate(rail => rail.scrollHeight > rail.clientHeight)).toBe(true);
    await expect.poll(() => page.locator('.flat-rail').evaluate(rail => {
        const active = rail.querySelector('.flat-entry.active')!.getBoundingClientRect();
        const bounds = rail.getBoundingClientRect();
        return Math.abs(active.top + active.height / 2 - bounds.top - bounds.height / 2);
    })).toBeLessThan(1.5);
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([1280, 800]);
    await page.screenshot({ path: `test-results/market-flat-${theme}.png` });
    await openList(page);
    const lock = page.getByRole('button', { name: '锁定自选面板', exact: true });
    await expect(lock.locator('svg')).toHaveCount(1); expect(await lock.textContent()).not.toMatch(/[🔒🔓]/u);
    expect(await lock.evaluate(button => getComputedStyle(button.querySelector('svg')!).stroke === getComputedStyle(button).color)).toBe(true);
    expect(await page.locator('.watch-panel header').evaluate(header => header.scrollWidth <= header.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/market-flat-panel-${theme}.png` });
});

test('平铺开关先检查完整 URL 长度，超限不改模式、地址或行情；坏布尔值独立报错', async ({ page, request }) => {
    const alerts: string[] = [];
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
    await page.goto('/?timeframes=30m&refresh_seconds=3600'); await ready(page);
    const base = page.url(); const before = await metrics(request);
    await page.evaluate(base => {
        let remaining = 8187 - base.length - 1;
        const items: string[] = [];
        while (remaining > 132) {
            const item = 'tq,' + 'A'.repeat(128);
            remaining -= item.length + (items.length ? 1 : 0); items.push(item);
        }
        if (remaining < 5) { items[items.length - 1] = items.at(-1)!.slice(0, -5); remaining += 5; }
        items.push('tq,' + 'A'.repeat(remaining - 4));
        location.hash = '#' + items.join(';');
    }, base);
    await expect.poll(() => page.url().length).toBe(8187);
    expect(alerts).toEqual([]); const original = page.url(); await openList(page);
    await page.getByRole('button', { name: '开启平铺自选' }).click();
    await expect.poll(() => alerts.length).toBe(1); expect(alerts[0]).toContain('8192');
    expect(page.url()).toBe(original); await expect(page.locator('.flat-rail')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '开启平铺自选' })).toHaveAttribute('aria-pressed', 'false');
    expect((await metrics(request)).reads).toEqual(before.reads);
    await page.goto('/?timeframes=30m&refresh_seconds=3600#flat=1;binance,BTC/USDT:USDT'); await ready(page); await openList(page);
    await expect(page.locator('.watch-panel [role="alert"]')).toContainText('平铺参数必须是 true 或 false');
    await expect(page.locator('.flat-rail')).toHaveCount(0);
});
