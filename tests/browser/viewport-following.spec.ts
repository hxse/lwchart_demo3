import { expect, test, type Page } from '@playwright/test';
import type { ViewportSnapshot } from '../fixtures/viewport';
import { installCandleRecorder } from '../fixtures/canvas-recording';

const fixture = 'http://127.0.0.1:43175/__fixture';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
    await request.post(fixture, { data: { reset: true } });
    errors.set(page, []);
    page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function open(page: Page, spacing: number, capacity = 1000, count = 1000) {
    await page.goto('http://127.0.0.1:43175/viewport');
    await page.waitForFunction(() => !!window.viewportFixture, undefined, { timeout: 7000 });
    return page.evaluate(options => window.viewportFixture.load(options), { spacing, capacity, count });
}
async function positions(page: Page, times: number[]) {
    return page.evaluate(times => window.viewportFixture.positions(times), times);
}
function near(actual: number | null, expected: number) {
    expect(actual).not.toBeNull();
    expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(1e-8);
}
function following(before: ViewportSnapshot, after: ViewportSnapshot) {
    near(after.center, before.center);
    expect(after.spacing).toBe(before.spacing);
    expect(after.right).toBe(before.right);
    expect(after.predictedRight).toBe(after.right);
}

for (const ratio of [1, 1.25, 2]) test.describe(`画布比例 ${ratio}`, () => {
    test.use({ deviceScaleFactor: ratio });

    test('几何与内置 SDK 实际绘制一致，完整贴边和留白均精确跟随', async ({ page }) => {
        await open(page, 6);
        for (const spacing of [0.5, 2.4, 2.5, 3.75, 4, 4.1, 6, 7.25, 10, 17.3]) {
            await page.evaluate(spacing => window.viewportFixture.load({ spacing, count: 1000 }), spacing);
            for (const mode of ['touch', 'gap'] as const) {
                const before = await page.evaluate(mode => window.viewportFixture.place(mode), mode);
                expect(before.predictedRight).toBe(before.right);
                expect(before.drawnRight).toBe(before.right);
                expect(before.right).toBeLessThanOrEqual(before.bitmapWidth);
                if (mode === 'touch') expect(before.right).toBe(before.bitmapWidth);
                const after = await page.evaluate(() => window.viewportFixture.append());
                following(before, after);
                const [old] = await positions(page, [before.tail]);
                near(old!, before.center - before.spacing);
            }
        }
    });

    test('裁切一个像素、约 1/3 或整根隐藏时，追加和裁剪不移动历史', async ({ page }) => {
        await open(page, 10);
        for (const mode of ['pixel', 'partial', 'hidden'] as const) {
            const before = await page.evaluate(mode => window.viewportFixture.place(mode), mode);
            expect(before.right).toBeGreaterThan(before.bitmapWidth);
            if (mode === 'pixel') expect(before.right - before.bitmapWidth).toBe(1);
            if (mode === 'partial') expect(before.right - before.bitmapWidth).toBe(Math.round(before.bodyWidth / 3));
            if (mode !== 'hidden') expect(before.drawnRight).toBe(before.right);
            const after = await page.evaluate(() => window.viewportFixture.append(3));
            const [old] = await positions(page, [before.tail]);
            near(old!, before.center);
            near(after.center, before.center + 3 * before.spacing);
            expect(after.spacing).toBe(before.spacing);
            expect(after.bars).toBe(before.bars);
            expect(after.drawnRight).toBe(before.drawnRight);
        }
        const before = await page.evaluate(() => window.viewportFixture.place('touch'));
        following(before, await page.evaluate(() => window.viewportFixture.append()));
    });

    test('小数间距连续追加无累计漂移，尾根与历史修正不产生平移', async ({ page }) => {
        await open(page, 7.25, 1500, 1500);
        const initial = await page.evaluate(() => window.viewportFixture.place('touch'));
        const samples = await page.evaluate(async () => {
            const samples: ViewportSnapshot[] = [];
            for (let index = 0; index < 40; index++) samples.push(await window.viewportFixture.append());
            return samples;
        });
        for (const sample of samples) following(initial, sample);
        const [old] = await positions(page, [initial.tail]);
        near(old!, initial.center - 40 * initial.spacing);
        const before = samples.at(-1)!;
        const batch = await page.evaluate(() => window.viewportFixture.append(3));
        following(before, batch);
        near((await positions(page, [before.tail]))[0]!, before.center - 3 * before.spacing);
        following(batch, await page.evaluate(() => window.viewportFixture.revise()));
        following(batch, await page.evaluate(() => window.viewportFixture.revise(true)));
    });
});

