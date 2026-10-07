import { defineConfig } from '@playwright/test';
import { browserLaunchOptions } from './tests/browser/launch';

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: false,
    workers: 1,
    timeout: 30000,
    expect: { timeout: 7000 },
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:43174',
        viewport: { width: 1280, height: 800 },
        launchOptions: browserLaunchOptions(),
        screenshot: 'only-on-failure', trace: 'retain-on-failure',
    },
    webServer: {
        command: 'bun tests/fixtures/browser-server.ts',
        url: 'http://127.0.0.1:43174/',
        timeout: 90000,
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    },
});
