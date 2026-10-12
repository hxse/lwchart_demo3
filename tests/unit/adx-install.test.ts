import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareInputs } from '../../scripts/deploy/inputs';

test('生产输入在新目录离线冻结安装后，直接使用登记补丁的原生 DX／ADX', async () => {
    const root = resolve(import.meta.dirname,'../..');
    const prepared = await prepareInputs(root);
    const manifest = JSON.parse(await readFile(join(prepared.directory,'package.json'),'utf8'));
    const patches = Object.values(manifest.patchedDependencies) as string[];
    const directory = await mkdtemp(join(tmpdir(),'lwchart-adx-install-'));
    async function run(args: string[]) {
        const child = Bun.spawn([process.execPath,...args],{cwd:directory,stdout:'pipe',stderr:'pipe'});
        const stdout = new Response(child.stdout).text(); const stderr = new Response(child.stderr).text();
        return {code:await child.exited,output:(await stdout)+(await stderr)};
    }
    try {
        await cp(prepared.directory,directory,{recursive:true});
        const lock = await readFile(join(directory,'bun.lock'),'utf8');
        const installed = await run(['install','--frozen-lockfile','--offline','--ignore-scripts','--backend=copyfile']);
        expect(installed.code,installed.output).toBe(0);
        expect(await readFile(join(directory,'bun.lock'),'utf8')).toBe(lock);
        const checked = await run(['scripts/indicators/check-dependency.ts']);
        expect(checked.code,checked.output).toBe(0);
        // 脚本放在新安装目录内，由该目录解析实际依赖，不从工作区导入应用计算器。
        await writeFile(join(directory,'verify.ts'), `
import {ADX,DX,WSMA} from 'trading-signals';
const dx=new DX(2,WSMA); const adx=new ADX(2,WSMA);
const results=[];
for(const close of [100,100,100,101,102,103,104]) {
    const input={high:close,low:close,close};
    dx.add(input); adx.add(input);
    if(adx.isStable)results.push(adx.getResultOrThrow());
    if(close===100 && dx.isStable && ![dx.getResultOrThrow(),dx.pdi,dx.mdi].every(value=>Object.is(value,0)))throw Error('DX 平盘不是有效零');
}
const expected=[0,50,75,87.5,93.75];
if(results.length!==expected.length||!results.every((value,index)=>Object.is(value,expected[index])))throw Error('新安装 ADX 结果不符');
console.log('registered ADX patch verified');
`);
        const verified = await run(['verify.ts']);
        expect(verified.code,verified.output).toBe(0);
        expect(verified.output).toContain('registered ADX patch verified');
        const containerfile = await readFile(join(prepared.directory,'Containerfile'),'utf8');
        expect(containerfile.indexOf('COPY patches/ ./patches/')).toBeGreaterThan(-1);
        expect(containerfile.indexOf('COPY patches/ ./patches/')).toBeLessThan(containerfile.indexOf('RUN bun install --frozen-lockfile'));
        await rm(join(directory,'node_modules'),{recursive:true});
        await rm(join(directory,patches[0]!));
        const missing = await run(['install','--frozen-lockfile','--offline','--ignore-scripts']);
        expect(missing.code).not.toBe(0);
        expect(missing.output).toContain('patch');
    } finally { await rm(directory,{recursive:true,force:true}); }
},30000);
