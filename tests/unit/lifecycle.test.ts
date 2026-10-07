import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('stop 定位本项目对应配置，配置删除后仍可停，保留其它 Bun 进程并可重复执行', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-stop-'));
    const configPath = join(directory, 'config with spaces.toml');
    const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('offline') });
    const port = portProbe.port;
    portProbe.stop(true);
    const example = await Bun.file('config.example.toml').text();
    await Bun.write(configPath, example.replace('username = ""', 'username = "offline"')
        .replace('password = ""', 'password = "offline"').replace('port = 5174', `port = ${port}`));
    const otherEntry = join(directory, 'scripts/crypto/entry.ts');
    await mkdir(join(directory, 'scripts/crypto'), { recursive: true });
    await Bun.write(otherEntry, 'setInterval(() => {}, 1000);\n');
    const other = Bun.spawn(['bun', otherEntry, 'dev', configPath], { stdout: 'ignore', stderr: 'ignore' });
    const server = Bun.spawn(['bun', 'scripts/crypto/entry.ts', 'dev', configPath], { stdout: 'ignore', stderr: 'ignore' });
    try {
        let ready = false;
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && server.exitCode === null) {
            try { ready = (await fetch(`http://127.0.0.1:${port}/api/crypto/runtime`, { signal: AbortSignal.timeout(500) })).ok; }
            catch {}
            if (ready) break;
            await Bun.sleep(50);
        }
        expect(ready).toBe(true);
        await rm(configPath);
        const stop = Bun.spawn(['just', 'crypto', '--stop', `--config=${configPath}`], { stdout: 'pipe', stderr: 'pipe' });
        const output = new Response(stop.stdout).text();
        expect(await stop.exited).toBe(0);
        expect(await output).toContain('已停止看盘进程');
        await server.exited;
        expect(other.exitCode).toBeNull();
        const again = Bun.spawnSync(['just', 'crypto', '--stop', `--config=${configPath}`]);
        expect(again.exitCode).toBe(0);
        expect(again.stdout.toString()).toContain('没有运行中的看盘进程');
    } finally {
        for (const process of [server, other]) if (process.exitCode === null) process.kill('SIGTERM');
        await Promise.all([server.exited, other.exited]);
        await rm(directory, { recursive: true, force: true });
    }
}, 15000);
