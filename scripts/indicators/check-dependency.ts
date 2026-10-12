import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tradingSignalsVersion } from '../../src/indicators/support';

// 已审核的 8.3.0 补丁产物；修改前须审阅补丁并重新通过严格数值准入。
const expectedDxSha256 = '400b41634de3eec1b6109a80fbaa52562efccd1a3a44298a0e47eded1144367b';
const projectRoot = resolve(import.meta.dirname, '../..');

export class IndicatorDependencyError extends Error {
    constructor(reason: string) {
        super(`ADX 依赖校验失败：${reason}。请用 bun install --frozen-lockfile 恢复；有意调整版本或补丁时，须审核并通过准入后手动更新预期指纹`);
        this.name = 'IndicatorDependencyError';
    }
}

/** 开发和构建共用的只读检查，不加载或执行待校验的库。 */
export async function checkIndicatorDependency(root = projectRoot): Promise<void> {
    const library = join(root, 'node_modules/trading-signals');
    let version: unknown;
    try { version = JSON.parse(await readFile(join(library, 'package.json'), 'utf8')).version; }
    catch { throw new IndicatorDependencyError('无法读取 trading-signals 安装版本'); }
    if (version !== tradingSignalsVersion) {
        throw new IndicatorDependencyError(`trading-signals 版本不符，期望 ${tradingSignalsVersion}，实际 ${String(version)}`);
    }
    let content: Buffer;
    try { content = await readFile(join(library, 'dist/trend/DX/DX.js')); }
    catch { throw new IndicatorDependencyError('无法读取补丁后的 dist/trend/DX/DX.js'); }
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual !== expectedDxSha256) {
        throw new IndicatorDependencyError(`补丁后的 DX.js SHA-256 不符，期望 ${expectedDxSha256}，实际 ${actual}`);
    }
}

if (import.meta.main) {
    try { await checkIndicatorDependency(); }
    catch (error) { console.error((error as Error).message); process.exit(2); }
}