test('未满窗口的增量追加同样跟随，遮挡时保持原时间位置', async ({ page }) => {
    await open(page, 7.25, 1000, 100);
    const before = await page.evaluate(() => window.viewportFixture.place('touch'));
    const after = await page.evaluate(() => window.viewportFixture.append(3));
    following(before, after);
    expect(after.bars).toBe(before.bars + 3);
    near((await positions(page, [before.tail]))[0]!, before.center - 3 * before.spacing);
    const clipped = await page.evaluate(() => window.viewportFixture.place('partial'));
    const history = await page.evaluate(() => window.viewportFixture.append());
    near((await positions(page, [clipped.tail]))[0]!, clipped.center);
    near(history.center, clipped.center + clipped.spacing);
    expect(history.spacing).toBe(clipped.spacing);
});

test('同一帧内连续批次保持跟随或历史，下一帧拖动后按新位置判断', async ({ page }) => {
    for (const count of [100, 1500]) {
        await open(page, 7.25, 1500, count);
        const before = await page.evaluate(() => window.viewportFixture.place('touch'));
        const after = await page.evaluate(() => window.viewportFixture.burst(3));
        following(before, after);
        near((await positions(page, [before.tail]))[0]!, before.center - 3 * before.spacing);
        const clipped = await page.evaluate(() => window.viewportFixture.place('partial'));
        const history = await page.evaluate(() => window.viewportFixture.burst(3));
        near((await positions(page, [clipped.tail]))[0]!, clipped.center);
        near(history.center, clipped.center + 3 * clipped.spacing);
        expect(history.spacing).toBe(clipped.spacing);
        const returned = await page.evaluate(() => window.viewportFixture.place('touch'));
        following(returned, await page.evaluate(() => window.viewportFixture.burst(2)));
    }
});

function marketFrame() {
    const canvas = [...document.querySelectorAll<HTMLCanvasElement>('.crypto-chart canvas')]
        .find(canvas => !!window.candleFrames.get(canvas)?.rectangles.length)!;
    const frame = window.candleFrames.get(canvas)!;
    const last = frame.rectangles.at(-1)!;
    const previous = frame.rectangles.at(-2)!;
    return { width: canvas.width, ratio: canvas.width / canvas.clientWidth, generation: frame.generation,
        right: last.x + last.width, previousRight: previous.x + previous.width, bodyWidth: last.width };
}

test('真实看盘轮询及 1500 根裁剪保持末根位置，鼠标拖到部分遮挡后保持历史', async ({ page, request }) => {
    await page.addInitScript(installCandleRecorder);
    await page.goto('/?timeframes=30m&indicators=none&history_bars=1500&refresh_seconds=1');
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('.crypto-chart canvas')]
        .some(canvas => !!window.candleFrames.get(canvas)?.rectangles.length))).toBe(true);
    const before = await page.evaluate(marketFrame);
    await request.post(fixture, { data: { advance: 1 } });
    await expect.poll(() => page.evaluate(marketFrame).then(frame => frame.generation)).toBeGreaterThan(before.generation);
    const after = await page.evaluate(marketFrame);
    expect(after.right).toBe(before.right);
    // 默认整数间距 6px，直接比较 SDK 提交的 bitmap 矩形，未允许像素容差。
    expect(after.previousRight).toBe(before.right - 6 * before.ratio);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-bars', '1500');

    await page.mouse.move(300, 180); await page.mouse.down();
    // 先越过 SDK 起拖阈值，再按实际画出的末根边缘校准目标。
    await page.mouse.move(320, 180);
    await page.mouse.move(330, 180);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const dragging = await page.evaluate(marketFrame);
    const shift = (dragging.width - dragging.right + Math.round(dragging.bodyWidth / 3)) / dragging.ratio;
    await page.mouse.move(330 + shift, 180, { steps: 8 }); await page.mouse.up();
    await page.mouse.move(1100, 760);
    await expect.poll(() => page.evaluate(marketFrame).then(frame => frame.right)).toBeGreaterThan(after.width);
    const clipped = await page.evaluate(marketFrame);
    expect(clipped.right - clipped.width).toBe(Math.round(clipped.bodyWidth / 3));
    const reads = (await (await request.get(fixture)).json()).reads.length;
    await request.post(fixture, { data: { advance: 2 } });
    await expect.poll(async () => (await (await request.get(fixture)).json()).reads.length).toBeGreaterThan(reads);
    await expect.poll(() => page.evaluate(marketFrame).then(frame => frame.generation)).toBeGreaterThan(clipped.generation);
    expect((await page.evaluate(marketFrame)).right).toBe(clipped.right);
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
});
