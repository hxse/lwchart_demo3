import { expect, test, type Page } from '@playwright/test';
import type {} from '../fixtures/chart-performance';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:43175/chart-performance');
    await page.waitForFunction(() => !!window.performanceFixture);
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('图例同值重复更新不写 DOM，变化复用节点并保持文本、转义、格式和显隐', async ({ page }) => {
    const repeat = await page.evaluate(() => window.performanceFixture.repeatLegend());
    expect(repeat.mutations).toBe(0); expect(repeat.sameNodes).toBe(true);
    expect(repeat.text).toBe('T at 1718000120O100.00H102.00L99.00C101.00V12.5<名称><30>');
    const changed = await page.evaluate(() => window.performanceFixture.changeLegend());
    expect(changed.sameNodes).toBe(true); expect(changed.text).toContain('C102.00'); expect(changed.text).toContain('<名称><31>');
    expect(changed.html).toContain('&lt;名称&gt;'); expect(changed.html).toContain('&lt;31&gt;');
    expect((await page.evaluate(() => window.performanceFixture.legendState('gap'))).text).toContain('<名称><未定义>');
    expect((await page.evaluate(() => window.performanceFixture.legendState('hide'))).display).toBe('none');
    expect((await page.evaluate(() => window.performanceFixture.legendState('show'))).display).toBe('flex');
    expect((await page.evaluate(() => window.performanceFixture.legendState('format'))).text).toContain('T new 1718000120');
    const plain = await page.evaluate(() => window.performanceFixture.legendState('no-format'));
    expect(plain.timeRows).toBe(0); expect(plain.rows).toBe(2); expect(plain.text).toContain('C102.00');
    const cleared = await page.evaluate(() => window.performanceFixture.legendState('clear'));
    expect(cleared.display).toBe('none'); expect(cleared.rows).toBe(0);
});

test('真实 SDK 末点、前驱和历史锚点查询不整批读数据，裁剪和自定义缺口保持语义', async ({ page }) => {
    const result = await page.evaluate(() => window.performanceFixture.queries());
    expect(result.closest).toEqual([null, 1718000000, 1718000060, 1718000120]);
    expect(result.values).toEqual([1718000060, 1718000120, 1718000180]); expect(result.current).toBeNull();
    expect(result.dataReads).toBe(0);
    const custom = await page.evaluate(() => window.performanceFixture.customQueries());
    expect(custom.values).toEqual([1718000060]); expect(custom.match).toBe(1718000060); expect(custom.missing).toBeNull();
});

test('缺口分段同值不写 SDK，末根仅更新末段，样式仍同步且单点段保留', async ({ page }) => {
    const result = await page.evaluate(() => window.performanceFixture.segments());
    expect(result.series).toBe(4);
    expect(result.unchanged).toEqual([{ data: 0, options: 0 }, { data: 0, options: 0 }]);
    expect(result.tail).toEqual([{ data: 0, options: 0 }, { data: 1, options: 0 }]);
    expect(result.colors).toEqual(['#00ff00', '#00ff00']);
});
