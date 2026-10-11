import { expect, test } from '@playwright/test';
import { installTextRecorder } from '../fixtures/text-recording';

function referenceText() {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.crypto-chart canvas')].filter(canvas => canvas.clientHeight > 30);
    const words = (nodes: HTMLCanvasElement[]) => nodes.flatMap(canvas => (window.textFrames.get(canvas) ?? []).map(item => item.text));
    return { plot: words(canvases.filter(canvas => canvas.clientWidth > 300)), axis: words(canvases.filter(canvas => canvas.clientWidth > 0 && canvas.clientWidth < 150)) };
}

test('真实 RSI 默认参考值只在价格轴显示，绘图区无重复标题，明暗切换仍保持', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(installTextRecorder);
    await page.goto('/?timeframes=30m&indicators=rsi,14&refresh_seconds=60');
    await expect(page.locator('.crypto-chart')).toHaveAttribute('data-phase', 'ready');
    for (const theme of ['dark', 'light'] as const) {
        if (theme === 'light') {
            await page.getByRole('button', { name: '展开看盘设置' }).click();
            await page.getByRole('combobox', { name: '主题', exact: true }).selectOption(theme);
            await page.getByRole('button', { name: '应用', exact: true }).click();
        }
        await expect(page.locator('.dashboard')).toHaveAttribute('data-theme', theme);
        await expect.poll(() => page.evaluate(referenceText).then(frame => ['30', '50', '70'].every(value => frame.axis.includes(value)))).toBe(true);
        const frame = await page.evaluate(referenceText);
        expect(frame.plot.filter(text => ['30', '50', '70'].includes(text))).toEqual([]);
    }
    expect(errors).toEqual([]);
});
