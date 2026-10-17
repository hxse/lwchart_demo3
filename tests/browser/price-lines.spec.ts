import { expect, test } from '@playwright/test';
import type {} from '../fixtures/price-lines';
import { installTextRecorder } from '../fixtures/text-recording';

test('原生价格线完整显示且保持时间视口，清除恢复纵轴，手动纵轴不被接管', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:43175/price-lines');
    await page.waitForFunction(() => !!window.priceLinesFixture);
    const before = await page.evaluate(() => window.priceLinesFixture.report());
    const shown = await page.evaluate(() => window.priceLinesFixture.set());
    expect(shown.time).toEqual(before.time); expect(shown.prices).toEqual([100, 50, 200]);
    expect(shown.coordinates.every(value => value !== null && value >= 0 && value <= shown.height)).toBe(true);
    const updated = await page.evaluate(() => window.priceLinesFixture.set(220));
    expect(updated.time).toEqual(before.time); expect(updated.prices).toEqual([100, 50, 220]);
    const cleared = await page.evaluate(() => window.priceLinesFixture.clear());
    expect(cleared.time).toEqual(before.time); expect(cleared.price).toEqual(before.price); expect(cleared.prices).toEqual([]);
    const manual = await page.evaluate(() => window.priceLinesFixture.manual());
    const locked = await page.evaluate(() => window.priceLinesFixture.set(250));
    expect(locked.auto).toBe(false); expect(locked.price).toEqual(manual.price); expect(locked.time).toEqual(before.time);
    const unlocked = await page.evaluate(() => window.priceLinesFixture.reset());
    expect(unlocked.auto).toBe(true); expect(unlocked.coordinates.every(value => value !== null && value >= 0 && value <= unlocked.height)).toBe(true);
    expect(errors).toEqual([]);
});

for (const deviceScaleFactor of [1, 2]) test.describe(`左侧标签像素比例 ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });
    test('真实画布标签位于左侧、近价不重叠，切回原生或清除后无残留', async ({ page }) => {
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.addInitScript(installTextRecorder);
        await page.goto('http://127.0.0.1:43175/price-lines'); await page.waitForFunction(() => !!window.priceLinesFixture);
        const labels = () => page.evaluate(() => [...new Map([...document.querySelectorAll('canvas')]
            .flatMap(canvas => window.textFrames.get(canvas) ?? []).filter(word => /^示例[入损盈] /.test(word.text))
            .map(word => [word.text, word])).values()].sort((a, b) => a.y - b.y));
        const before = await page.evaluate(() => window.priceLinesFixture.report());
        const shown = await page.evaluate(() => window.priceLinesFixture.set(100.5, 'left', 99.5));
        expect(shown.axisLabels).toEqual([false, false, false]); expect(shown.time).toEqual(before.time);
        await expect.poll(async () => (await labels()).length).toBe(3);
        const points = await labels();
        expect(points.every(point => point.x >= 0 && point.x < 20 && point.y >= 0 && point.y <= shown.height)).toBe(true);
        expect(points[1]!.y - points[0]!.y).toBeGreaterThanOrEqual(17);
        expect(points[2]!.y - points[1]!.y).toBeGreaterThanOrEqual(17);
        await page.evaluate(() => window.priceLinesFixture.set(220, 'left'));
        await expect.poll(async () => (await labels()).some(point => point.text.includes('220'))).toBe(true);
        expect((await labels()).every(point => point.y >= 28 && point.y <= shown.height - 28)).toBe(true);
        const axis = await page.evaluate(() => window.priceLinesFixture.set(220, 'axis'));
        expect(axis.axisLabels).toEqual([true, true, true]); await expect.poll(labels).toEqual([]);
        await page.evaluate(() => window.priceLinesFixture.set(220, 'left')); await expect.poll(async () => (await labels()).length).toBe(3);
        await page.evaluate(() => window.priceLinesFixture.clear()); await expect.poll(labels).toEqual([]);
        expect(errors).toEqual([]);
    });
});
