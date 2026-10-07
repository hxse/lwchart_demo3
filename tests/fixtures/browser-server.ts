import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';
import { legacyZip } from './legacy';
import { staticHandler } from '../../scripts/crypto/static';

// 此服务仅由离线测试显式启动，不进入生产 API 或构建。
const root = resolve(import.meta.dirname, '../..');
const directory = await mkdtemp(join(tmpdir(), 'lwchart-browser-'));
const secret = 'OFFLINE_PRIVATE_$()_MARKER';
const target = join(directory, 'legacy target $HOME');
const children: ReturnType<typeof Bun.spawn>[] = [];
let mock: ReturnType<typeof Bun.serve> | undefined;
let stopping = false;
const logs: string[] = [];
async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    await Promise.all(children.map(child => child.exited));
    mock?.stop(true);
    await rm(directory, { recursive: true, force: true });
    process.exit(code);
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });

async function run(command: string[]) {
    const child = Bun.spawn(command, { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    children.push(child);
    const stdout = new Response(child.stdout).text();
    const stderr = new Response(child.stderr).text();
    const exit = await child.exited;
    const output = (await stdout) + (await stderr);
    if (output.includes(secret)) throw new Error('测试凭据出现在构建日志');
    process.stdout.write(output);
    if (exit) throw new Error(`离线构建失败：${command.slice(0, 3).join(' ')}`);
}
async function launch(action: string, config: string) {
    const child = Bun.spawn(['bun', 'scripts/crypto/entry.ts', action, config], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    children.push(child);
    for (const stream of [child.stdout, child.stderr]) void (async () => {
        const decoder = new TextDecoder();
        const reader = stream.getReader();
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) { reader.releaseLock(); break; }
            const text = decoder.decode(chunk.value);
            if (text.includes(secret)) { console.error('测试凭据出现在服务日志'); await stop(1); return; }
            logs.push(text); process.stdout.write(text);
        }
    })();
    void child.exited.then(code => { if (!stopping) { console.error(`测试服务退出：${code}`); void stop(1); } });
}

interface Metrics { logins: number; reads: Array<{ timeframe: string; symbol: string; limit: number; since: number | null; history: boolean }> }
let metrics: Metrics = { logins: 0, reads: [] };
let advance = 0;
let revision = 0;
let errors: string[] = [];
let delay = 0;
const intervals: Record<string, number> = { '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '8h': 28800000, '12h': 43200000, '1d': 86400000, '3d': 259200000, '1w': 604800000 };
function rows(timeframe: string, symbol: string): OhlcvRow[] {
    const step = intervals[timeframe]!;
    const origin = timeframe === '1w' ? Date.UTC(2026, 9, 5) : Math.floor(Date.UTC(2026, 9, 7, 12) / step) * step;
    const count = timeframe === '1w' ? 350 : 3000;
    const base = symbol.startsWith('ETH') ? 3000 : 60000;
    return Array.from({ length: count + advance }, (_, index) => {
        const close = base + index * .8 + Math.sin(index / 13) * 130 + (index === count + advance - 1 ? revision : 0);
        return [origin - (count - 1 - index) * step, close - 6, close + 16, close - 16, close, 100 + index];
    });
}

async function main() {
    const example = await Bun.file(join(root, 'config.example.toml')).text();
    const configText = example.replace('username = ""', 'username = "offline-user"').replace('password = ""', `password = '${secret}'`)
        .replace('http://127.0.0.1:5123', 'http://127.0.0.1:43175').replace('port = 5174', 'port = 43174')
        .replace('max_catchup_pages = 20', 'max_catchup_pages = 2').replace('~/dev/pyo3-quant/data/lwchart', target);
    const config = join(directory, 'config.toml');
    const devConfig = join(directory, 'dev.toml');
    await Bun.write(config, configText); await Bun.write(devConfig, configText.replace('port = 43174', 'port = 43176'));
    await run(['just', 'crypto', '--build']);
    await run(['just', 'legacy', '--build', `--config=${config}`]);
    await run(['bun', 'run', 'build']);
    for (const filename of await readdir(join(root, 'dist-lib'))) {
        const original = await Bun.file(join(root, 'dist-lib', filename)).bytes();
        const copied = await Bun.file(join(target, filename)).bytes();
        if (Buffer.compare(original, copied)) throw new Error('旧库复制不完整');
        if (new TextDecoder().decode(original).includes(secret)) throw new Error('测试凭据进入旧产物');
    }
    const zip = await legacyZip();
    const oldApp = staticHandler(join(root, 'dist'));
    const styles = (await readdir(join(root, 'dist-lib'))).filter(n => n.endsWith('.css'));
    mock = Bun.serve({ hostname: '127.0.0.1', port: 43175, async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/' || url.pathname.startsWith('/assets/')) return oldApp(request);
        if (url.pathname === '/__fixture') {
            if (request.method === 'POST') {
                const state = await request.json();
                if (state.reset) { metrics = { logins: 0, reads: [] }; advance = 0; revision = 0; errors = []; delay = 0; }
                if (state.advance !== undefined) advance = state.advance;
                if (state.revision !== undefined) revision = state.revision;
                if (state.errors !== undefined) errors = state.errors;
                if (state.delay !== undefined) delay = state.delay;
            }
            return Response.json({ ...metrics, advance, revision, errors, logs });
        }
        if (url.pathname === '/legacy.zip') return new Response(new Uint8Array(zip).buffer, { headers: { 'Content-Type': 'application/zip' } });
        if (url.pathname.startsWith('/legacy-assets/')) {
            const filename = url.pathname.slice('/legacy-assets/'.length);
            if (filename.includes('/') || filename.includes('..')) return new Response(null, { status: 404 });
            return new Response(Bun.file(join(root, 'dist-lib', filename)));
        }
        if (url.pathname === '/legacy') return new Response(`<!doctype html><html><head>${styles.map(s => `<link rel="stylesheet" href="/legacy-assets/${s}">`).join('')}
            <style>html,body,#old{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="old"></div>
            <script src="/legacy-assets/chart-dashboard.umd.js"></script><script>fetch('/legacy.zip').then(r=>r.blob()).then(zipData=>window.ChartDashboardLib.mountDashboard(document.getElementById('old'),{zipData}));</script></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        if (url.pathname === '/auth/token' && request.method === 'POST') {
            const form = await request.formData();
            if (form.get('username') !== 'offline-user' || form.get('password') !== secret || form.get('grant_type') !== 'password') return new Response(null, { status: 401 });
            metrics.logins++;
            return Response.json({ access_token: 'offline-jwt', token_type: 'bearer', expires_in: 3600 });
        }
        if (url.pathname.startsWith('/file/') && request.method === 'GET') {
            if (request.headers.get('Authorization') !== 'Bearer offline-jwt') return new Response(null, { status: 401 });
            if (url.pathname === '/file/list') return Response.json({ files: [{ filename: 'legacy.zip', path: 'fixture/legacy.zip' }] });
            if (url.pathname === '/file/download') return new Response(new Uint8Array(zip).buffer, { headers: { 'Content-Type': 'application/zip' } });
        }
        if (!url.pathname.startsWith('/ccxt/fetch_ohlcv/') || request.method !== 'GET') return new Response(null, { status: 404 });
        if (request.headers.get('Authorization') !== 'Bearer offline-jwt') return new Response(null, { status: 401 });
        const timeframe = url.searchParams.get('timeframe')!;
        const symbol = url.searchParams.get('symbol')!;
        const limit = Number(url.searchParams.get('limit'));
        const since = url.searchParams.has('since') ? Number(url.searchParams.get('since')) : null;
        metrics.reads.push({ timeframe, symbol, limit, since, history: since === null || since === 1e12 });
        if (delay) await Bun.sleep(delay);
        if (errors.includes(timeframe)) return Response.json({ detail: { code: 'SERVICE_NOT_READY', message: secret } }, { status: 503 });
        const data = rows(timeframe, symbol);
        const selected = since === null ? data.slice(-limit) : data.filter(r => r[0] >= since).slice(0, limit);
        return Response.json({ rows: selected, last_bar_completion_confirmed: selected.length ? false : null });
    } });
    await launch('serve', config); await launch('dev', devConfig);
}
await main().catch(error => { console.error(error.message); void stop(1); });
