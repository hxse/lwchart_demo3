import { expect, test } from 'bun:test';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deployScenario as scenario } from '../fixtures/deploy-scenario';

const writes = (state: any) => state.calls.filter((call: string[]) => ['stop', 'rename', 'start', 'rm', 'rmi', 'build'].includes(call[1]!) || call.includes('-d'));

test('start 拒绝已运行实例，即使镜像和配置相同也不替换；build start 先构建再拒绝', async () => {
    const s = await scenario({});
    try {
        const rejected = await s.run('start'); expect(rejected.code).toBe(2); expect(rejected.output).toContain('实例已运行');
        expect(writes(await s.read())).toEqual([]);
        await s.update({ noImage: true });
        expect((await s.run('build', 'start')).code).toBe(2);
        const state = await s.read();
        expect(state.containers).toHaveLength(1); expect(state.containers[0]).toMatchObject({ id: 'old-id', running: true });
        expect(writes(state).map((call: string[]) => call[1])).toEqual(['build']);
    } finally { await s.cleanup(); }
});

test('restart 先停止再完整启动，成功后精确清理旧资源；同版再次 start 仍拒绝', async () => {
    const s = await scenario({});
    try {
        const result = await s.run('restart'); expect(result.code).toBe(0); expect(result.output).not.toContain('OFFLINE_SECRET');
        const state = await s.read(); expect(state.containers).toHaveLength(1); expect(state.containers[0].name).toBe('lwchart-market');
        expect(state.removedImages).toEqual(['old-image']);
        const actual = state.calls.find((call: string[]) => call.includes('-d'));
        const preflight = state.calls.filter((call: string[]) => call[1] === 'run' && !call.includes('-d'));
        expect(preflight.every((call: string[]) => call.includes('--read-only') && call.includes('--cap-drop=all') && call.includes('--security-opt=no-new-privileges'))).toBe(true);
        expect(actual).toContain('127.0.0.1:5175:5174'); expect(actual.some((arg: string) => arg.startsWith('--restart'))).toBe(false);
        expect(state.calls.findIndex((call: string[]) => call[1] === 'stop')).toBeLessThan(state.calls.indexOf(actual));
        expect((await s.run('start')).code).toBe(2);
        expect((await s.read()).calls.filter((call: string[]) => call.includes('-d'))).toHaveLength(1);
    } finally { await s.cleanup(); }
});

test('后端不可用仍支持本地和远端首次启动及显式重启，重复启动拒绝且不探测后端', async () => {
    for (const profile of ['local', 'remote'] as const) for (const existing of [false, true]) {
        const s = await scenario({ failProbe: true, noImage: true }, existing, profile);
        try {
            const result = await s.run('build', existing ? 'restart' : 'start');
            expect(result.code).toBe(0); expect(result.output).toContain('看盘容器已就绪');
            const state = await s.read();
            expect(state.containers).toHaveLength(1); expect(state.containers[0]).toMatchObject({ profile, running: true });
            expect(state.calls.some((call: string[]) => call[1] === 'build')).toBe(true);
            expect(state.calls.some((call: string[]) => call.includes('--probe-backend'))).toBe(false);
            expect(state.calls.filter((call: string[]) => call[0] === 'curl').every((call: string[]) => call.at(-1)?.endsWith('/healthz'))).toBe(true);
            expect((await s.run('build', 'start')).code).toBe(2);
            expect((await s.read()).calls.filter((call: string[]) => call.includes('-d'))).toHaveLength(1);
        } finally { await s.cleanup(); }
    }
});

test('stop 已停止时成功提示，restart 已停止或无实例时也按正式入口启动', async () => {
    const s = await scenario({}, false);
    try {
        expect((await s.run('restart')).code).toBe(0);
        expect((await s.run('stop')).code).toBe(0);
        const stops = (await s.read()).calls.filter((call: string[]) => call[1] === 'stop').length;
        expect((await s.run('stop')).output).toContain('实例已停止');
        expect((await s.run('restart')).code).toBe(0);
        const state = await s.read(); expect(state.containers).toHaveLength(1); expect(state.containers[0].running).toBe(true);
        expect(state.calls.filter((call: string[]) => call[1] === 'stop')).toHaveLength(stops);
        expect(state.calls.some((call: string[]) => call[1] === 'start' || call[1] === 'restart')).toBe(false);
    } finally { await s.cleanup(); }
});

