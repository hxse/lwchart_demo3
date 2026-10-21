import { readFile, writeFile, cp, mkdir, rm, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// 只替代外部命令，实际生命周期脚本仍由测试直接执行。
const path = join(process.env.DEPLOY_MOCK_DIR!, 'state.json');
const state = JSON.parse(await readFile(path, 'utf8'));
const [tool, ...args] = process.argv.slice(2);
state.calls.push([tool, ...args]);
let code = 0;
let output = '';
const at = (key: string) => args[args.indexOf(key) + 1];
const container = (key: string) => state.containers.find((item: any) => item.name === key || item.id === key);
if (tool === 'ssh') {
    await writeFile(path, JSON.stringify(state));
    // 仅在隔离临时目录执行真实远端脚本，不建立 SSH 连接。
    const child = Bun.spawn(['bash', '-c', args.at(-1)!], { env: process.env, stdout: 'inherit', stderr: 'inherit' });
    process.exit(await child.exited);
} else if (tool === 'rsync') {
    const source = args.at(-2)!, destination = args.at(-1)!.split(':').slice(1).join(':');
    if (!destination.startsWith(process.env.DEPLOY_MOCK_DIR! + '/')) throw new Error('离线同步目标必须在测试临时目录');
    if (args.includes('--delete')) await rm(destination, { recursive: true, force: true });
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: true });
    if (args.includes('--chmod=F600,D700')) await chmod(destination, 0o600);
} else if (tool === 'curl') code = state.failCandidate ? 1 : 0;
else if (args[0] === 'info') output = 'amd64';
else if (args[0] === 'network') {
    if (args[1] === 'exists') code = state.noNetwork ? 1 : 0;
    else output = state.noDns ? 'false' : 'true';
} else if (args[0] === 'image') {
    if (args[1] === 'exists') code = state.noImage ? 1 : 0;
    else output = 'new-image';
} else if (args[0] === 'container' && args[1] === 'exists') code = state.failExists ? 125 : container(args[2]!) ? 0 : 1;
else if (args[0] === 'inspect') {
    const item = container(args[1]!);
    if (!item) code = 1;
    else {
        const format = at('--format')!;
        if (format.includes('app.owner')) output = item.owner;
        else if (format.includes('app.profile')) output = item.profile;
        else if (format.includes('app.source')) output = item.source;
        else if (format.includes('app.config')) output = item.config;
        else if (format.includes('.State.Running')) {
            if (state.failRunning || state.failStoppedRead && !item.running) code = 125;
            else output = state.invalidRunning ? '' : String(item.running);
        }
        else if (format.includes('.Id')) output = item.id;
        else if (format === '{{.Image}}') output = item.image;
        else output = `${item.name} ${item.running ? 'running' : 'exited'} ${item.image}`;
    }
} else if (args[0] === 'run') {
    if (args.includes('--plan')) { if (state.invalidConfig) code = 2; else output = JSON.stringify(state.runtime); }
    else if (args.includes('--probe-backend')) code = state.failProbe ? 1 : 0;
    else if (args.includes('--check')) code = state.invalidConfig ? 1 : 0;
    else {
        const labels = args.filter((_, index) => args[index - 1] === '--label');
        const label = (name: string) => labels.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
        const id = `candidate-${state.nextId = (state.nextId ?? 0) + 1}`;
        state.containers.push({ id, name: at('--name'), image: 'new-image', owner: label('app.owner'),
            profile: label('app.profile'), source: label('app.source'), config: label('app.config'), running: !state.failCandidate });
        output = id;
    }
} else if (args[0] === 'stop') {
    if (state.failStop) code = 1;
    else if (!state.ignoreStop) container(args.at(-1)!)!.running = false;
}
else if (args[0] === 'rename') container(args[1]!)!.name = args[2];
else if (args[0] === 'start') { container(args[1]!)!.running = true; output = args[1]!; }
else if (args[0] === 'rm') state.containers = state.containers.filter((item: any) => item.id !== args.at(-1) && item.name !== args.at(-1));
else if (args[0] === 'ps') output = state.imageReferenced ? 'other-container' : '';
else if (args[0] === 'rmi') state.removedImages.push(args[1]);
else if (args[0] === 'port') output = '5174/tcp -> 127.0.0.1:5175';
else if (args[0] === 'logs') output = 'offline-service-log';
else if (args[0] === 'build') { if (state.failBuild) code = 1; else state.noImage = false; }
else code = 2;
await writeFile(path, JSON.stringify(state));
if (output) console.log(output);
process.exit(code);
