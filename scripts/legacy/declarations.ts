import { resolve } from 'node:path';

/** 与 JavaScript 正式构建同批生成、复制声明，不维护手写的接口副本。 */
export async function buildDeclarations(root: string) {
    const compiler = Bun.spawn(['bun', '--bun', resolve(root, 'node_modules/@typescript/native/bin/tsc'),
        '-p', resolve(root, 'tsconfig.lib.json')], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
    if (await compiler.exited) throw new Error('Notebook 库声明生成失败');
    const entry = "export * from './types/lib-entry';\nexport { default } from './types/lib-entry';\nexport as namespace ChartDashboardLib;\n";
    for (const name of ['chart-dashboard.d.ts', 'chart-dashboard.es.d.ts', 'chart-dashboard.umd.d.ts']) {
        await Bun.write(resolve(root, 'dist-lib', name), entry);
    }
    console.log('Notebook 声明产物：dist-lib/chart-dashboard*.d.ts 与 dist-lib/types/');
}
