import { readFile, stat } from 'node:fs/promises';
import { dirname, basename, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

export type ConfigProfile = 'dev' | 'local' | 'remote';
export function configProfile(value = process.env.APP_CONFIG_PROFILE): ConfigProfile {
    if (value !== 'dev' && value !== 'local' && value !== 'remote') throw new Error('APP_CONFIG_PROFILE 必须明确指定 dev、local 或 remote');
    return value;
}
function table(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function mergeConfig(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) {
        result[key] = table(value) && table(base[key]) ? mergeConfig(base[key], value) : value;
    }
    return result;
}
export function overridePath(path: string, profile: ConfigProfile) {
    const file = resolve(path);
    return join(dirname(file), `${basename(file, '.toml')}.${profile}.toml`);
}
export async function configurationFiles(path: string, profile: ConfigProfile) {
    const files = [{ source: resolve(path), name: 'config.toml' }];
    if (profile !== 'dev') {
        const override = overridePath(path, profile);
        try { await stat(override); files.push({ source: override, name: `config.${profile}.toml` }); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('无法读取覆盖配置'); }
    }
    return files;
}
export async function configurationId(files: Array<{ source: string; name: string }>) {
    const records = [];
    for (const file of files) records.push([file.name, createHash('sha256').update(await readFile(file.source)).digest('hex')]);
    return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
async function readTable(path: string, optional: boolean) {
    let input: string;
    try { input = await readFile(path, 'utf8'); }
    catch (e) {
        if (optional && (e as NodeJS.ErrnoException).code === 'ENOENT') return {};
        throw new Error(optional ? '无法读取覆盖配置，请核对权限与 TOML 格式' : '无法读取配置，请核对配置路径与 TOML 格式');
    }
    try {
        const value = Bun.TOML.parse(input);
        if (!table(value)) throw new Error();
        return value;
    } catch { throw new Error(optional ? '无法读取覆盖配置，请核对权限与 TOML 格式' : '无法读取配置，请核对配置路径与 TOML 格式'); }
}
export async function readConfig(path: string, selected = configProfile()) {
    const profile = configProfile(selected);
    const base = await readTable(resolve(path), false);
    return profile === 'dev' ? base : mergeConfig(base, await readTable(overridePath(path, profile), true));
}
