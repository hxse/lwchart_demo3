import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
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
                const headers = new Headers();
                for (const [key, value] of Object.entries(req.headers)) {
                    if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
                    else if (value !== undefined) headers.set(key, value);
                }
                const method = req.method ?? 'GET';
                if (['GET', 'HEAD'].includes(method)) req.resume();
                let request: Request;
                try {
                    const url = new URL(req.url || '/', `http://${req.headers.host || 'invalid'}`);
                    request = new Request(url, { method, headers, signal: abort.signal,
                        ...(!['GET', 'HEAD'].includes(method) ? { body: Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>, duplex: 'half' } : {}) });
                } catch {
                    req.off('aborted', cancelled); res.off('close', cancelled);
                    req.resume(); res.statusCode = 400; res.end('Invalid request'); return;
                }
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
