import { resolve } from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'vite';

export async function buildMarket(root: string) {
    await build({ configFile: resolve(root, 'vite.config.crypto.ts') });
    const directory = resolve(root, 'dist-market');
    await mkdir(directory, { recursive: true });
    const result = await Bun.build({ entrypoints: [resolve(root, 'scripts/crypto/production.ts')], target: 'bun', outdir: directory,
        naming: 'server.js', minify: true });
    if (!result.success) throw new Error('生产服务打包失败，请检查构建诊断');
    await rm(resolve(directory, 'public'), { recursive: true, force: true });
    await cp(resolve(root, 'dist-crypto'), resolve(directory, 'public'), { recursive: true, force: true });
    console.log('生产服务产物：dist-market/server.js');
}
