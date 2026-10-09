import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// 只替代外部命令，实际生命周期脚本仍由测试直接执行。
const path = join(process.env.DEPLOY_MOCK_DIR!, 'state.json');
const state = JSON.parse(await readFile(path, 'utf8'));
const [tool, ...args] = process.argv.slice(2);
state.calls.push([tool, ...args]);
let code = 0;
let output = '';
const at = (key: string) => args[args.indexOf(key) + 1];
const container = (key: string) => state.containers.find((item: any) => item.name === key || item.id === key);
if (tool === 'curl') code = state.failCandidate ? 1 : 0;
else if (args[0] === 'info') output = 'amd64';
else if (args[0] === 'network') {
    if (args[1] === 'exists') code = state.noNetwork ? 1 : 0;
    else output = state.noDns ? 'false' : 'true';
} else if (args[0] === 'image') {
    if (args[1] === 'exists') code = state.noImage ? 1 : 0;
    else output = 'new-image';
} else if (args[0] === 'container' && args[1] === 'exists') code = container(args[2]!) ? 0 : 1;
else if (args[0] === 'inspect') {
    const item = container(args[1]!);
    if (!item) code = 1;
    else {
        const format = at('--format')!;
        if (format.includes('app.owner')) output = item.owner;
        else if (format.includes('app.profile')) output = item.profile;
        else if (format.includes('app.source')) output = item.source;
        else if (format.includes('app.config')) output = item.config;
        else if (format.includes('.State.Running')) output = String(item.running);
        else if (format.includes('.Id')) output = item.id;
        else if (format === '{{.Image}}') output = item.image;
        else output = `${item.name} ${item.running ? 'running' : 'exited'} ${item.image}`;
    }
} else if (args[0] === 'run') {
    if (args.includes('--plan')) output = JSON.stringify(state.runtime);
    else if (args.includes('--probe-backend')) code = state.failProbe ? 1 : 0;
    else if (args.includes('--check')) code = state.invalidOld ? 1 : 0;
    else {
        const labels = args.filter((_, index) => args[index - 1] === '--label');
        const label = (name: string) => labels.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
        state.containers.push({ id: 'candidate-id', name: at('--name'), image: 'new-image', owner: label('app.owner'),
            profile: label('app.profile'), source: label('app.source'), config: label('app.config'), running: !state.failCandidate });
        output = 'candidate-id';
    }
} else if (args[0] === 'stop') container(args.at(-1)!)!.running = false;
else if (args[0] === 'rename') container(args[1]!)!.name = args[2];
else if (args[0] === 'start') { container(args[1]!)!.running = true; output = args[1]!; }
else if (args[0] === 'rm') state.containers = state.containers.filter((item: any) => item.id !== args.at(-1) && item.name !== args.at(-1));
else if (args[0] === 'ps') output = state.imageReferenced ? 'other-container' : '';
else if (args[0] === 'rmi') state.removedImages.push(args[1]);
else if (args[0] === 'port') output = '5174/tcp -> 127.0.0.1:5175';
else if (args[0] === 'logs') output = 'offline-service-log';
else if (args[0] !== 'build') code = 2;
await writeFile(path, JSON.stringify(state));
if (output) console.log(output);
process.exit(code);
