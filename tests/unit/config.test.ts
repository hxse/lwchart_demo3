import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { legacyTarget, loadCryptoConfig } from '../../scripts/crypto/config';
import { staticHandler } from '../../scripts/crypto/static';
import { runtime } from '../fixtures/data';

test('配置默认值、字面密码与路径、不含凭据的 runtime', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-config-'));
    const example = await Bun.file('config.example.toml').text();
    const password = '  PRIVATE_$()_${HOME}  ';
    const path = join(directory, 'config with spaces.toml');
    try {
        await Bun.write(path, example.replace('username = ""', 'username = "offline-user"').replace('password = ""', `password = '${password}'`));
        const config = await loadCryptoConfig(path);
        expect(config.backend.password).toBe(password);
        expect(config.runtime).toEqual(runtime);
        expect(config.runtime.defaults.history_bars).toBe(1000);
        expect(config.runtime).not.toHaveProperty('data');
        expect(config.runtime.defaults.tq.symbol).toBe('KQ.m@SHFE.rb');
        expect(JSON.stringify(config.runtime)).not.toContain('PRIVATE');
        expect(await legacyTarget(path)).toBe(join(homedir(), 'dev/pyo3-quant/data/lwchart'));
        const configured = await Bun.file(path).text();
        await Bun.write(path, configured.replace('dock_position = "right"', ''));
        expect((await loadCryptoConfig(path)).runtime.defaults.dock_position).toBe('right');
        await Bun.write(path, configured.replace('dock_position = "right"', 'dock_position = "top"'));
        expect((await loadCryptoConfig(path)).runtime.defaults.dock_position).toBe('top');
        await Bun.write(path, configured.replace('dock_position = "right"', 'dock_position = "invalid"'));
        await expect(loadCryptoConfig(path)).rejects.toThrow('按钮栏位置必须');
        await Bun.write(path, configured.replace('source = "ccxt"', 'source = "tq"'));
        expect((await loadCryptoConfig(path)).runtime.defaults.tq.symbol).toBe('KQ.m@SHFE.rb');
        for (const field of ['incremental_bars = 5', 'max_catchup_pages = 2', 'symbol = "WRONG_OWNER"']) {
            await Bun.write(path, configured.replace('[dashboard]', `[dashboard]\n${field}`));
            await expect(loadCryptoConfig(path)).rejects.toThrow('dashboard 含有未知字段');
        }
        await Bun.write(path, configured.replace('theme = "dark"', 'theme = "light"'));
        expect((await loadCryptoConfig(path)).runtime.defaults.theme).toBe('light');
        for (const replacement of ['', 'theme = "auto"']) {
            await Bun.write(path, configured.replace('theme = "dark"', replacement));
            await expect(loadCryptoConfig(path)).rejects.toThrow('主题必须是 dark 或 light');
        }
        await Bun.write(path, configured.replace('history_bars = 1000', 'history_bars = 10000'));
        expect((await loadCryptoConfig(path)).runtime.defaults.history_bars).toBe(10000);
        await Bun.write(path, configured.replace('history_bars = 1000', 'history_bars = 10001'));
        await expect(loadCryptoConfig(path)).rejects.toThrow('历史 K 线数量 必须是 1..10000 的整数');
        const literal = join(directory, 'literal $USER $(touch ignored)');
        await Bun.write(path, `[legacy]\nlibrary_target_dir = '${literal}'\n`);
        expect(await legacyTarget(path)).toBe(literal);
        await expect(loadCryptoConfig(path)).rejects.toThrow('backend');
        await Bun.write(path, example);
        await expect(loadCryptoConfig(path)).rejects.toThrow('backend.username');
        await Bun.write(path, '[backend]\npassword = "UNTERMINATED_SECRET');
        await expect(loadCryptoConfig(path)).rejects.toThrow('无法读取配置，请核对配置路径与 TOML 格式');
        const ignore = Bun.spawnSync(['git', 'check-ignore', 'config.toml', 'config.toml.bak']);
        expect(ignore.exitCode).toBe(0);
        expect(ignore.stdout.toString()).toContain('config.toml');
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Just 帮助不读配置、未知与互斥动作退出二，旧 build:lib 已退出', async () => {
    for (const command of [['just'], ['just', 'legacy', '--help', '--config=/missing'], ['just', 'market', '--help', '--config=/missing']]) {
        const process = Bun.spawnSync(command);
        expect(process.exitCode).toBe(0);
        expect(process.stdout.toString()).toMatch(/legacy|market/);
    }
    for (const args of [['market', '--dev', '--build'], ['market', '--stop', '--dev'], ['market', '--unknown'], ['market', '--config='], ['legacy', '--dev'], ['legacy', '--stop'], ['crypto', '--help']]) {
        expect(Bun.spawnSync(['bash', 'scripts/scenario.sh', ...args]).exitCode).toBe(2);
    }
    const pkg = await Bun.file('package.json').json();
    expect(pkg.scripts['build:lib']).toBeUndefined();
    const old = Bun.spawnSync(['just', 'crypto', '--help']);
    expect(old.exitCode).not.toBe(0);
    expect(old.stderr.toString()).toContain('crypto');
});

test('生产静态仅服务构建目录，拒绝私密文件和越界路径', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-static-'));
    try {
        await Bun.write(join(directory, 'index.html'), '<html>offline</html>');
        await Bun.write(join(directory, 'config.toml'), 'PRIVATE');
        const serve = staticHandler(directory);
        expect(await (await serve(new Request('http://local/'))).text()).toContain('offline');
        for (const path of ['/config.toml', '/config.toml.bak', '/.git/config', '/%2e%2e%2fconfig.toml', '/@fs/home/config.toml']) {
            const response = await serve(new Request(`http://local${path}`));
            expect(response.status).toBe(404); expect(await response.text()).not.toContain('PRIVATE');
        }
        expect((await serve(new Request('http://local/', { method: 'POST' }))).status).toBe(405);
    } finally { await rm(directory, { recursive: true, force: true }); }
});
