import { createApi } from './api';
import { staticHandler } from './static';
import { loadCryptoConfig } from './config';

export async function serve(configPath: string, directory: string) {
    const config = await loadCryptoConfig(configPath);
    if (!await Bun.file(`${directory}/index.html`).exists()) throw new Error('缺少看盘产物，请先运行 just market --build');
    const api = createApi(config);
    const files = staticHandler(directory);
    const server = Bun.serve({ hostname: config.server.host, port: config.server.port,
        async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/healthz' && request.method === 'GET') return Response.json({ status: 'ready' });
            return await api(request) || await files(request);
        },
    });
    console.log(`看盘服务已启动，端口 ${server.port}`);
    const stop = () => { server.stop(true); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    return server;
}
