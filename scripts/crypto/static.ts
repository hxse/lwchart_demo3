import { resolve, sep } from 'node:path';

export function staticHandler(directory: string) {
    const root = resolve(directory);
    return async (request: Request) => {
        if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
        let path: string;
        try { path = decodeURIComponent(new URL(request.url).pathname); }
        catch { return new Response('Not found', { status: 404 }); }
        if (path === '/') path = '/index.html';
        const filename = resolve(root, `.${path}`);
        if (!filename.startsWith(root + sep) || /(?:^|\/)(?:\.git|\.jj|config(?:\.local|\.remote)?\.toml)(?:\/|\.|$)/.test(path)) {
            return new Response('Not found', { status: 404 });
        }
        const file = Bun.file(filename);
        if (!await file.exists()) return new Response('Not found', { status: 404 });
        return new Response(request.method === 'HEAD' ? null : file, { headers: { 'Content-Type': file.type, 'Cache-Control': 'no-cache' } });
    };
}
