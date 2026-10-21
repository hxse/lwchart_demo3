import { expect, test } from 'bun:test';
import { copyFile, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { deployScenario } from '../fixtures/deploy-scenario';
import { sourceManifest } from '../../scripts/deploy/inputs';
import { deploymentPlan } from '../../scripts/deploy/plan';
import { overridePath } from '../../scripts/config-profile';

async function driver(profile: 'local' | 'remote' = 'local') {
    const s = await deployScenario({ noImage: true }, false, profile), root = resolve(import.meta.dirname, '../..');
    for (const file of (await sourceManifest(root)).files) {
        const target = join(s.directory, file.path); await mkdir(dirname(target), { recursive: true });
        await copyFile(join(root, file.path), target);
    }
    await copyFile(join(root, 'justfile'), join(s.directory, 'justfile'));
    await symlink(join(root, 'node_modules'), join(s.directory, 'node_modules'));
    const base = (await Bun.file(join(root, 'config.example.toml')).text()).replace('username = ""', 'username = "offline"').replace('password = ""', 'password = "DRIVER_PRIVATE"');
    await writeFile(s.config, base);
    const overlay = overridePath(s.config, profile);
    const remoteRoot = join(s.directory, 'remote-target');
    const updateConfig = async (port: number, internal = 5174) => {
        await writeFile(overlay, `[server]\nhost="0.0.0.0"\nport=${internal}\n[deploy]\npublish_port=${port}\n[deploy.remote]\nssh_host="offline"\nroot_dir="${remoteRoot}"\n`);
        const p = await deploymentPlan(s.config, profile);
        await s.update({ runtime: { container_name: p.container_name, container_network: p.container_network, publish_host: p.publish_host,
            publish_port: p.publish_port, server_port: p.server_port, log_max_size: p.log_max_size, configuration_id: p.configuration_id } });
    };
    await updateConfig(5175);
    const cli = (...args: string[]) => s.command(['just', 'deploy', `--target=${profile}`, `--config=${s.config}`, ...args], s.directory);
    return { ...s, cli, updateConfig, remoteState: join(remoteRoot, '.deploy') };
}
const count = (state: any, tool: string, action?: string) => state.calls.filter((call: string[]) => call[0] === tool && (!action || call[1] === action)).length;

test('Just 本地入口组合启停：源码变化不强制构建，重新加载配置，build stop 先构建再停止', async () => {
    const s = await driver();
    try {
        expect((await s.cli('--build', '--start')).code).toBe(0);
        const before = await s.read(), active = JSON.parse(await readFile(join(s.stateDir, 'active.json'), 'utf8'));
        expect(before.containers).toHaveLength(1);
        const rejected = await s.cli('--start'); expect(rejected.code).toBe(2); expect(rejected.output).toContain('实例已运行');
        await writeFile(join(s.directory, 'src/local-change.ts'), 'export const changed = true;\n');
        await s.updateConfig(5176, 5177);
        const restarted = await s.cli('--restart'); expect(restarted.code).toBe(0); expect(restarted.output).not.toContain('DRIVER_PRIVATE');
        const after = await s.read();
        expect(count(after, 'podman', 'build')).toBe(count(before, 'podman', 'build'));
        expect(after.calls.filter((call: string[]) => call.includes('-d')).at(-1)).toContain('127.0.0.1:5176:5177');
        const current = JSON.parse(await readFile(join(s.stateDir, 'active.json'), 'utf8'));
        expect(current.source_id).toBe(active.source_id); expect(current.configuration_id).not.toBe(active.configuration_id);
        expect((await s.cli('--stop')).code).toBe(0); expect((await s.cli('--stop')).output).toContain('实例已停止');
        expect((await s.cli('--start')).code).toBe(0);
        await s.update({ noImage: true });
        expect((await s.cli('--build', '--stop')).code).toBe(0);
        const stopped = await s.read(); expect(stopped.containers[0].running).toBe(false);
        const steps = stopped.calls.filter((call: string[]) => call[0] === 'podman' && ['build', 'stop'].includes(call[1]!));
        expect(steps.slice(-2).map((call: string[]) => call[1])).toEqual(['build', 'stop']);
        expect(count(stopped, 'ssh')).toBe(0);
    } finally { await s.cleanup(); }
}, 20000);

test('模拟 SSH 使用真实上传与远端引擎：不隐式上传构建，配置需上传，skip-config 保留远端完整快照', async () => {
    const s = await driver('remote');
    try {
        expect((await s.cli('--upload', '--build', '--start')).code).toBe(0);
        const before = await s.read(), activePath = join(s.remoteState, 'active.json');
        const active = JSON.parse(await readFile(activePath, 'utf8'));
        expect(before.containers[0]).toMatchObject({ profile: 'remote', running: true });
        expect(count(before, 'rsync')).toBeGreaterThan(0);
        expect(before.calls.filter((call: string[]) => call[0] === 'rsync' && call.includes('--chmod=F600,D700')).every((call: string[]) =>
            call.some(arg => arg.startsWith('--chown=')) || call.at(-1)!.includes('/incoming/'))).toBe(true);
        expect((await s.cli('--start')).code).toBe(2);
        // 本机源码及配置变化不会被单独 restart 隐式传到远端。
        await writeFile(join(s.directory, 'src/local-change.ts'), 'export const changed = true;\n');
        await s.updateConfig(5176);
        const nextRuntime = (await s.read()).runtime;
        await s.update({ runtime: before.runtime });
        expect((await s.cli('--restart')).code).toBe(0);
        const restarted = await s.read();
        expect(count(restarted, 'rsync')).toBe(count(before, 'rsync'));
        expect(count(restarted, 'podman', 'build')).toBe(count(before, 'podman', 'build'));
        expect(JSON.parse(await readFile(activePath, 'utf8')).configuration_id).toBe(active.configuration_id);
        await s.update({ noImage: true });
        expect((await s.cli('--upload', '--build', '--restart', '--skip-config')).code).toBe(0);
        const kept = JSON.parse(await readFile(activePath, 'utf8'));
        expect(kept.configuration_id).toBe(active.configuration_id); expect(kept.source_id).not.toBe(active.source_id);
        await s.update({ runtime: nextRuntime });
        expect((await s.cli('--upload', '--restart')).code).toBe(0);
        const updated = JSON.parse(await readFile(activePath, 'utf8'));
        expect(updated.source_id).toBe(kept.source_id); expect(updated.configuration_id).not.toBe(kept.configuration_id);
        expect(updated.publish_port).toBe(5176);
        expect((await s.cli('--build', '--stop')).code).toBe(0);
        expect((await s.read()).containers[0].running).toBe(false);
    } finally { await s.cleanup(); }
}, 30000);

test('远端单独上传不构建或启动，首次 skip-config 与未登记镜像的启动明确拒绝', async () => {
    const s = await driver('remote');
    try {
        const skipped = await s.cli('--upload', '--skip-config'); expect(skipped.code).toBe(2); expect(skipped.output).toContain('首次部署不能跳过完整配置');
        expect((await s.cli('--upload')).code).toBe(0);
        expect((await s.cli('--start')).code).toBe(2);
        const state = await s.read(); expect(state.containers).toEqual([]); expect(count(state, 'podman', 'build')).toBe(0);
        expect(state.calls.some((call: string[]) => call.includes('-d'))).toBe(false);
        expect((await s.cli('--build', '--restart')).code).toBe(0);
        expect((await s.read()).containers[0]).toMatchObject({ running: true, profile: 'remote' });
    } finally { await s.cleanup(); }
}, 20000);
