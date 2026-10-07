import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { LaunchOptions } from '@playwright/test';

/** 优先使用显式路径或已安装浏览器；离线测试不自动下载。 */
export function browserLaunchOptions(): LaunchOptions {
    let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    const cache = join(homedir(), '.cache/ms-playwright');
    if (!executablePath && existsSync(cache)) {
        const versions = readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
        for (const version of versions) {
            const candidate = join(cache, version, 'chrome-linux64/chrome');
            if (existsSync(candidate)) { executablePath = candidate; break; }
        }
    }
    const env = { ...process.env } as Record<string, string>;
    const firefoxWrapper = '/run/current-system/sw/bin/firefox';
    if (process.platform === 'linux' && existsSync(firefoxWrapper)) {
        // NixOS 复用现有 Firefox 的动态库目录，不修改系统环境。
        const firefox = realpathSync(firefoxWrapper);
        const library = resolve(dirname(firefox), '../lib/firefox/libxul.so');
        const dependencies = readFileSync(firefox, 'utf8') + execFileSync('ldd', [library], { encoding: 'utf8', timeout: 10000 });
        const paths = [...new Set(dependencies.match(/\/nix\/store\/[^/'"\s]+\/lib(?:64)?/g) || [])];
        env.LD_LIBRARY_PATH = [...paths, '/run/current-system/sw/share/nix-ld/lib', env.LD_LIBRARY_PATH || ''].join(':');
    }
    return { executablePath, headless: true, env, timeout: 15000 };
}
