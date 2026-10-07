import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { CryptoConfig } from './config';
import { createApi } from './api';

export function cryptoApiPlugin(config: CryptoConfig): Plugin {
    const api = createApi(config);
    return {
        name: 'crypto-local-api',
        configureServer(server) {
            server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
                let path: string;
                try { path = decodeURIComponent((req.url || '/').split('?')[0]!); }
                catch { res.statusCode = 400; res.end('Invalid path'); return; }
                if (/(?:^|\/)(?:\.git|\.jj|config(?:\.local|\.remote)?\.toml)(?:\/|\.|$)/.test(path)) {
                    res.statusCode = 403; res.end('Forbidden'); return;
                }
                if (!path.startsWith('/api/')) { next(); return; }
                const abort = new AbortController();
                const cancelled = () => { if (!res.writableEnded) abort.abort(); };
                req.once('aborted', cancelled);
                res.once('close', cancelled);
                req.resume();
                const host = config.server.host === '::1' ? '[::1]' : config.server.host;
                const request = new Request(`http://${host}:${config.server.port}${req.url}`, { method: req.method, signal: abort.signal });
                void api(request).then(async response => {
                    if (!response || res.destroyed) return;
                    res.statusCode = response.status;
                    response.headers.forEach((value, key) => res.setHeader(key, value));
                    res.end(await response.text());
                }).catch(() => {
                    if (!res.destroyed) { res.statusCode = 500; res.end('Local API failed'); }
                }).finally(() => { req.off('aborted', cancelled); res.off('close', cancelled); });
            });
        },
    };
}
