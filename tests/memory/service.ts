import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

async function memory(pid: number) {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    const value = (key: string) => Number(status.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1]) * 1024;
    return { rss: value('VmRSS'), anon: value('RssAnon'), peak: value('VmHWM'), swap: value('VmSwap') };
}

/** 独立模拟后端与生产包；不读取用户配置，不对正在运行的服务施加负载。 */
export async function measureService(root: string, smol: boolean, signal: AbortSignal) {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-memory-service-'));
    const rows = Array.from({ length: 10000 }, (_, i) => [1718000000001 + i * 60000, 100, 105, 99, 104, i]);
    const bodies = new Map<string, string>();
    for (const count of [5, 1000, 10000]) {
        const selected = rows.slice(-count);
        bodies.set(`ccxt-${count}`, JSON.stringify({ rows: selected, last_bar_completion_confirmed: false }));
        bodies.set(`tq-${count}`, '[' + selected.map(([time, open, high, low, close, volume]) =>
            `{"datetime":${BigInt(time) * 1000000n},"open":${open},"high":${high},"low":${low},"close":${close},"volume":${volume},"id":1}`).join(',') + ']');
    }
    const backend = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/auth/token') return Response.json({ access_token: 'offline-token', token_type: 'bearer', expires_in: 3600 });
        if (request.headers.get('Authorization') !== 'Bearer offline-token') return new Response(null, { status: 401 });
        const tq = url.pathname === '/tq/fetch_ohlcv';
        const body = bodies.get(`${tq ? 'tq' : 'ccxt'}-${url.searchParams.get(tq ? 'data_length' : 'limit')}`);
        return new Response(body, { status: body ? 200 : 400, headers: { 'Content-Type': 'application/json' } });
    } });
    let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
    let logs: Promise<string[]> | undefined;
    try {
        const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
        const port = portProbe.port!;
        portProbe.stop(true);
        const template = await readFile(join(root, 'config.example.toml'), 'utf8');
        const config = template.replace('username = ""', 'username = "offline"').replace('password = ""', 'password = "offline"')
            .replace('http://127.0.0.1:5123', `http://127.0.0.1:${backend.port}`).replace('port = 5174', `port = ${port}`);
        const path = join(directory, 'config.toml');
        await Bun.write(path, config);
        child = Bun.spawn([process.execPath, ...(smol ? ['--smol'] : []), join(root, 'dist-market/server.js'), path], {
            cwd: root, env: { ...process.env, APP_CONFIG_PROFILE: 'dev', PROJECT_EXECUTION_CONTEXT: 'host' },
            stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal,
        });
        logs = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
        const origin = `http://127.0.0.1:${port}`;
        const deadline = Date.now() + 10000;
        let ready = false;
        while (Date.now() < deadline && child.exitCode === null) {
            signal.throwIfAborted();
            try { ready = (await fetch(`${origin}/healthz`, { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]) })).ok; }
            catch { /* 仅等待隔离服务绑定临时端口。 */ }
            if (ready) break;
            await Bun.sleep(25);
        }
        assert(ready, '离线生产服务未就绪');
        const startup = await memory(child.pid);
        for (const path of ['/', '/api/crypto/runtime']) {
            const response = await fetch(origin + path, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
            assert.equal(response.status, 200);
            await response.arrayBuffer();
        }
        const stages: unknown[] = [];
        for (const [name, count, rounds] of [['initial', 1000, 2], ['poll', 5, 100], ['reload', 10000, 8]] as const) {
            const latencies: number[] = [];
            const start = performance.now();
            for (let round = 0; round < rounds; round++) {
                await Promise.all(Array.from({ length: 4 }, async (_, slot) => {
                    const tq = slot % 2 === 1;
                    const path = tq ? `/api/tq/fetch_ohlcv?symbol=KQ.m@SHFE.rb&duration_seconds=1800&data_length=${count}`
                        : `/api/ccxt/fetch_ohlcv/latest-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=30m&limit=${count}`;
                    const started = performance.now();
                    const response = await fetch(origin + path, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
                    assert.equal(response.status, 200);
                    const data = await response.json();
                    assert.equal(data.rows.length, count);
                    assert.deepEqual(data.rows[0], rows[rows.length - count]);
                    assert.deepEqual(data.rows.at(-1), rows.at(-1));
                    latencies.push(performance.now() - started);
                }));
            }
            latencies.sort((a, b) => a - b);
            stages.push({ name, requests: latencies.length, elapsed_ms: performance.now() - start,
                p50_ms: latencies[Math.floor(latencies.length * .5)], p95_ms: latencies[Math.floor(latencies.length * .95)],
                memory_bytes: await memory(child.pid) });
        }
        await Bun.sleep(2000);
        signal.throwIfAborted();
        return { startup_bytes: startup, stages, idle_bytes: await memory(child.pid) };
    } finally {
        if (child?.exitCode === null) child.kill('SIGTERM');
        if (child) await child.exited;
        if (logs) {
            const [, stderr] = await logs;
            if (stderr) console.error(stderr);
        }
        backend.stop(true);
        await rm(directory, { recursive: true, force: true });
    }
}
