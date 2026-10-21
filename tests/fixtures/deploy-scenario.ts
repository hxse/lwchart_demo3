import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export async function deployScenario(extra: Record<string, unknown> = {}, existing = true, profile: 'local' | 'remote' = 'local') {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-engine-'));
    const bin = join(directory, 'bin'), stateDir = join(directory, '.deploy', profile), source = join(directory, 'source');
    await mkdir(bin); await mkdir(stateDir, { recursive: true }); await mkdir(source);
    await writeFile(join(source, 'public'), 'public-input');
    await writeFile(join(source, '.manifest.sha256'), `${createHash('sha256').update('public-input').digest('hex')}  public\n`);
    const config = join(directory, 'private config.toml'); await writeFile(config, 'OFFLINE_SECRET');
    const sourceId = 'a'.repeat(64), configId = 'b'.repeat(64);
    const plan = { profile, server_port: 5174, container_name: 'lwchart-market', image_name: 'localhost/lwchart-market', source_id: sourceId,
        source_dir: source, configuration_id: configId, config_files: [{ source: config, name: 'config.toml' }] };
    await writeFile(join(stateDir, 'pending.json'), JSON.stringify(plan));
    await writeFile(join(stateDir, 'prepared-image'), `${plan.image_name}:${sourceId}\n`);
    if (existing) await writeFile(join(stateDir, 'active.json'), JSON.stringify(plan));
    const stateFile = join(directory, 'state.json');
    await writeFile(stateFile, JSON.stringify({ calls: [], removedImages: [],
        runtime: { container_name: plan.container_name, container_network: 'trading-net', publish_host: '127.0.0.1', publish_port: 5175,
            server_port: 5174, log_max_size: 10485760, configuration_id: configId },
        containers: existing ? [{ name: 'lwchart-market', id: 'old-id', image: 'old-image', owner: 'lwchart_demo3', profile,
            source: 'previous', config: configId, running: true }] : [], ...extra }));
    const fixture = resolve('tests/fixtures/deploy-tools.ts');
    for (const tool of ['podman', 'curl', 'ssh', 'rsync']) {
        await writeFile(join(bin, tool), `#!/usr/bin/env bash\nexec ${quote(process.execPath)} ${quote(fixture)} ${tool} "$@"\n`, { mode: 0o755 });
    }
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_MOCK_DIR: directory };
    const command = async (args: string[], cwd = process.cwd()) => {
        const child = Bun.spawn(args, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
        const stdout = new Response(child.stdout).text(), stderr = new Response(child.stderr).text();
        return { code: await child.exited, output: (await stdout) + (await stderr) };
    };
    const read = async () => JSON.parse(await readFile(stateFile, 'utf8'));
    const update = async (patch: Record<string, unknown>) => writeFile(stateFile, JSON.stringify({ ...await read(), ...patch }));
    return { directory, bin, stateDir, source, config, plan, env, command, read, update,
        run: (...actions: string[]) => command(['bash', 'scripts/deploy/engine.sh', stateDir, ...actions]),
        cleanup: () => rm(directory, { recursive: true, force: true }) };
}
