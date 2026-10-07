import { expect, test, spyOn } from 'bun:test';
import { BackendClient, GatewayError } from '../../scripts/crypto/backend';
import { createApi } from '../../scripts/crypto/api';
import type { CryptoConfig } from '../../scripts/crypto/config';
import { defaults, budget, candle, result, asFetch, deferred } from '../fixtures/data';

const secret = '  OFFLINE_PRIVATE_$()_MARKER  ';
const config: CryptoConfig = {
    backend: { base_url: 'http://mock', username: 'user+@example', password: secret, request_timeout_seconds: 1 },
    server: { host: '127.0.0.1', port: 5174 }, runtime: { defaults, data: budget },
};
const token = (value = 'jwt-1', seconds = 3600) => Response.json({ access_token: value, token_type: 'bearer', expires_in: seconds });
const query = new URLSearchParams({ exchange_name: 'binance', market: 'future', is_live: 'true', symbol: defaults.symbol, timeframe: '30m', limit: '1500' });

test('Password Grant 表单保留字面密码，并发只登录一次', async () => {
    let logins = 0;
    const login = deferred<Response>();
    const client = new BackendClient(config.backend, asFetch(async (input, init) => {
        if (String(input).endsWith('/auth/token')) {
            logins++;
            expect(init?.method).toBe('POST');
            const form = new URLSearchParams(String(init?.body));
            expect(form.get('grant_type')).toBe('password');
            expect(form.get('username')).toBe(config.backend.username);
            expect(form.get('password')).toBe(secret);
            return login.promise;
        }
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-1');
        return Response.json(result([candle(0)]));
    }));
    const pending = [client.read('/ccxt/fetch_ohlcv/latest-limit', query), client.read('/ccxt/fetch_ohlcv/latest-limit', query)];
    expect(logins).toBe(1);
    login.resolve(token());
    expect(await Promise.all(pending)).toEqual([result([candle(0)]), result([candle(0)])]);
});

test('过期重新登录，旧 token 的迟到 401 不注销新 token', async () => {
    let logins = 0;
    let now = 100000;
    const clock = spyOn(Date, 'now').mockImplementation(() => now);
    const stale = deferred<Response>();
    const started = deferred<void>();
    const observed: string[] = [];
    let first = true;
    const client = new BackendClient(config.backend, asFetch(async (input, init) => {
        if (String(input).endsWith('/auth/token')) return token(`jwt-${++logins}`, 1);
        const authorization = new Headers(init?.headers).get('Authorization')!;
        observed.push(authorization);
        if (first) { first = false; started.resolve(); return stale.promise; }
        return Response.json(result([candle(0)]));
    }));
    try {
        const old = client.read('/ccxt/fetch_ohlcv/latest-limit', query);
        await started.promise;
        expect(observed).toEqual(['Bearer jwt-1']);
        now += 2000;
        await client.read('/ccxt/fetch_ohlcv/latest-limit', query);
        stale.resolve(new Response('PRIVATE_UNKNOWN_BODY', { status: 401 }));
        await old;
        expect(logins).toBe(2);
        expect(observed).toEqual(['Bearer jwt-1', 'Bearer jwt-2', 'Bearer jwt-2']);
    } finally { clock.mockRestore(); }
});

test('401 原 GET 只重试一次，错误正文不泄漏密码与 token', async () => {
    let logins = 0; let reads = 0;
    const client = new BackendClient(config.backend, asFetch(async input => {
        if (String(input).endsWith('/auth/token')) { logins++; return token(); }
        reads++; return Response.json({ detail: secret }, { status: 401 });
    }));
    const api = createApi(config, client);
    const response = (await api(new Request(`http://local/api/ccxt/fetch_ohlcv/latest-limit?${query}`)))!;
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toContain('BACKEND_AUTH_FAILED');
    expect(response.headers.get('Server-Timing')).toMatch(/^upstream;dur=\d+\.\d{2}, local;dur=\d+\.\d{2}$/);
    expect(body).not.toContain(secret.trim()); expect(body).not.toContain('jwt-1');
    expect([logins, reads]).toEqual([2, 2]);
});

