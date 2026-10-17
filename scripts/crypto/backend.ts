import type { BackendConfig } from './config';
import { parseTqJson } from './ohlcv';

export class GatewayError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export class BackendWriteError extends GatewayError {
    constructor(error: GatewayError, readonly writeState: 'not_sent' | 'rejected' | 'unknown') {
        super(error.status, error.code, error.message);
    }
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
    INSUFFICIENT_FUNDS: '账户资金不足，交易所已拒绝订单', ORDER_REJECTED: '交易所已拒绝订单',
    PROVIDER_OPERATION_REJECTED: '交易所拒绝此操作，请检查账户或仓位状态', ORDER_NOT_FOUND: '此次查询未找到订单，不能据此判断从未成交',
    INVALID_ORDER_PRICE: '订单价格无效', INVALID_PRICE_PRECISION: '订单价格不符合交易所步长',
    PRICE_OUT_OF_RANGE: '订单价格超出交易所范围', PRICE_RULES_UNAVAILABLE: '后端无法取得价格校验资料，订单未提交',
    OPERATION_STATUS_UNKNOWN: '订单结果未知，请核对交易所订单，勿重复提交',
    FEE_CREDENTIALS_NOT_CONFIGURED: 'Kraken 后端未配置当前实盘账户的费用查询凭据',
    PUBLIC_TIME_NOT_READY: '后端可信时钟尚未就绪', PUBLIC_TIME_EXPIRED: '后端可信时钟已过期',
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
    private waitForToken(signal?: AbortSignal): Promise<Token> {
        if (signal?.aborted) return Promise.reject(this.connectionError(signal));
        const pending = this.token();
        if (!signal) return pending;
        // 单个读取取消不取消共享登录，但也不继续等待或发送后续请求。
        return new Promise((resolve, reject) => {
            const aborted = () => reject(this.connectionError(signal));
            signal.addEventListener('abort', aborted, { once: true });
            void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
        });
    }
    private responseError(status: number, body: any) {
        const rawCode = typeof body?.detail === 'string' ? body.detail : body?.detail?.code;
        const code = typeof rawCode === 'string' && Object.hasOwn(messages, rawCode) ? rawCode : 'BACKEND_ERROR';
        return new GatewayError(status, code, messages[code] || `后端请求失败（${status}）`);
    }
    async read(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
        const token = await this.waitForToken(signal);
        const url = `${path}?${params}`;
        const get = (value: Token) => this.request(url, { headers: { Authorization: `Bearer ${value.value}` } }, signal);
        let reply = await get(token);
        if (reply.response.status === 401) {
            await reply.response.body?.cancel();
            if (this.current === token) this.current = null;
            reply = await get(await this.waitForToken(signal));
        }
        if (reply.response.status === 401) {
            await reply.response.body?.cancel();
            throw new GatewayError(502, 'BACKEND_AUTH_FAILED', '后端鉴权失败，请检查运行配置');
        }
        const body = await this.json(reply, false, path === '/tq/fetch_ohlcv');
        if (!reply.response.ok) throw this.responseError(reply.response.status, body);
        return body;
    }
    async write(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
        let token: Token;
        try { token = await this.waitForToken(signal); }
        catch (error) { throw new BackendWriteError(error as GatewayError, 'not_sent'); }
        if (signal?.aborted) throw new BackendWriteError(this.connectionError(signal), 'not_sent');
        try {
            const reply = await this.request(path, { method: 'POST', headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body) }, signal);
            if (reply.response.status === 401) {
                await reply.response.body?.cancel();
                if (this.current === token) this.current = null;
                throw new BackendWriteError(new GatewayError(401, 'BACKEND_AUTH_FAILED', '后端鉴权失效，本次写请求未重试'), 'rejected');
            }
            const data = await this.json(reply);
            if (!reply.response.ok) {
                const error = this.responseError(reply.response.status, data);
                const rejected = [400, 403, 409, 413, 415, 422].includes(error.status)
                    || ['PRICE_RULES_UNAVAILABLE', 'SERVICE_NOT_ENABLED', 'SERVICE_NOT_READY'].includes(error.code);
                throw new BackendWriteError(error, rejected ? 'rejected' : 'unknown');
            }
            return data;
        } catch (error) {
            if (error instanceof BackendWriteError) throw error;
            const failure = error instanceof GatewayError ? error : new GatewayError(502, 'OPERATION_STATUS_UNKNOWN', messages.OPERATION_STATUS_UNKNOWN!);
            throw new BackendWriteError(failure, 'unknown');
        }
    }
}
