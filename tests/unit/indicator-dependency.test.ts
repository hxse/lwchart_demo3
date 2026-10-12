import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { checkIndicatorDependency, IndicatorDependencyError } from '../../scripts/indicators/check-dependency';
import { tradingSignalsVersion } from '../../src/indicators/support';
import { prepareInputs } from '../../scripts/deploy/inputs';

const root = resolve(import.meta.dirname,'../..');
const libraryPath = 'node_modules/trading-signals';
const dxPath = `${libraryPath}/dist/trend/DX/DX.js`;
async function dependencyFixture(directory: string) {
    await mkdir(join(directory,libraryPath,'dist/trend/DX'),{recursive:true});
    await writeFile(join(directory,libraryPath,'package.json'),JSON.stringify({version:tradingSignalsVersion}));
    await copyFile(join(root,dxPath),join(directory,dxPath));
}
async function rejected(directory: string, message: string) {
    await expect(checkIndicatorDependency(directory)).rejects.toBeInstanceOf(IndicatorDependencyError);
    await expect(checkIndicatorDependency(directory)).rejects.toThrow(message);
}

test('依赖校验固定完整文件身份：合法副本通过，任意字节变化、缺文件及版本不符明确拒绝', async () => {
    const directory = await mkdtemp(join(tmpdir(),'lwchart-dependency-'));
    try {
        await dependencyFixture(directory);
        await checkIndicatorDependency(directory);
        const original = await readFile(join(directory,dxPath),'utf8');
        for (const content of [original+'\n// 补丁区域外的修改\n',original.replaceAll('\n','\r\n')]) {
            await writeFile(join(directory,dxPath),content);
            await rejected(directory,'DX.js SHA-256 不符');
            expect(await readFile(join(directory,dxPath),'utf8')).toBe(content);
        }
        await writeFile(join(directory,dxPath),original);
        const undo = Bun.spawnSync(['git','apply','--reverse',`--directory=${libraryPath}`,join(root,'patches/trading-signals@8.3.0.patch')],{cwd:directory});
        expect(undo.exitCode,undo.stderr.toString()).toBe(0);
        await rejected(directory,'DX.js SHA-256 不符');
        await rm(join(directory,dxPath));
        await rejected(directory,'无法读取补丁后的 dist/trend/DX/DX.js');
        await writeFile(join(directory,libraryPath,'package.json'),JSON.stringify({version:'8.3.1'}));
        await rejected(directory,'版本不符，期望 8.3.0，实际 8.3.1');
        await writeFile(join(directory,libraryPath,'package.json'),'{');
        await rejected(directory,'无法读取 trading-signals 安装版本');
        await rm(join(directory,libraryPath),{recursive:true});
        await rejected(directory,'无法读取 trading-signals 安装版本');
    } finally { await rm(directory,{recursive:true,force:true}); }
});

test('真实命令在损坏依赖下先拒绝检查、开发和构建，帮助与停止保持独立', async () => {
    const directory = await mkdtemp(join(tmpdir(),'lwchart-dependency-entry-'));
    async function run(command: string[]) {
        const child = Bun.spawn(command,{cwd:directory,stdout:'pipe',stderr:'pipe'});
        const stdout = new Response(child.stdout).text(); const stderr = new Response(child.stderr).text();
        return {code:await child.exited,output:(await stdout)+(await stderr)};
    }
    try {
        const prepared = await prepareInputs(root);
        await cp(prepared.directory,directory,{recursive:true});
        await copyFile(join(root,'justfile'),join(directory,'justfile'));
        await dependencyFixture(directory);
        await writeFile(join(directory,dxPath),(await readFile(join(directory,dxPath),'utf8'))+'\n// 模拟文件漂移\n');
        const commands = [
            [process.execPath,'scripts/indicators/check-dependency.ts'],
            ['just','check'],['just','test'],
            ['just','market','--dev','--config=/missing'],['just','market','--build'],
            ['just','legacy','--build','--config=/missing'],
            [process.execPath,'scripts/crypto/entry.ts','dev','/missing'],
            [process.execPath,'scripts/crypto/entry.ts','build'],
        ];
        for (const command of commands) {
            const result = await run(command);
            expect(result.code,`${command.join(' ')}\n${result.output}`).toBe(2);
            expect(result.output).toContain('ADX 依赖校验失败：补丁后的 DX.js SHA-256 不符');
        }
        for (const path of ['dist-crypto','dist-market','dist-lib']) expect(existsSync(join(directory,path))).toBe(false);
        await rm(join(directory,libraryPath),{recursive:true});
        for (const command of [['just'],['just','market','--help','--config=/missing'],['just','legacy','--help'],
            ['just','market','--stop','--config=/missing']]) {
            const result = await run(command); expect(result.code,result.output).toBe(0);
            expect(result.output).not.toContain('ADX 依赖校验失败');
        }
    } finally { await rm(directory,{recursive:true,force:true}); }
});
