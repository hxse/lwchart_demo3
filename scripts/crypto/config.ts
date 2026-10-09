import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { readConfig, configProfile, type ConfigProfile } from '../config-profile';
import { deploymentConfig, type DeploymentConfig } from '../deploy/schema';
import {
    record, onlyKeys, integer, text, normalizeSettings, normalizeSources, DASHBOARD_KEYS,
    type RuntimeOptions,
} from '../../src/crypto/options';

export interface BackendConfig { base_url: string; username: string; password: string; request_timeout_seconds: number }
export interface CryptoConfig { backend: BackendConfig; server: { host: string; port: number }; runtime: RuntimeOptions; deploy?: DeploymentConfig }

export async function legacyTarget(path: string, profile = configProfile()) {
    const config = await readConfig(path, profile);
    return targetFromConfig(config);
}
function targetFromConfig(config: Record<string, unknown>) {
    const legacy = record(config.legacy, 'legacy');
    onlyKeys(legacy, ['library_target_dir'], 'legacy');
    const target = text(legacy.library_target_dir, '旧库输出路径');
    if (target.includes('\0')) throw new Error('旧库输出路径无效');
    return target.startsWith('~/') ? resolve(homedir(), target.slice(2)) : resolve(target);
}
export async function loadCryptoConfig(path: string, profile: ConfigProfile = configProfile()): Promise<CryptoConfig> {
    configProfile(profile);
    const config = await readConfig(path, profile);
    onlyKeys(config, ['legacy','backend','server','dashboard','ccxt','tq','deploy'], '配置');
    targetFromConfig(config);
    const backend = record(config.backend, 'backend');
    onlyKeys(backend, ['base_url','username','password','request_timeout_seconds'], 'backend');
    let url: URL;
    try { url = new URL(text(backend.base_url, '后端地址')); } catch { throw new Error('后端地址无效'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('后端地址必须是无鉴权信息的 HTTP／HTTPS 地址');
    }
    const server = record(config.server, 'server');
    onlyKeys(server, ['host','port'], 'server');
    const host = text(server.host, '监听地址');
    if (profile === 'dev' && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('宿主看盘服务只支持回环监听');
    if (profile !== 'dev' && host !== '0.0.0.0') throw new Error('生产容器必须在内部监听 0.0.0.0，请核对场景覆盖配置');
    const dashboard = record(config.dashboard, 'dashboard');
    onlyKeys(dashboard, DASHBOARD_KEYS, 'dashboard');
    const sources = normalizeSources({ ccxt: config.ccxt, tq: config.tq });
    if (dashboard.source !== 'ccxt' && dashboard.source !== 'tq') throw new Error('数据源必须是 ccxt 或 tq');
    return {
        backend: {
            base_url: url.href.replace(/\/+$/, ''),
            username: text(backend.username, 'backend.username'),
            password: text(backend.password, 'backend.password'),
            request_timeout_seconds: integer(backend.request_timeout_seconds, 1, 300, '请求超时'),
        },
        server: { host, port: integer(server.port, 1, 65535, '端口') },
        deploy: deploymentConfig(config.deploy),
        runtime: {
            defaults: normalizeSettings({ ...dashboard, ...sources }),
        },
    };
}
