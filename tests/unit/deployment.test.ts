import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { configProfile, mergeConfig, overridePath, configurationFiles, configurationId } from '../../scripts/config-profile';
import { loadCryptoConfig } from '../../scripts/crypto/config';
import { deploymentPlan } from '../../scripts/deploy/plan';
import { deploymentConfig } from '../../scripts/deploy/schema';
import { sourceManifest, prepareInputs } from '../../scripts/deploy/inputs';
import { createHash } from 'node:crypto';

test('场景与递归覆盖，数组／false／0／空串替换；开发忽略覆盖，坏配置不泄漏私有值', async () => {
    expect(mergeConfig({ a: { x: 1, y: 2 }, b: [1, 2], c: true, d: 1, e: 'x' }, { a: { x: 3 }, b: [], c: false, d: 0, e: '' }))
        .toEqual({ a: { x: 3, y: 2 }, b: [], c: false, d: 0, e: '' });
    for (const value of ['', 'prod']) expect(() => configProfile(value)).toThrow('必须明确指定');
    const savedProfile = process.env.APP_CONFIG_PROFILE;
    delete process.env.APP_CONFIG_PROFILE;
    try { expect(() => configProfile()).toThrow('必须明确指定'); }
    finally { process.env.APP_CONFIG_PROFILE = savedProfile; }
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-profile-'));
    const path = join(directory, 'config with spaces.toml');
    const marker = 'PROFILE_PRIVATE_$()';
    try {
        const base = (await Bun.file('config.example.toml').text()).replace('username = ""', 'username = "offline"').replace('password = ""', `password = '${marker}'`);
        await writeFile(path, base);
        await writeFile(overridePath(path, 'local'), '[backend]\nbase_url="http://ccxt-proxy2:5123"\n[server]\nhost="0.0.0.0"\n[dashboard]\ntheme="light"\nindicators=[]\n[ccxt]\nis_live=false\n[deploy]\npublish_port=5175\n');
        expect((await loadCryptoConfig(path, 'dev')).backend.base_url).toBe('http://127.0.0.1:5123');
        const local = await loadCryptoConfig(path, 'local');
        expect(local.server.host).toBe('0.0.0.0'); expect(local.backend.password).toBe(marker);
        expect(local.runtime.defaults).toMatchObject({ theme: 'light', indicators: [], ccxt: { is_live: false } });
        const plan = await deploymentPlan(path, 'local');
        expect(plan.config_files).toHaveLength(2); expect(JSON.stringify(plan)).not.toContain(marker);
        expect(plan.configuration_id).toBe(await configurationId(await configurationFiles(path, 'local')));
        await expect(loadCryptoConfig(path, 'remote')).rejects.toThrow('内部监听 0.0.0.0');
        await writeFile(overridePath(path, 'local'), `[backend]\npassword="${marker}`);
        await expect(loadCryptoConfig(path, 'local')).rejects.toThrow('无法读取覆盖配置');
        try { await loadCryptoConfig(path, 'local'); } catch (e) { expect((e as Error).message).not.toContain(marker); }
        await writeFile(overridePath(path, 'local'), '[server]\nhost="0.0.0.0"\n[dashboard]\nhistory_bars=0\n');
        await expect(loadCryptoConfig(path, 'local')).rejects.toThrow('历史 K 线数量');
        await writeFile(path, base.replace('host = "127.0.0.1"', 'host = "0.0.0.0"'));
        await expect(loadCryptoConfig(path, 'dev')).rejects.toThrow('回环监听');
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('部署元数据回环限制、默认网络和远端路径，非法字段与危险参数明确失败', () => {
    expect(deploymentConfig(undefined)).toMatchObject({ container_network: 'trading-net', publish_host: '127.0.0.1',
        remote: { ssh_host: 'rn', root_dir: '~/dev/lwchart_demo3' } });
    expect(() => deploymentConfig({ publish_host: '0.0.0.0' })).toThrow('只允许 127.0.0.1');
    expect(() => deploymentConfig({ publish_port: 0 })).toThrow('发布端口');
    expect(() => deploymentConfig({ extra: true })).toThrow('未知字段');
    expect(() => deploymentConfig({ remote: { ssh_host: '-flag' } })).toThrow('SSH 主机');
    expect(() => deploymentConfig({ remote: { root_dir: '~/dev/../../etc' } })).toThrow('远端目录');
});

test('源码清单只含白名单，配置／缓存／历史不进入；同内容稳定，代码修改改变 ID', async () => {
    const root = resolve(import.meta.dirname, '../..');
    const manifest = await sourceManifest(root);
    expect(manifest.files.some(file => file.path === 'scripts/crypto/production.ts')).toBe(true);
    const patchPaths = Object.values((await Bun.file(join(root,'package.json')).json()).patchedDependencies) as string[];
    expect(manifest.files.filter(file => file.path.startsWith('patches/')).map(file => file.path)).toEqual(patchPaths);
    expect(manifest.files.every(file => !/config(?:\.local|\.remote)?\.toml|node_modules|\.git|\.jj|doc\//.test(file.path))).toBe(true);
    expect((await sourceManifest(root)).id).toBe(manifest.id);
    const prepared = await prepareInputs(root);
    expect(prepared.id).toBe(manifest.id);
    const copied = await Bun.file(join(prepared.directory, '.manifest.json')).json();
    expect(copied).toEqual(manifest);
    expect(await Bun.file(join(prepared.directory, 'config.toml')).exists()).toBe(false);
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-source-'));
    try {
        for (const file of manifest.files.filter(file => !file.path.includes('/') || patchPaths.includes(file.path))) {
            await mkdir(dirname(join(directory,file.path)),{recursive:true});
            await writeFile(join(directory, file.path), await readFile(join(root, file.path)));
        }
        await mkdir(join(directory, 'src')); await mkdir(join(directory, 'scripts'));
        await writeFile(join(directory, 'src/example.ts'), 'export const value = 1;');
        const previous = (await sourceManifest(directory)).id;
        await writeFile(join(directory, 'src/example.ts'), 'export const value = 2;');
        expect((await sourceManifest(directory)).id).not.toBe(previous);
        const patch = patchPaths[0]!;
        expect(await readFile(join(prepared.directory,patch),'utf8')).toBe(await readFile(join(root,patch),'utf8'));
        const beforePatch = (await sourceManifest(directory)).id;
        await writeFile(join(directory,patch), 'changed patch');
        expect((await sourceManifest(directory)).id).not.toBe(beforePatch);
        await writeFile(join(directory,'patches/unregistered.patch'),'private unregistered input');
        expect((await sourceManifest(directory)).files.some(file => file.path.endsWith('unregistered.patch'))).toBe(false);
        for (const path of ['../private.patch','/tmp/private.patch','patches/../private.patch','patches/nested/private.patch']) {
            await writeFile(join(directory,'package.json'),JSON.stringify({patchedDependencies:{'trading-signals@8.3.0':path}}));
            await expect(sourceManifest(directory)).rejects.toThrow('依赖补丁必须是 patches/');
        }
        await writeFile(join(directory,'package.json'),await readFile(join(root,'package.json')));
        await rm(join(directory,patch));
        await expect(sourceManifest(directory)).rejects.toThrow('ENOENT');
        await symlink(join(root,patch),join(directory,patch));
        await expect(sourceManifest(directory)).rejects.toThrow('不允许符号链接');
        await rm(join(directory,'patches'),{recursive:true});
        await symlink(join(root,'patches'),join(directory,'patches'));
        await expect(sourceManifest(directory)).rejects.toThrow('不允许符号链接');
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('部署帮助无需配置，未知／重复／缺目标／非法组合在操作前失败', () => {
    const help = Bun.spawnSync(['just', 'deploy', '--help', '--config=/missing']);
    expect(help.exitCode).toBe(0); expect(help.stdout.toString()).toContain('--target=local|remote');
    for (const args of [['--start'], ['--target=local', '--upload'], ['--target=remote', '--skip-config', '--start'],
        ['--target=local', '--start', '--status'], ['--target=remote', '--target=local', '--build'], ['--wat']]) {
        expect(Bun.spawnSync(['bash', 'scripts/deploy/entry.sh', ...args]).exitCode).toBe(2);
    }
});

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
async function scenario(extra: Record<string, unknown>, existing = true, profile: 'local' | 'remote' = 'local') {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-engine-'));
    const bin = join(directory, 'bin'); const stateDir = join(directory, 'deployment'); const source = join(directory, 'source');
    await mkdir(bin); await mkdir(stateDir); await mkdir(source);
    await writeFile(join(source, 'public'), 'public-input');
    await writeFile(join(source, '.manifest.sha256'), `${createHash('sha256').update('public-input').digest('hex')}  public\n`);
    const config = join(directory, 'private config.toml'); await writeFile(config, 'OFFLINE_SECRET');
    const sourceId = 'a'.repeat(64); const configId = 'b'.repeat(64);
    const plan = { profile, server_port: 5174, container_name: 'lwchart-market', image_name: 'localhost/lwchart-market', source_id: sourceId,
        source_dir: source, configuration_id: configId, config_files: [{ source: config, name: 'config.toml' }] };
    await writeFile(join(stateDir, 'pending.json'), JSON.stringify(plan));
    if (existing) await writeFile(join(stateDir, 'active.json'), JSON.stringify(plan));
    await writeFile(join(directory, 'state.json'), JSON.stringify({ calls: [], removedImages: [],
        runtime: { container_name: plan.container_name, container_network: 'trading-net', publish_host: '127.0.0.1', publish_port: 5175,
            server_port: 5174, log_max_size: 10485760, configuration_id: configId },
        containers: existing ? [{ name: 'lwchart-market', id: 'old-id', image: 'old-image', owner: 'lwchart_demo3', profile,
            source: 'previous', config: configId, running: true }] : [], ...extra }));
    const fixture = resolve('tests/fixtures/deploy-tools.ts');
    for (const tool of ['podman', 'curl']) await writeFile(join(bin, tool), `#!/usr/bin/env bash\nexec ${quote(process.execPath)} ${quote(fixture)} ${tool} "$@"\n`, { mode: 0o755 });
    const run = async (...actions: string[]) => {
        const child = Bun.spawn(['bash', 'scripts/deploy/engine.sh', stateDir, ...actions], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_MOCK_DIR: directory }, stdout: 'pipe', stderr: 'pipe' });
        const stdout = new Response(child.stdout).text(); const stderr = new Response(child.stderr).text();
        return { code: await child.exited, output: (await stdout) + (await stderr) };
    };
    return { directory, config, run, read: async () => JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')),
        cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('生命周期成功替换先停旧实例，只清理旧 ID，回环映射及无自启；重复启动无第二实例', async () => {
    const s = await scenario({});
    try {
        const result = await s.run('start'); expect(result.code).toBe(0); expect(result.output).not.toContain('OFFLINE_SECRET');
        const state = await s.read(); expect(state.containers).toHaveLength(1); expect(state.containers[0].name).toBe('lwchart-market');
        expect(state.removedImages).toEqual(['old-image']);
        const actual = state.calls.find((call: string[]) => call.includes('-d'));
        const preflight = state.calls.filter((call: string[]) => call[1] === 'run' && !call.includes('-d'));
        expect(preflight.every((call: string[]) => call.includes('--read-only') && call.includes('--cap-drop=all') && call.includes('--security-opt=no-new-privileges'))).toBe(true);
        expect(actual).toContain('127.0.0.1:5175:5174'); expect(actual.some((arg: string) => arg.startsWith('--restart'))).toBe(false);
        expect(state.calls.findIndex((call: string[]) => call[1] === 'stop')).toBeLessThan(state.calls.indexOf(actual));
        expect((await s.run('start')).output).toContain('无需重复启动');
        expect((await s.read()).containers).toHaveLength(1);
    } finally { await s.cleanup(); }
});

test('后端不可用不阻断本地或远端构建、首次启动、更新及幂等，部署不探测后端', async () => {
    for (const profile of ['local', 'remote'] as const) for (const existing of [false, true]) {
        const s = await scenario({ failProbe: true, noImage: true }, existing, profile);
        try {
            const result = await s.run('build', 'start');
            expect(result.code).toBe(0); expect(result.output).toContain('看盘容器已就绪');
            const state = await s.read();
            expect(state.containers).toHaveLength(1); expect(state.containers[0]).toMatchObject({ profile, running: true });
            expect(state.calls.some((call: string[]) => call[1] === 'build')).toBe(true);
            expect(state.calls.some((call: string[]) => call.includes('--probe-backend'))).toBe(false);
            expect(state.calls.filter((call: string[]) => call[0] === 'curl').every((call: string[]) => call.at(-1)?.endsWith('/healthz'))).toBe(true);
            expect((await s.run('build', 'start')).output).toContain('无需重复启动');
            const repeated = await s.read();
            expect(repeated.containers).toHaveLength(1);
            expect(repeated.calls.filter((call: string[]) => call.includes('-d'))).toHaveLength(1);
            expect(repeated.calls.some((call: string[]) => call.includes('--probe-backend'))).toBe(false);
        } finally { await s.cleanup(); }
    }
});

test('候选未就绪恢复旧容器，网络／旧配置／外来资源失败时不停止旧服务', async () => {
    for (const extra of [{ failCandidate: true }, { noNetwork: true }, { noDns: true }, { invalidOld: true },
        { containers: [{ name: 'lwchart-market', id: 'old-id', image: 'old-image', owner: 'foreign', profile: 'local', running: true }] }]) {
        const s = await scenario(extra);
        try {
            expect((await s.run('start')).code).not.toBe(0);
            const state = await s.read();
            expect(state.containers).toHaveLength(1); expect(state.containers[0].id).toBe('old-id'); expect(state.containers[0].running).toBe(true);
            expect(state.removedImages).toEqual([]);
            if (!('failCandidate' in extra)) expect(state.calls.some((call: string[]) => call[1] === 'stop')).toBe(false);
        } finally { await s.cleanup(); }
    }
});

test('控制不依赖配置或凭据，stop 可重复，其他镜像引用时保留旧镜像', async () => {
    const s = await scenario({ imageReferenced: true });
    try {
        expect((await s.run('start')).code).toBe(0); expect((await s.read()).removedImages).toEqual([]);
        await rm(s.config);
        expect((await s.run('status')).code).toBe(0); expect((await s.run('logs')).output).toContain('offline-service-log');
        expect((await s.run('stop')).code).toBe(0); expect((await s.run('stop')).code).toBe(0);
    } finally { await s.cleanup(); }
});
