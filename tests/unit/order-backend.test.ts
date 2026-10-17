import { expect, test } from 'bun:test';
import { BackendClient, BackendWriteError } from '../../scripts/crypto/backend';
import { asFetch } from '../fixtures/data';

const config = { base_url: 'http://offline', username: 'user', password: 'PRIVATE', request_timeout_seconds: 1 };
const token = () => Response.json({ access_token: 'private-jwt', token_type: 'bearer', expires_in: 3600 });

test('写入 401 不重新提交，下次明确操作才重新鉴权', async () => {
    let logins = 0, writes = 0;
    const client = new BackendClient(config, asFetch(async (input, init) => {
        if (String(input).endsWith('/auth/token')) { logins++; return token(); }
        expect(init!.method).toBe('POST'); writes++;
        return new Response(null, { status: 401 });
    }));
    await expect(client.write('/ccxt/create_market_order', { amount: '1' })).rejects.toMatchObject({ code: 'BACKEND_AUTH_FAILED', writeState: 'rejected' });
    expect([logins, writes]).toEqual([1, 1]);
    await expect(client.write('/ccxt/create_market_order', { amount: '1' })).rejects.toBeInstanceOf(BackendWriteError);
    expect([logins, writes]).toEqual([2, 2]);
});

test('写入网络失败为未知，明确拒单与价格预检未提交保留事实', async () => {
    for (const [status, code, state] of [[409, 'INSUFFICIENT_FUNDS', 'rejected'], [503, 'PRICE_RULES_UNAVAILABLE', 'rejected'],
        [502, 'OPERATION_STATUS_UNKNOWN', 'unknown'], [502, 'INVALID_PROVIDER_DATA', 'unknown']] as const) {
        let writes = 0;
        const client = new BackendClient(config, asFetch(async input => {
            if (String(input).endsWith('/auth/token')) return token();
            writes++; return Response.json({ detail: { code, message: 'PRIVATE', info: 'private-jwt' } }, { status });
        }));
        try { await client.write('/ccxt/create_market_order', {}); throw new Error('应失败'); }
        catch (error) {
            expect(error).toMatchObject({ code, writeState: state });
            expect(String(error)).not.toContain('PRIVATE'); expect(String(error)).not.toContain('private-jwt');
        }
        expect(writes).toBe(1);
    }
    let writes = 0;
    const disconnected = new BackendClient(config, asFetch(async input => {
        if (String(input).endsWith('/auth/token')) return token();
        writes++; throw new Error('PRIVATE');
    }));
    await expect(disconnected.write('/ccxt/create_market_order', {})).rejects.toMatchObject({ writeState: 'unknown', code: 'BACKEND_UNAVAILABLE' });
    expect(writes).toBe(1);
});

test('登录前取消或鉴权失败不会发送交易请求，成功响应保留原始回执', async () => {
    let calls = 0;
    const failed = new BackendClient(config, asFetch(async () => { calls++; return new Response(null, { status: 401 }); }));
    await expect(failed.write('/ccxt/create_market_order', {}, AbortSignal.abort())).rejects.toMatchObject({ writeState: 'not_sent' });
    expect(calls).toBe(0);
    await expect(failed.write('/ccxt/create_market_order', {})).rejects.toMatchObject({ writeState: 'not_sent', code: 'BACKEND_AUTH_FAILED' });
    expect(calls).toBe(1);
    const receipt = { order: { id: 'one', symbol: 'BTC/USDT:USDT', status: null } };
    const accepted = new BackendClient(config, asFetch(async input => String(input).endsWith('/auth/token') ? token() : Response.json(receipt)));
    expect(await accepted.write('/ccxt/create_market_order', {})).toEqual(receipt);
});
