import { resolve } from 'node:path';
import { loadCryptoConfig } from './config';

const root = resolve(import.meta.dirname, '../..');
const action = process.argv[2] || 'dev';
async function main() {
    if (action === 'build') { await (await import('./build')).buildMarket(root); return; }
    if (action === 'serve') { await (await import('./serve')).serve(process.argv[3] || 'config.toml', resolve(root, 'dist-crypto')); return; }
    if (action !== 'dev') throw new Error('未知运行模式');
    const config = await loadCryptoConfig(process.argv[3] || 'config.toml');
    const { createServer } = await import('vite');
    const { cryptoApiPlugin } = await import('./middleware');
    const server = await createServer({ configFile: resolve(root, 'vite.config.crypto.ts'), plugins: [cryptoApiPlugin(config)],
        server: { host: config.server.host, port: config.server.port, strictPort: true } });
    await server.listen(); server.printUrls();
    const stop = () => { void server.close().then(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
await main().catch(error => { console.error(error instanceof Error ? error.message : '看盘服务启动失败'); process.exit(2); });