test('连接失败、超时、取消和后端稳定领域错误的受控映射', async () => {
    const disconnected = new BackendClient(config.backend, asFetch(async () => { throw new Error(secret); }));
    await expect(disconnected.read('/ccxt/x', query)).rejects.toMatchObject({ status: 502, code: 'BACKEND_UNAVAILABLE' });
    const timed = new BackendClient(config.backend, asFetch(async (_input, init) => new Promise((_, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    })));
    await expect(timed.read('/ccxt/x', query)).rejects.toMatchObject({ status: 504, code: 'BACKEND_TIMEOUT' });
    const aborted = new AbortController();
    aborted.abort();
    const cancellation = new BackendClient(config.backend, asFetch(async (input, init) => {
        if (String(input).endsWith('/auth/token')) return token();
        init!.signal!.throwIfAborted(); return Response.json({});
    }));
    await expect(cancellation.read('/ccxt/x', query, aborted.signal)).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    const domain = new BackendClient(config.backend, asFetch(async input => String(input).endsWith('/auth/token') ? token()
        : Response.json({ detail: { code: 'SERVICE_NOT_ENABLED', message: secret, service: secret } }, { status: 503 })));
    await expect(domain.read('/ccxt/x', query)).rejects.toMatchObject({ status: 503, code: 'SERVICE_NOT_ENABLED', message: '后端未启用所选行情服务' });
});

test('HTTP 白名单与 runtime 投影，非法 query 或写方法不触发后端', async () => {
    let calls = 0;
    const client = new BackendClient(config.backend, asFetch(async input => {
        calls++; return String(input).endsWith('/auth/token') ? token() : Response.json(result([candle(0)]));
    }));
    const api = createApi(config, client);
    const runtime = (await api(new Request('http://local/api/crypto/runtime')))!;
    expect(await runtime.json()).toEqual({ defaults, data: budget });
    for (const [url, method, status] of [
        ['/api/orders', 'GET', 404], ['/api/ccxt/fetch_ohlcv/latest-limit', 'POST', 405],
        [`/api/ccxt/fetch_ohlcv/latest-limit?${query}&password=SECRET`, 'GET', 400],
        [`/api/ccxt/fetch_ohlcv/latest-limit?${query}&symbol=B`, 'GET', 400],
        ['/api/crypto/runtime?x=y', 'GET', 400],
        [`/api/ccxt/fetch_ohlcv/latest-limit?${new URLSearchParams({ ...Object.fromEntries(query), limit: '10001' })}`, 'GET', 400],
    ] as const) {
        const response = (await api(new Request(`http://local${url}`, { method })))!;
        expect(response.status).toBe(status); expect(await response.text()).not.toContain('SECRET');
    }
    expect(calls).toBe(0);
    const good = (await api(new Request(`http://local/api/ccxt/fetch_ohlcv/latest-limit?${query}`)))!;
    expect(await good.json()).toEqual(result([candle(0)]));
    expect(good.headers.get('Server-Timing')).not.toContain(secret.trim());
    expect(calls).toBe(2);
    const maximum = new URLSearchParams(query);
    maximum.set('limit', '10000');
    const maximumResponse = (await api(new Request(`http://local/api/ccxt/fetch_ohlcv/latest-limit?${maximum}`)))!;
    expect(maximumResponse.status).toBe(200);
    expect((await maximumResponse.json()).rows).toHaveLength(1);
    expect(calls).toBe(3);
    const broken = createApi(config, { read: async () => ({ rows: [[1]], last_bar_completion_confirmed: false }) });
    expect((await broken(new Request(`http://local/api/ccxt/fetch_ohlcv/latest-limit?${query}`)))!.status).toBe(502);
    expect(new GatewayError(502, 'BACKEND_ERROR', '受控错误')).toBeInstanceOf(Error);
});
