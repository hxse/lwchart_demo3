import { resolve } from 'node:path';
import { configProfile, configurationFiles, configurationId } from '../config-profile';
import { loadCryptoConfig } from './config';
import { serve } from './serve';

async function main() {
    const profile = configProfile();
    if (process.env.PROJECT_EXECUTION_CONTEXT === 'prod' && profile === 'dev') throw new Error('生产容器必须选择 local 或 remote 场景');
    const action = process.argv[2];
    const utility = ['--check', '--plan', '--probe-backend'].includes(action || '');
    const path = utility ? process.argv[3] || '/app/config/config.toml' : action || '/app/config/config.toml';
    if (!utility) { await serve(path, resolve(import.meta.dirname, 'public')); return; }
    const config = await loadCryptoConfig(path, profile);
    if (action === '--plan') console.log(JSON.stringify({ ...config.deploy!, server_port: config.server.port, backend_url: config.backend.base_url, profile,
        configuration_id: await configurationId(await configurationFiles(path, profile)) }));
    else if (action === '--probe-backend') {
        try { await fetch(config.backend.base_url + '/', { signal: AbortSignal.timeout(5000), redirect: 'manual' }); }
        catch { throw new Error('容器无法连接后端，请核对共享网络、DNS 与后端服务'); }
        console.log('后端网络可连通');
    } else console.log('配置有效');
}
await main().catch(e => { console.error(e instanceof Error ? e.message : '生产服务启动失败'); process.exit(2); });
