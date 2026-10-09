import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deploymentPlan } from '../../scripts/deploy/plan';
import { sourceManifest } from '../../scripts/deploy/inputs';

const root = resolve(import.meta.dirname, '../..');
const directory = await mkdtemp(join(tmpdir(), 'lwchart-container-'));
const prefix = `lwchart-check-${process.pid}`;
const network = `${prefix}-net`; const backend = `${prefix}-backend`; const service = `${prefix}-service`;
const ids: string[] = [];
let networkCreated = false;
async function run(args: string[], optional = false) {
    const child = Bun.spawn(args, { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const stdout = new Response(child.stdout).text(); const stderr = new Response(child.stderr).text();
    const code = await child.exited; const output = await stdout; const errors = await stderr;
    if (code && !optional) throw new Error(`容器验证命令失败：${args.slice(0, 3).join(' ')}\n${errors}`);
    return { code, output, errors };
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function freePort() {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const port = probe.port!; probe.stop(true); return port;
}
async function main() {
    const manifest = await sourceManifest(root);
    const image = `localhost/lwchart-market:${manifest.id}`;
    assert(!(await run(['podman', 'image', 'exists', image], true)).code, '需先构建配套缓存镜像；容器测试不会拉取镜像');
    const base = (await Bun.file(join(root, 'config.example.toml')).text()).replace('username = ""', 'username = "container-user"')
        .replace('password = ""', 'password = "CONTAINER_PRIVATE_MARKER"');
    const config = join(directory, 'config.toml'); const overlay = join(directory, 'config.local.toml');
    const port = freePort();
    await writeFile(config, base, { mode: 0o600 });
    const override = `[backend]\nbase_url="http://${backend}:5123"\n[server]\nhost="0.0.0.0"\n[deploy]\ncontainer_network="${network}"\ncontainer_name="${service}"\npublish_port=${port}\n`;
    await writeFile(overlay, override, { mode: 0o600 });
    const plan = { ...await deploymentPlan(config, 'local'), source_id: manifest.id, source_dir: join(root, '.deploy/sources', manifest.id) };
    const state = join(directory, 'state'); await mkdir(state);
    await writeFile(join(state, 'pending.json'), JSON.stringify(plan));
    const isolation = ['--pull=never', '--userns=keep-id', '--user', `${process.getuid!()}:${process.getgid!()}`];
    await run(['podman', 'network', 'create', '--label', `app.fixture=${prefix}`, network]); networkCreated = true;
    const started = await run(['podman', 'run', '-d', ...isolation, '--name', backend, '--network', network,
        '--label', `app.fixture=${prefix}`, '--entrypoint=bun', '--mount', `type=bind,src=${join(root, 'tests/container/backend.ts')},dst=/fixture/backend.ts,ro`, image, '/fixture/backend.ts']);
    ids.push(started.output.trim());
    await run(['bash', 'scripts/deploy/engine.sh', state, 'start']);
    ids.push((await run(['podman', 'inspect', service, '--format', '{{.Id}}'])).output.trim());
    const api = `http://127.0.0.1:${port}`;
    const check = async (path: string) => {
        const response = await fetch(api + path, { signal: AbortSignal.timeout(5000) });
        assert(response.ok, '生产容器 HTTP 请求失败'); return response;
    };
    assert((await (await check('/healthz')).json()).status === 'ready', '自身健康未就绪');
    assert((await (await check('/')).text()).includes('<html'), '静态页面不可用');
    const runtime = await (await check('/api/crypto/runtime')).text();
    assert(!runtime.includes('CONTAINER_PRIVATE_MARKER') && !runtime.includes('backend'), '私有配置泄漏');
    const ccxt = await (await check('/api/ccxt/fetch_ohlcv/latest-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=30m&limit=1')).json();
    const tq = await (await check('/api/tq/fetch_ohlcv?symbol=KQ.m%40SHFE.rb&duration_seconds=1800&data_length=1')).json();
    assert(ccxt.rows[0][0] === 1718000000000 && tq.rows[0][0] === 1718000000000, '两来源真实容器 API 不一致');
    const inspected = JSON.parse((await run(['podman', 'inspect', service])).output)[0];
    assert(inspected.HostConfig.PortBindings['5174/tcp'][0].HostIp === '127.0.0.1', '发布地址不是回环');
    const configMounts = inspected.Mounts.filter((mount: any) => mount.Destination.startsWith('/app/config/'));
    assert(configMounts.length === plan.config_files.length && configMounts.every((mount: any) => mount.RW === false), '配置挂载缺失或可写');
    const contents = await run(['podman', 'run', '--rm', ...isolation, '--network=none', '--entrypoint=/bin/sh', image, '-c',
        'test -f /app/server.js && test -f /app/public/index.html && test ! -d /app/node_modules && test ! -d /app/src && test ! -f /app/config/config.toml && test ! -d /app/.git && ! command -v gcc']);
    assert(contents.code === 0, '最终镜像含开发环境或配置');
    const again = await run(['bash', 'scripts/deploy/engine.sh', state, 'start']);
    assert(again.output.includes('无需重复启动'), '实际容器幂等失败');
    const blocker = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('occupied') });
    try {
        await writeFile(overlay, override.replace(`publish_port=${port}`, `publish_port=${blocker.port}`));
        await writeFile(join(state, 'pending.json'), JSON.stringify({ ...await deploymentPlan(config, 'local'), source_id: manifest.id, source_dir: plan.source_dir }));
        const failed = await run(['bash', 'scripts/deploy/engine.sh', state, 'start'], true);
        assert(failed.code !== 0, '被占用端口未拒绝');
        await check('/healthz');
        assert((await run(['podman', 'inspect', service, '--format', '{{.Id}}'])).output.trim() === ids[1], '失败未恢复原容器');
    } finally { blocker.stop(true); }
    await run(['bash', 'scripts/deploy/engine.sh', state, 'status']);
    await run(['bash', 'scripts/deploy/engine.sh', state, 'stop']);
    await run(['bash', 'scripts/deploy/engine.sh', state, 'stop']);
    console.log('离线容器验证通过：镜像边界、只读配置、两来源 API、回环发布、幂等与失败恢复');
}
try { await main(); }
catch (e) { console.error(e instanceof Error ? e.message : '容器验证失败'); process.exitCode = 1; }
finally {
    for (const id of ids.reverse()) await run(['podman', 'rm', '-f', id], true);
    if (networkCreated) await run(['podman', 'network', 'rm', network], true);
    await rm(directory, { recursive: true, force: true });
}
