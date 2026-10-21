import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { configProfile, mergeConfig, overridePath, configurationFiles, configurationId } from '../../scripts/config-profile';
import { loadCryptoConfig } from '../../scripts/crypto/config';
import { deploymentPlan } from '../../scripts/deploy/plan';
import { deploymentConfig } from '../../scripts/deploy/schema';
import { sourceManifest, prepareInputs } from '../../scripts/deploy/inputs';

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
    expect(help.stdout.toString()).toContain('--restart');
    for (const args of [['--start'], ['--target=local', '--upload'], ['--target=remote', '--skip-config', '--start'],
        ['--restart'], ['--target=local', '--start', '--status'], ['--target=local', '--build', '--logs'],
        ['--target=local', '--start', '--restart'], ['--target=local', '--stop', '--restart'], ['--target=local', '--stop', '--start'],
        ['--target=local', '--restart', '--restart'], ['--target=remote', '--target=local', '--build'], ['--wat']]) {
        expect(Bun.spawnSync(['bash', 'scripts/deploy/entry.sh', ...args]).exitCode).toBe(2);
    }
});
