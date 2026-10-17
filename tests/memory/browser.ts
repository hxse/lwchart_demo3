import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { browserLaunchOptions } from '../browser/launch';
import type { memoryBench } from './browser-fixture';

declare global { interface Window { memoryBench: typeof memoryBench } }

/** 同一 fixture 通过构建解析选取基线源码；正式应用没有诊断分支。 */
export async function measureBrowser(root: string, signal: AbortSignal) {
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dirname, 'browser-fixture.ts')], target: 'browser', minify: true,
        plugins: [{ name: 'benchmark-source', setup(builder) {
            builder.onResolve({ filter: /^\.\.\/\.\.\/src\// }, ({ path }) => ({ path: resolve(root, `${path.slice(6)}.ts`) }));
        } }],
    });
    if (!built.success) throw new Error(`离线浏览器 fixture 构建失败：${built.logs.join('\n')}`);
    const script = await built.outputs[0]!.text();
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
        return new URL(request.url).pathname === '/fixture.js'
            ? new Response(script, { headers: { 'Content-Type': 'text/javascript' } })
            : new Response('<!doctype html><html><body><script type="module" src="/fixture.js"></script></body></html>',
                { headers: { 'Content-Type': 'text/html' } });
    } });
    const browser = await chromium.launch(browserLaunchOptions()).catch(error => { server.stop(true); throw error; });
    const abort = () => { void browser.close(); };
    signal.addEventListener('abort', abort, { once: true });
    try {
        signal.throwIfAborted();
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        // 禁止 fixture 意外请求外部服务。
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.goto(`http://127.0.0.1:${server.port}`, { timeout: 10000 });
        await page.waitForFunction(() => !!window.memoryBench, undefined, { timeout: 10000 });
        const cdp = await page.context().newCDPSession(page);
        const stages = [];
        const bytes = (node: { selfSize: number; children: any[] }): number => node.selfSize + node.children.reduce((sum, child) => sum + bytes(child), 0);
        for (const size of [1000, 10000]) {
            await page.evaluate(size => window.memoryBench.initialize(size), size);
            await cdp.send('HeapProfiler.collectGarbage');
            const initial = await cdp.send('Runtime.getHeapUsage');
            for (const kind of ['repeat', 'tail', 'append'] as const) {
                signal.throwIfAborted();
                await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768,
                    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
                const result = await page.evaluate(({ kind, rounds }) => window.memoryBench.update(kind, rounds), { kind, rounds: kind === 'append' ? 20 : 100 });
                const sampled = await cdp.send('HeapProfiler.stopSampling');
                const after = await cdp.send('Runtime.getHeapUsage');
                await cdp.send('HeapProfiler.collectGarbage');
                const retained = await cdp.send('Runtime.getHeapUsage');
                stages.push({ size, kind, ...result, initial_heap_bytes: initial.usedSize, sampled_allocation_bytes: bytes(sampled.profile.head),
                    after_heap_bytes: after.usedSize, retained_heap_bytes: retained.usedSize });
            }
        }
        await page.evaluate(() => window.memoryBench.dispose());
        if (errors.length) throw new Error(errors.join('\n'));
        return stages;
    } finally {
        signal.removeEventListener('abort', abort);
        await browser.close(); server.stop(true);
    }
}
