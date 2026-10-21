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
    const override = `[backend]\nbase_url="http://${backend}:5123"\nrequest_timeout_seconds=2\n[server]\nhost="0.0.0.0"\n[deploy]\ncontainer_network="${network}"\ncontainer_name="${service}"\npublish_port=${port}\n`;
    await writeFile(overlay, override, { mode: 0o600 });
    const plan = { ...await deploymentPlan(config, 'local'), source_id: manifest.id, source_dir: join(root, '.deploy/sources', manifest.id) };
    const state = join(directory, 'state'); await mkdir(state);
    await writeFile(join(state, 'pending.json'), JSON.stringify(plan));
    await writeFile(join(state, 'prepared-image'), image + '\n');
    const isolation = ['--pull=never', '--userns=keep-id', '--user', `${process.getuid!()}:${process.getgid!()}`];
    // internal 网络只解析容器名，缺失后端的 DNS 查询不转发到外部。
    await run(['podman', 'network', 'create', '--internal', '--label', `app.fixture=${prefix}`, network]); networkCreated = true;
    await run(['bash', 'scripts/deploy/engine.sh', state, 'start']);
    const serviceId = (await run(['podman', 'inspect', service, '--format', '{{.Id}}'])).output.trim();
    ids.push(serviceId);
    const api = `http://127.0.0.1:${port}`;
    const check = async (path: string) => {
        const response = await fetch(api + path, { signal: AbortSignal.timeout(5000) });
        assert(response.ok, '生产容器 HTTP 请求失败'); return response;
    };
    assert((await (await check('/healthz')).json()).status === 'ready', '自身健康未就绪');
    assert((await (await check('/')).text()).includes('<html'), '静态页面不可用');
    const runtime = await (await check('/api/crypto/runtime')).text();
    assert(!runtime.includes('CONTAINER_PRIVATE_MARKER') && !runtime.includes('backend'), '私有配置泄漏');
    const ccxtPath = '/api/ccxt/fetch_ohlcv/latest-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=30m&limit=1';
    const tqPath = '/api/tq/fetch_ohlcv?symbol=KQ.m%40SHFE.rb&duration_seconds=1800&data_length=1';
    const unavailable = await fetch(api + ccxtPath, { signal: AbortSignal.timeout(5000) });
    assert(unavailable.status === 502 || unavailable.status === 504, '无后端时行情未返回网关错误');
    const error = await unavailable.text();
    assert(['BACKEND_UNAVAILABLE', 'BACKEND_TIMEOUT'].includes(JSON.parse(error).error.code) && !error.includes('CONTAINER_PRIVATE_MARKER'), '连接错误不符合既有契约或泄漏凭据');
    await check('/healthz');
    const offlineAgain = await run(['bash', 'scripts/deploy/engine.sh', state, 'start'], true);
    assert(offlineAgain.code === 2 && offlineAgain.errors.includes('实例已运行'), '无后端时重复启动应拒绝');
    const started = await run(['podman', 'run', '-d', ...isolation, '--name', backend, '--network', network,
        '--label', `app.fixture=${prefix}`, '--entrypoint=bun', '--mount', `type=bind,src=${join(root, 'tests/container/backend.ts')},dst=/fixture/backend.ts,ro`, image, '/fixture/backend.ts']);
    ids.push(started.output.trim());
    let recovered: Response | undefined;
    // 假后端独立启动；有限等待仅属于测试，不进入部署链路。
    for (let attempt = 0; attempt < 5; attempt++) {
        const response = await fetch(api + ccxtPath, { signal: AbortSignal.timeout(5000) });
        if (response.ok) { recovered = response; break; }
        const body = await response.json();
        assert(['BACKEND_UNAVAILABLE', 'BACKEND_TIMEOUT'].includes(body.error?.code), '后端恢复出现非连接类错误');
        await Bun.sleep(200);
    }
    assert(recovered, '假后端启动后前端未自动恢复');
    const ccxt = await recovered.json();
    const tq = await (await check(tqPath)).json();
    assert(ccxt.rows[0][0] === 1718000000000 && tq.rows[0][0] === 1718000000000, '两来源真实容器 API 不一致');
    const inspected = JSON.parse((await run(['podman', 'inspect', service])).output)[0];
    assert(inspected.HostConfig.PortBindings['5174/tcp'][0].HostIp === '127.0.0.1', '发布地址不是回环');
    const configMounts = inspected.Mounts.filter((mount: any) => mount.Destination.startsWith('/app/config/'));
    assert(configMounts.length === plan.config_files.length && configMounts.every((mount: any) => mount.RW === false), '配置挂载缺失或可写');
    const contents = await run(['podman', 'run', '--rm', ...isolation, '--network=none', '--entrypoint=/bin/sh', image, '-c',
        'test -f /app/server.js && test -f /app/public/index.html && test ! -d /app/node_modules && test ! -d /app/src && test ! -f /app/config/config.toml && test ! -d /app/.git && ! command -v gcc']);
    assert(contents.code === 0, '最终镜像含开发环境或配置');
    const again = await run(['bash', 'scripts/deploy/engine.sh', state, 'start'], true);
    assert(again.code === 2 && again.errors.includes('实例已运行'), '已运行实例的重复 start 未拒绝');
    const blocker = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('occupied') });
    try {
        await writeFile(overlay, override.replace(`publish_port=${port}`, `publish_port=${blocker.port}`));
        await writeFile(join(state, 'pending.json'), JSON.stringify({ ...await deploymentPlan(config, 'local'), source_id: manifest.id, source_dir: plan.source_dir }));
        const failed = await run(['bash', 'scripts/deploy/engine.sh', state, 'restart'], true);
        assert(failed.code !== 0, '被占用端口未拒绝');
        assert((await run(['podman', 'inspect', service, '--format', '{{.Id}}'])).output.trim() === serviceId, '失败未保留原容器');
        assert((await run(['podman', 'inspect', service, '--format', '{{.State.Running}}'])).output.trim() === 'false', '重启失败不应自动启动旧容器');
    } finally { blocker.stop(true); }
    await writeFile(overlay, override);
    await writeFile(join(state, 'pending.json'), JSON.stringify(plan));
    await run(['bash', 'scripts/deploy/engine.sh', state, 'restart']);
    ids.push((await run(['podman', 'inspect', service, '--format', '{{.Id}}'])).output.trim());
    await check('/healthz');
    await run(['bash', 'scripts/deploy/engine.sh', state, 'status']);
    await run(['bash', 'scripts/deploy/engine.sh', state, 'stop']);
    await run(['bash', 'scripts/deploy/engine.sh', state, 'stop']);
    console.log('离线容器验证通过：无后端独立启动、后端恢复、镜像边界、只读配置、两来源 API、回环发布、重复启动拒绝及重启失败保持停止');
}
try { await main(); }
catch (e) { console.error(e instanceof Error ? e.message : '容器验证失败'); process.exitCode = 1; }
finally {
    for (const id of ids.reverse()) await run(['podman', 'rm', '-f', id], true);
    if (networkCreated) await run(['podman', 'network', 'rm', network], true);
    await rm(directory, { recursive: true, force: true });
}