test('build 失败不会停止或替换旧实例；build stop 成功后才停止且不启动', async () => {
    for (const action of ['start', 'stop', 'restart']) {
        const s = await scenario({ noImage: true, failBuild: true });
        try {
            const active = await readFile(join(s.stateDir, 'active.json'), 'utf8');
            expect((await s.run('build', action)).code).not.toBe(0);
            const state = await s.read(); expect(state.containers[0].running).toBe(true);
            expect(writes(state).map((call: string[]) => call[1])).toEqual(['build']);
            expect(await readFile(join(s.stateDir, 'active.json'), 'utf8')).toBe(active);
        } finally { await s.cleanup(); }
    }
    const s = await scenario({ noImage: true });
    try {
        expect((await s.run('build', 'stop')).code).toBe(0);
        const state = await s.read(); expect(state.containers[0].running).toBe(false);
        expect(writes(state).map((call: string[]) => call[1])).toEqual(['build', 'stop']);
    } finally { await s.cleanup(); }
});

test('停止失败或返回后仍运行时终止 restart，不创建候选', async () => {
    for (const extra of [{ failStop: true }, { ignoreStop: true }]) {
        const s = await scenario(extra);
        try {
            expect((await s.run('restart')).code).not.toBe(0);
            const state = await s.read(); expect(state.containers).toHaveLength(1); expect(state.containers[0].running).toBe(true);
            expect(writes(state).map((call: string[]) => call[1])).toEqual(['stop']);
        } finally { await s.cleanup(); }
    }
});

test('存在性或运行状态查询失败不能当作不存在或已停止，停止后的核对失败也不启动候选', async () => {
    for (const extra of [{ failExists: true }, { failRunning: true }, { invalidRunning: true }, { failStoppedRead: true }]) {
        const s = await scenario(extra);
        try {
            const result = await s.run('restart'); expect(result.code).toBe('invalidRunning' in extra ? 2 : 125);
            const state = await s.read(); expect(state.containers).toHaveLength(1);
            expect(state.containers[0].running).toBe(!('failStoppedRead' in extra));
            expect(writes(state).map((call: string[]) => call[1])).toEqual('failStoppedRead' in extra ? ['stop'] : []);
        } finally { await s.cleanup(); }
    }
});

test('停止后配置、网络或候选健康失败保持停止，不自动恢复旧服务，旧资源保留', async () => {
    for (const extra of [{ failCandidate: true }, { noNetwork: true }, { noDns: true }, { invalidConfig: true }]) {
        const s = await scenario(extra);
        try {
            expect((await s.run('restart')).code).not.toBe(0);
            const state = await s.read();
            expect(state.containers).toHaveLength(1); expect(state.containers[0]).toMatchObject({ id: 'old-id', name: 'lwchart-market', running: false });
            expect(state.removedImages).toEqual([]); expect(state.calls.some((call: string[]) => call[1] === 'start')).toBe(false);
        } finally { await s.cleanup(); }
    }
});

test('未登记或缺少配套镜像时不停止旧服务，也不隐式构建；外来同名容器始终拒绝操作', async () => {
    for (const missing of ['marker', 'image']) {
        const s = await scenario({ noImage: missing === 'image' });
        try {
            if (missing === 'marker') await rm(join(s.stateDir, 'prepared-image'));
            expect((await s.run('restart')).code).toBe(2); expect(writes(await s.read())).toEqual([]);
        } finally { await s.cleanup(); }
    }
    const s = await scenario({ containers: [{ name: 'lwchart-market', id: 'old-id', image: 'old-image', owner: 'foreign', profile: 'local', running: true }] });
    try {
        for (const action of ['start', 'restart', 'stop']) expect((await s.run(action)).code).toBe(2);
        const state = await s.read(); expect(writes(state)).toEqual([]); expect(state.containers[0].running).toBe(true);
    } finally { await s.cleanup(); }
});

test('控制不依赖配置或凭据，镜像有其它引用时保留；启停互斥而状态和日志可独立访问', async () => {
    const s = await scenario({ imageReferenced: true });
    let lock: ReturnType<typeof Bun.spawn> | undefined;
    try {
        expect((await s.run('restart')).code).toBe(0); expect((await s.read()).removedImages).toEqual([]);
        await rm(s.config);
        const holder = Bun.spawn(['flock', '-n', join(s.stateDir, 'operation.lock'), 'bash', '-c', 'printf ready; read -r release'],
            { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
        lock = holder;
        const reader = holder.stdout.getReader(); expect(new TextDecoder().decode((await reader.read()).value)).toBe('ready'); reader.releaseLock();
        expect((await s.run('restart')).output).toContain('此实例正在执行另一项部署操作');
        expect((await s.run('stop')).code).toBe(2);
        expect((await s.run('status')).code).toBe(0); expect((await s.run('logs')).output).toContain('offline-service-log');
        holder.stdin.write('release\n'); holder.stdin.end(); await holder.exited; lock = undefined;
        expect((await s.run('stop')).code).toBe(0); expect((await s.run('stop')).output).toContain('实例已停止');
    } finally { lock?.kill(); if (lock) await lock.exited; await s.cleanup(); }
});
