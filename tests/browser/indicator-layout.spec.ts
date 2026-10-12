import { expect, test, type Page } from '@playwright/test';
import { installLineRecorder } from '../fixtures/line-recording';
import { chartSeries } from '../../src/crypto/data/chartData';
import { parseIndicatorList } from '../../src/indicators/parameters';

const fixture = 'http://127.0.0.1:43175/__fixture';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(installLineRecorder);
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function paneColors(page: Page) {
    return page.locator('.crypto-chart canvas').evaluateAll(nodes => {
        const colors = new Map<number, Set<string>>();
        for (const node of nodes as HTMLCanvasElement[]) {
            const bounds = node.getBoundingClientRect();
            if (bounds.width < 300 || bounds.height < 30) continue;
            const pane = colors.get(bounds.top) ?? new Set<string>();
            for (const stroke of window.lineFrames.get(node)?.strokes ?? []) pane.add(stroke.color.toLowerCase());
            colors.set(bounds.top, pane);
        }
        return [...colors].sort((a, b) => a[0] - b[0]).map(([, colors]) => [...colors]);
    });
}
async function verify(page: Page, list: string) {
    const expected = chartSeries(parseIndicatorList(list));
    const count = Math.max(...expected.map(series => series.pane)) + 1;
    await expect.poll(async () => (await paneColors(page)).length).toBe(count);
    await expect.poll(async () => {
        const panes = await paneColors(page);
        return expected.filter(series => series.type === 'Line').every(series => panes[series.pane]?.includes(series.options.color.toLowerCase()));
    }).toBe(true);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('.indicator-labels span')).toHaveCount(parseIndicatorList(list).length);
}

test('实际设置修改前置参数、替换类型、重排及增删，独立副图和复合输出始终位于正确 Pane', async ({ page, request }) => {
    const initial = 'rsi,14;macd,12,26,9';
    await page.goto(`/?timeframes=30m&history_bars=100&refresh_seconds=60&indicators=${encodeURIComponent(initial)}`);
    await verify(page, initial);
    for (const list of ['rsi,20;macd,12,26,9', 'rsi,20;macd,12,26,9;adx,14', 'rsi,20;macd,12,26,9;adx,20',
        'adx,20;macd,12,26,9', 'macd,12,26,9;adx,20', 'cci,20;macd,12,26,9', 'atr,14;cci,20;macd,12,26,9',
        'macd,12,26,9;cci,20', 'macd,12,26,9', initial]) {
        await page.getByRole('button', { name: '展开看盘设置' }).click();
        await page.getByLabel('技术指标').fill(list);
        await page.getByRole('button', { name: '应用', exact: true }).click();
        expect(new URL(page.url()).searchParams.get('indicators')).toBe(list);
        await verify(page, list);
    }
    expect((await (await request.get(fixture)).json()).reads.filter((read: { history: boolean }) => read.history)).toHaveLength(1);
});
