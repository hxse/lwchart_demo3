import type { BackendConfig } from './config';
import { parseTqJson } from './ohlcv';

export class GatewayError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
interface Token { value: string; expiresAt: number }
interface BackendReply { response: Response; signal: AbortSignal }
type Fetcher = typeof fetch;
const messages: Record<string, string> = {
    SERVICE_NOT_ENABLED: '后端未启用所选行情服务', SERVICE_NOT_READY: '后端行情服务尚未就绪',
    NOT_SUPPORTED: '后端不支持该市场、品种或周期', NETWORK_INCOMPLETE: '后端行情数据不完整',
    INVALID_PROVIDER_REQUEST: '后端拒绝行情参数', PROVIDER_AUTH_FAILED: '后端交易所鉴权失败',
    INVALID_PROVIDER_DATA: '后端行情数据无效', RESPONSE_ROW_LIMIT_EXCEEDED: '后端响应超出行数限制',
    CACHE_CAPACITY_EXCEEDED: '后端缓存容量不足', PROVIDER_FAILURE: '后端行情服务请求失败',
    TQ_NOT_READY: '后端 TQ 行情服务尚未就绪', TQ_NETWORK_UNAVAILABLE: '后端 TQ 行情网络不可用',
    TQ_DATA_TIMEOUT: '后端 TQ 行情请求超时', TQ_UPSTREAM_ERROR: '后端 TQ 上游请求失败',
    TQ_INVALID_TIME_AXIS: '后端 TQ 行情时间无效', TQ_INVALID_OHLCV_VALUES: '后端 TQ 行情价格无效',
    TQ_TRADING_STATUS_UNAVAILABLE: '后端无法确认 TQ 休市状态', TQ_INVALID_SYMBOL: '后端拒绝 TQ 品种',
    TQ_PERMISSION_DENIED: '后端账号没有 TQ 行情权限', TQ_CACHE_READ_FAILED: '后端 TQ 缓存读取失败',
};

/** 开发中间件与生产服务共用该鉴权客户端，旧 token 失败不能注销新 token。 */
export class BackendClient {
    private current: Token | null = null;
    private loginPromise: Promise<Token> | null = null;
    constructor(private config: BackendConfig, private fetcher: Fetcher = fetch) {}

    private async request(path: string, init: RequestInit, signal?: AbortSignal) {
        const timeout = AbortSignal.timeout(this.config.request_timeout_seconds * 1000);
        const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
        try {
            const response = await this.fetcher(`${this.config.base_url}${path}`, { ...init, signal: combined });
            return { response, signal: combined };
        } catch { throw this.connectionError(combined); }
    }
    private connectionError(signal: AbortSignal) {
        if (signal.aborted && signal.reason?.name === 'TimeoutError') return new GatewayError(504, 'BACKEND_TIMEOUT', '后端请求超时');
        if (signal.aborted) return new GatewayError(499, 'REQUEST_CANCELLED', '请求已取消');
        return new GatewayError(502, 'BACKEND_UNAVAILABLE', '无法连接后端');
    }
    private async json(reply: BackendReply, auth = false, tq = false): Promise<any> {
        try { return tq ? parseTqJson(await reply.response.text()) : await reply.response.json(); }
        catch {
            if (reply.signal.aborted) throw this.connectionError(reply.signal);
            throw new GatewayError(502, auth ? 'BACKEND_AUTH_FAILED' : 'BACKEND_INVALID_RESPONSE', '后端响应格式无效');
        }
    }
    private async login(): Promise<Token> {
        const reply = await this.request('/auth/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'password', username: this.config.username, password: this.config.password }),
        });
        if (!reply.response.ok) {
            await reply.response.body?.cancel();
            throw new GatewayError(502, 'BACKEND_AUTH_FAILED', '后端登录失败，请检查运行配置');
        }
        const data = await this.json(reply, true);
        if (!data || typeof data.access_token !== 'string' || !data.access_token || data.token_type !== 'bearer'
            || !Number.isSafeInteger(data.expires_in) || Number(data.expires_in) <= 0) {
            throw new GatewayError(502, 'BACKEND_AUTH_FAILED', '后端登录响应无效');
        }
        const token = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 };
        this.current = token;
        return token;
    }
    private token(): Promise<Token> {
        if (this.current && this.current.expiresAt > Date.now()) return Promise.resolve(this.current);
        if (!this.loginPromise) {
            this.loginPromise = this.login().finally(() => { this.loginPromise = null; });
        }
        return this.loginPromise;
    }
    async read(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
        const token = await this.token();
        const url = `${path}?${params}`;
        const get = (value: Token) => this.request(url, { headers: { Authorization: `Bearer ${value.value}` } }, signal);
        let reply = await get(token);
        if (reply.response.status === 401) {
            await reply.response.body?.cancel();
            if (this.current === token) this.current = null;
            reply = await get(await this.token());
        }
        if (reply.response.status === 401) {
            await reply.response.body?.cancel();
            throw new GatewayError(502, 'BACKEND_AUTH_FAILED', '后端鉴权失败，请检查运行配置');
        }
        const body = await this.json(reply, false, path === '/tq/fetch_ohlcv');
        if (!reply.response.ok) {
            const rawCode = typeof body?.detail === 'string' ? body.detail : body?.detail?.code;
            const code = typeof rawCode === 'string' && Object.hasOwn(messages, rawCode) ? rawCode : 'BACKEND_ERROR';
            throw new GatewayError(reply.response.status, code, messages[code] || `后端请求失败（${reply.response.status}）`);
        }
        return body;
    }
}
