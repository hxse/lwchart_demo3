import { expect, test } from 'bun:test';
import { ccxtBatch, parseTqJson, tqBatch } from '../../scripts/crypto/ohlcv';
import { BackendClient } from '../../scripts/crypto/backend';
import { createApi } from '../../scripts/crypto/api';
import type { CryptoConfig } from '../../scripts/crypto/config';
import { asFetch, candle, ccxtResult, result, runtime, tqResult } from '../fixtures/data';

const config: CryptoConfig = { backend: { base_url: 'http://mock', username: 'user', password: 'PRIVATE_TQ_MARKER', request_timeout_seconds: 1 },
    server: { host: '127.0.0.1', port: 5174 }, runtime };
const query = new URLSearchParams({ symbol: 'KQ.m@SHFE.rb', duration_seconds: '1800', data_length: '1500', enable_cache: 'true' });

test('TQ 纳秒整数通过原始 token 精确转换为 UTC 毫秒，不能用 Number 舍入', () => {
    const raw = '[{"datetime":1718000000001000000,"open":100,"high":105,"low":99,"close":104,"volume":2,"id":1}]';
    const decoded = parseTqJson(raw) as Array<{ datetime: bigint }>;
    expect(decoded[0]!.datetime).toBe(1718000000001000000n);
    expect(tqBatch(decoded, 5)).toEqual(result([[1718000000001, 100, 105, 99, 104, 2]]));
    expect(tqBatch([], 1500)).toEqual(result([]));
    expect(tqBatch(tqResult([candle(0)]), 1500).rows).toHaveLength(1);
    const row = tqResult([candle(0)])[0]!;
    expect(() => tqBatch([{ ...row, datetime: row.datetime + 1n }], 5)).toThrow('无法无损');
    expect(() => tqBatch([{ ...row, datetime: Number(row.datetime) }], 5)).toThrow('无法无损');
    expect(() => tqBatch([{ ...row, close: null }], 5)).toThrow('有限数值');
    expect(() => tqBatch([row, row], 5)).toThrow('升序且唯一');
});

test('TQ 正常交易休息的时间跳跃合法，CCXT metadata 只在输入边界验证', () => {
    const rows = [candle(0), candle(1, 102, 3 * 86400000)];
    expect(tqBatch(tqResult(rows), 5)).toEqual(result(rows));
    expect(ccxtBatch(ccxtResult(rows), 5)).toEqual(result(rows));
    expect(() => ccxtBatch({ rows, last_bar_completion_confirmed: null }, 5)).toThrow('完成状态');
    expect(() => ccxtBatch({ rows: [], last_bar_completion_confirmed: false }, 5)).toThrow('完成状态');
});

test('TQ 复用鉴权，实际解析响应并只返回归一数据，不携带凭据或原始附加字段', async () => {
    let logins = 0;
    const calls: URL[] = [];
    const client = new BackendClient(config.backend, asFetch(async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/auth/token') {
            logins++; return Response.json({ access_token: 'TQ_PRIVATE_JWT', token_type: 'bearer', expires_in: 3600 });
        }
        calls.push(url);
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer TQ_PRIVATE_JWT');
        return new Response('[{"datetime":1718000000001000000,"open":100,"high":105,"low":99,"close":104,"volume":2,"id":1,"extra":"PRIVATE_TQ_MARKER"}]', { headers: { 'Content-Type': 'application/json' } });
    }));
    const api = createApi(config, client);
    const response = (await api(new Request(`http://local/api/tq/fetch_ohlcv?${query}`)))!;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result([[1718000000001, 100, 105, 99, 104, 2]]));
    expect(logins).toBe(1); expect(calls[0]!.pathname).toBe('/tq/fetch_ohlcv');
    expect(calls[0]!.searchParams.get('data_length')).toBe('1500');
    expect(calls[0]!.searchParams.has('is_live')).toBe(false);
});

test('TQ 非法参数和写路由在取数前失败，受控后端错误不透传原文', async () => {
    let calls = 0;
    const api = createApi(config, { read: async () => { calls++; return tqResult([candle(0)]); } });
    for (const raw of [`${query}&symbol=SHFE.rb2701`, `${query}&since=1718000000000`, `${query}&is_live=true`,
        `${query}&limit=5`, `${query}&adj_type=F`, `${query}&password=PRIVATE_TQ_MARKER`,
        new URLSearchParams({ ...Object.fromEntries(query), duration_seconds: '7' }).toString(),
        new URLSearchParams({ ...Object.fromEntries(query), data_length: '10001' }).toString()]) {
        const response = (await api(new Request(`http://local/api/tq/fetch_ohlcv?${raw}`)))!;
        expect(response.status).toBe(400); expect(await response.text()).not.toContain('PRIVATE_TQ_MARKER');
    }
    expect((await api(new Request('http://local/api/tq/order')))!.status).toBe(404);
    expect((await api(new Request('http://local/api/tq/fetch_ohlcv', { method: 'POST' })))!.status).toBe(405);
    expect(calls).toBe(0);
    const client = new BackendClient(config.backend, asFetch(async input => String(input).endsWith('/auth/token')
        ? Response.json({ access_token: 'jwt', token_type: 'bearer', expires_in: 3600 })
        : Response.json({ detail: 'TQ_NETWORK_UNAVAILABLE', message: 'PRIVATE_TQ_MARKER' }, { status: 503 })));
    await expect(client.read('/tq/fetch_ohlcv', query)).rejects.toMatchObject({ code: 'TQ_NETWORK_UNAVAILABLE', status: 503, message: '后端 TQ 行情网络不可用' });
});
