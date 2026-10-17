import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { measureService } from './service';
import { measureBrowser } from './browser';

const current = resolve(import.meta.dirname, '../..');
const controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('内存对照已中断')));
process.once('SIGTERM', () => controller.abort(new Error('内存对照已中断')));

async function main() {
    let baseline: string | undefined;
    let runs = 3;
    const seen = new Set<string>();
    for (const argument of process.argv.slice(2)) {
        const match = /^--(baseline|runs)=(.+)$/.exec(argument);
        if (!match || seen.has(match[1]!)) throw new Error('用法：just benchmark-memory --baseline=/path --runs=3；参数不能重复');
        seen.add(match[1]!);
        if (match[1] === 'baseline') baseline = resolve(match[2]!);
        else {
            if (!/^(?:[1-9]|10)$/.test(match[2]!)) throw new Error('runs 必须为 1..10 的整数');
            runs = Number(match[2]);
        }
    }
    if (!baseline || baseline === current) throw new Error('必须指定独立的优化前 baseline 目录');
    for (const root of [baseline, current]) for (const file of ['src/crypto/data/CandleStore.ts', 'dist-market/server.js',
        'dist-market/public/index.html', 'package.json', 'config.example.toml', 'node_modules/lightweight-charts/package.json']) {
        if (!existsSync(join(root, file))) throw new Error(`缺少对照输入：${join(root, file)}`);
    }
    const reference = await Bun.file(join(baseline, 'package.json')).json();
    const manifest = await Bun.file(join(current, 'package.json')).json();
    assert.deepEqual(manifest.dependencies, reference.dependencies, '对照必须使用相同依赖版本');
    console.log(JSON.stringify({ type: 'environment', bun: Bun.version, platform: process.platform, runs,
        note: '服务端为四路加速离线负载；browser 分配为 CDP 采样估计；所有内存以字节计，不等同 Cockpit 指标' }));
    const variants = [{ name: 'baseline', root: baseline, smol: false }, { name: 'current', root: current, smol: false },
        { name: 'current-smol', root: current, smol: true }];
    const expected = new Map<string, unknown>();
    for (let run = 0; run < runs; run++) {
        for (let offset = 0; offset < variants.length; offset++) {
            const variant = variants[(offset + run) % variants.length]!;
            console.error(`服务端对照 ${run + 1}/${runs}：${variant.name}`);
            const result = await measureService(variant.root, variant.smol, controller.signal);
            console.log(JSON.stringify({ type: 'service', run: run + 1, variant: variant.name, result }));
        }
        const order = run % 2 ? variants.slice(0, 2).reverse() : variants.slice(0, 2);
        for (const variant of order) {
            console.error(`浏览器对照 ${run + 1}/${runs}：${variant.name}`);
            const stages = await measureBrowser(variant.root, controller.signal);
            for (const stage of stages) {
                const key = `${stage.size}/${stage.kind}`;
                if (expected.has(key)) assert.deepEqual(stage.checksum, expected.get(key), '优化前后终态必须严格相同');
                else expected.set(key, stage.checksum);
                const { checksum: _checksum, ...metrics } = stage;
                console.log(JSON.stringify({ type: 'browser', run: run + 1, variant: variant.name, ...metrics }));
            }
        }
    }
}
await main().catch(error => { console.error(error); process.exitCode = 1; });
