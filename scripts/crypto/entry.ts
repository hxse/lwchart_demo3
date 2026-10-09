import { resolve } from 'node:path';
import { build, createServer } from 'vite';
import { loadCryptoConfig } from './config';
import { createApi } from './api';
import { staticHandler } from './static';
import { cryptoApiPlugin } from './middleware';

const root = resolve(import.meta.dirname, '../..');
const configFile = resolve(root, 'vite.config.crypto.ts');
const action = process.argv[2] || 'dev';

async function main() {
    if (action === 'build') { await build({ configFile }); return; }
    if (action !== 'dev' && action !== 'serve') throw new Error('未知运行模式');
    const config = await loadCryptoConfig(process.argv[3] || 'config.toml');
    if (action === 'dev') {
        const server = await createServer({ configFile, plugins: [cryptoApiPlugin(config)], server: { host: config.server.host, port: config.server.port, strictPort: true } });
        await server.listen();
        server.printUrls();
        const stop = () => { void server.close().then(() => process.exit(0)); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
        return;
    }
    const directory = resolve(root, 'dist-crypto');
    if (!await Bun.file(resolve(directory, 'index.html')).exists()) throw new Error('缺少看盘产物，请先运行 just market --build');
    const api = createApi(config);
    const serveFile = staticHandler(directory);
    const server = Bun.serve({ hostname: config.server.host, port: config.server.port,
        async fetch(request) { return await api(request) || await serveFile(request); },
    });
    console.log(`看盘服务：http://${config.server.host === '::1' ? '[::1]' : config.server.host}:${server.port}/`);
    const stop = () => { server.stop(true); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

await main().catch(error => { console.error(error instanceof Error ? error.message : '看盘服务启动失败'); process.exit(2); });
