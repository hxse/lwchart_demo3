import { expect, test, type Page } from '@playwright/test';
import type {} from '../fixtures/chart-gaps';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:43175/chart-gaps');
    await page.waitForFunction(() => !!window.gapFixture);
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('实际 Pane 增删时未变缺口系列和画线段一起移动，数据保留且无孤立副图', async ({ page }) => {
    const initial = await page.evaluate(() => window.gapFixture.cci());
    const added = await page.evaluate(() => window.gapFixture.moveWithPrefix(true));
    expect(added.retained).toBe(true); expect(added.paneSeries).toEqual([1, 1, 3]);
    expect(added.values).toEqual(initial.values);
    const removed = await page.evaluate(() => window.gapFixture.moveWithPrefix(false));
    expect(removed.retained).toBe(true); expect(removed.paneSeries).toEqual([1, 3]);
    expect(removed.values).toEqual(initial.values);
    expect(await page.evaluate(() => window.gapFixture.clear())).toBe(0);
});

for (const kind of ['Line', 'Histogram'] as const) test(`${kind} 真实 SDK 恢复尾部／中间历史缺口；整批成功或拒绝且不丢后续值`, async ({ page }) => {
    for (const middle of [false, true]) {
        const initial = await page.evaluate(({ kind, middle }) => window.gapFixture.load(kind, middle), { kind, middle });
        expect(initial.values.map(point => Number(point.time))).toEqual(middle ? [1718000000, 1718000120] : [1718000000]);
        const restored = await page.evaluate(() => window.gapFixture.restore());
        expect(restored.candles.at(-1)).toMatchObject({ close: 120 });
        expect(restored.values).toEqual(middle
            ? [{ time: 1718000000, value: 1 }, { time: 1718000060, value: 2 }, { time: 1718000120, value: 3 }]
            : [{ time: 1718000000, value: 1 }, { time: 1718000060, value: 2 }]);
        for (let repeat = 0; repeat < 2; repeat++) {
            const gap = await page.evaluate(() => window.gapFixture.gap());
            expect(gap.values).toEqual(initial.values);
        }
        expect((await page.evaluate(() => window.gapFixture.restore())).values).toEqual(restored.values);
        const invalid = await page.evaluate(() => window.gapFixture.invalid());
        expect(invalid.message).toContain('已有时间'); expect(invalid.after).toEqual(invalid.before);
        expect(await page.evaluate(() => window.gapFixture.clear())).toBe(0);
    }
});

test('真实 CCI undefined 不跨缺口画线，鼠标及同步图例显示未定义；恢复后释放分段', async ({ page }) => {
    const initial = await page.evaluate(() => window.gapFixture.cci());
    expect(initial.values.map(point => Number(point.time))).toEqual([1718000060, 1718000180]);
    expect(initial.panes).toBe(2); expect(initial.series).toBe(2); expect(initial.nativeSeries).toBe(4);
    const drawing = await page.evaluate(() => window.gapFixture.strokes());
    expect(drawing.paths.length).toBeGreaterThan(0);
    const gapX = drawing.positions[2]!;
    expect(drawing.paths.flatMap(path => path.segments).some(segment =>
        Math.min(segment.from.x, segment.to.x) < gapX && Math.max(segment.from.x, segment.to.x) > gapX)).toBe(false);
    const position = await page.evaluate(() => window.gapFixture.coordinates(2));
    await page.mouse.move(position.x, position.y);
    await expect(page.locator('.chart-legend')).toContainText('CCI2未定义');
    await page.evaluate(() => window.gapFixture.syncLegend(0));
    await expect(page.locator('.chart-legend')).toContainText('CCI2预热');
    await page.evaluate(() => window.gapFixture.syncLegend(2));
    await expect(page.locator('.chart-legend')).toContainText('CCI2未定义');
    const hidden = await page.evaluate(() => window.gapFixture.restyle('#00ff00', false));
    expect(hidden.retained).toBe(true); expect(hidden.nativeSeries).toBe(2);
    const shown = await page.evaluate(() => window.gapFixture.restyle('#00ff00', true));
    expect(shown.retained).toBe(true); expect(shown.nativeSeries).toBe(4);
    expect(shown.values).toEqual(initial.values); expect(shown.colors).toEqual(['#00ff00', '#00ff00', '#00ff00']);
    const gap = await page.evaluate(() => window.gapFixture.changeCci(100, false));
    expect(gap.values.map(point => Number(point.time))).toEqual([1718000060]);
    expect(gap.nativeSeries).toBe(2); expect(gap.panes).toBe(2);
    await page.evaluate(() => window.gapFixture.syncLegend(3));
    await expect(page.locator('.chart-legend')).toContainText('CCI2未定义');
    const recovery = await page.evaluate(() => window.gapFixture.changeCci(120, true));
    expect(recovery.values.map(point => Number(point.time))).toEqual([1718000060, 1718000240]);
    expect(recovery.nativeSeries).toBe(4); expect(recovery.panes).toBe(2);
    await page.evaluate(() => window.gapFixture.syncLegend(4));
    await expect(page.locator('.chart-legend')).not.toContainText('未定义');
    expect(await page.evaluate(() => window.gapFixture.clear())).toBe(0);
});
