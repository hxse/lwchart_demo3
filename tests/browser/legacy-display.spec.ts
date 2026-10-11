import { expect, test, type Page } from '@playwright/test';
import { installCandleRecorder } from '../fixtures/canvas-recording';
import { installLineRecorder } from '../fixtures/line-recording';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(installCandleRecorder); await page.addInitScript(installLineRecorder);
    await page.goto('http://127.0.0.1:43175/legacy-display');
    await expect(page.locator('.chart-container')).toHaveCount(1);
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

function drawings(color: string) {
    return [...document.querySelectorAll<HTMLCanvasElement>('canvas')].flatMap(canvas => {
        const strokes = window.lineFrames.get(canvas)?.strokes.filter(stroke => stroke.color === color) ?? [];
        return strokes.length ? [{ height: canvas.height, strokes }] : [];
    });
}

test('真实 Notebook UMD 的 left 轴均线使用自身范围，在画布内连续显示', async ({ page }) => {
    await expect.poll(() => page.evaluate(drawings, '#00ff00').then(rows => rows.length)).toBeGreaterThan(0);
    const rows = await page.evaluate(drawings, '#00ff00');
    expect(rows.some(row => row.strokes.flatMap(stroke => stroke.segments).some(segment =>
        Math.min(segment.from.y, segment.to.y) >= 0 && Math.max(segment.from.y, segment.to.y) <= row.height))).toBe(true);
    const canvas = page.locator('.chart-container canvas').first();
    const box = (await canvas.boundingBox())!; await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
    await expect(page.locator('.chart-legend')).toContainText('EMA14');
});

test('真实 Notebook UMD 保留 CSV NaN 缺口，画布断线且缺口图例显示未定义', async ({ page }) => {
    await expect.poll(() => page.evaluate(drawings, '#ff00ff').then(rows => rows.length)).toBeGreaterThan(0);
    const geometry = await page.evaluate(() => {
        const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas')];
        const primary = canvases.find(canvas => !!window.candleFrames.get(canvas)?.rectangles.length)!;
        const body = window.candleFrames.get(primary)!.rectangles.at(-2)!;
        const gap = body.x + body.width / 2;
        const target = canvases.find(canvas => window.lineFrames.get(canvas)?.strokes.some(stroke => stroke.color === '#ff00ff'))!;
        const bounds = target.getBoundingClientRect();
        return { gap, x: bounds.x + gap * target.clientWidth / target.width, y: bounds.y + bounds.height / 2 };
    });
    const rows = await page.evaluate(drawings, '#ff00ff');
    expect(rows.flatMap(row => row.strokes.flatMap(stroke => stroke.segments)).some(segment =>
        Math.min(segment.from.x, segment.to.x) < geometry.gap && Math.max(segment.from.x, segment.to.x) > geometry.gap)).toBe(false);
    await page.mouse.move(geometry.x, geometry.y);
    await expect(page.locator('.chart-legend')).toContainText('CCI2未定义');
});
