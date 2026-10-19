import { BackendWriteError, GatewayError } from '../../scripts/crypto/backend';
import { Decimal } from '../../src/crypto/trading/decimal';
import type { TradeIdentity } from '../../src/crypto/trading/types';
import { orderFee, orderMarket } from './orders';

export interface OrderFixtureOptions {
    scenario: string; ticker_delay: number; entry_delay: number; protection_delay: number; taker: string; price: number;
    position_delay: number; positions: Array<Record<string, unknown>> | null;
    open_orders: Array<Record<string, unknown>>; cancel_delay: number; cancel_sparse: boolean;
}
const initialOptions = (): OrderFixtureOptions => ({ scenario: 'ok', ticker_delay: 0, entry_delay: 0, protection_delay: 0,
    taker: '0.0004', price: 60000, position_delay: 0, positions: null, open_orders: [], cancel_delay: 0, cancel_sparse: false });
export class OrderFixture {
    options: OrderFixtureOptions = initialOptions();
    reads: Array<{ method: string; symbol: string; live: string | null }> = [];
    writes: Array<{ method: string; body: Record<string, unknown> }> = [];
    private orders = new Map<string, Record<string, unknown>>();
    reset() { this.options = initialOptions(); this.reads = []; this.writes = []; this.orders.clear(); }
    private fail(status: number, code: string, write = false) {
        const error = new GatewayError(status, code, `离线 ${code}`);
        throw write ? new BackendWriteError(error, status === 502 ? 'unknown' : 'rejected') : error;
    }
    private identity(params: URLSearchParams): TradeIdentity {
        return { exchange_name: params.get('exchange_name') as TradeIdentity['exchange_name'], market: 'future', is_live: params.get('is_live') === 'true', symbol: params.get('symbol') ?? params.get('symbols')! };
    }
    async read(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
        signal?.throwIfAborted();
        const method = path.split('/').at(-1)!, identity = this.identity(params), scenario = this.options.scenario;
        this.reads.push({ method, symbol: identity.symbol, live: params.get('is_live') });
        if (identity.symbol === 'BAD') this.fail(422, 'INVALID_PROVIDER_REQUEST');
        if (method === 'fetch_market_info') {
            const market = orderMarket();
            market.symbol = identity.symbol; market.base = identity.symbol.split('/')[0]!;
            market.quote = identity.exchange_name === 'kraken' ? 'USD' : 'USDT'; market.settle = market.quote; market.contract_size_currency = market.base;
            if (identity.exchange_name === 'kraken') {
                market.min_amount = null;
                market.quantity_rules = [{ source: 'ccxt', order_types: ['limit', 'market', 'stop_market', 'take_profit_market'], applies_to_reduce_only: null,
                    step_size: { status: 'known', value: '0.001' }, grid_origin: { status: 'known', value: '0' },
                    minimum: { status: 'unknown', value: null }, maximum: { status: 'unknown', value: null } }];
                market.notional_rules = [{ source: 'ccxt', order_types: ['limit', 'market', 'stop_market', 'take_profit_market'], applies_to_reduce_only: null,
                    minimum: { status: 'unknown', value: null }, maximum: { status: 'unknown', value: null }, currency: 'USD', price_reference: 'unknown' }];
                market.price_rules.minimum = { status: 'unknown', value: null }; market.price_rules.maximum = { status: 'unknown', value: null };
            }
            if (scenario === 'bad-grid') market.price_rules.step_size = { status: 'unknown', value: null };
            return market;
        }
        if (method === 'fetch_trading_fee') {
            if (scenario === 'no-fee') this.fail(503, 'FEE_CREDENTIALS_NOT_CONFIGURED');
            return { ...orderFee(), exchange_name: identity.exchange_name, symbol: identity.symbol, mode: identity.is_live ? 'live' : 'sandbox',
                source: identity.exchange_name === 'binance' ? 'binance_commission_rate' : 'kraken_trade_volume', taker: this.options.taker, updated_at: Date.now() };
        }
        if (method === 'fetch_ticker') {
            if (this.options.ticker_delay) await Bun.sleep(this.options.ticker_delay);
            signal?.throwIfAborted();
            if (scenario === 'quote-fail') this.fail(503, 'SERVICE_NOT_READY');
            return { ticker: { symbol: identity.symbol, last: identity.symbol.startsWith('ETH') ? 3000 : this.options.price, bid: null, ask: null, timestamp: Date.now(), info: { private: 'DO_NOT_LEAK' } } };
        }
        if (method === 'fetch_positions') {
            if (this.options.position_delay) await Bun.sleep(this.options.position_delay);
            signal?.throwIfAborted();
            if (scenario === 'positions-fail') this.fail(503, 'SERVICE_NOT_READY');
            if (this.options.positions !== null) return { positions: this.options.positions };
            if (scenario === 'hedged') return { positions: [{ symbol: identity.symbol, hedged: true }] };
            const entry = [...this.orders.values()].find(order => order.type === 'market' && order.symbol === identity.symbol);
            return { positions: entry ? [{ symbol: identity.symbol, hedged: false, side: entry.side === 'buy' ? 'long' : 'short', contracts: entry.filled, entryPrice: this.options.price }] : [] };
        }
        if (method === 'fetch_order') {
            const order = this.orders.get(params.get('id')!);
            if (!order) this.fail(404, 'ORDER_NOT_FOUND');
            return { order };
        }
        if (method === 'fetch_open_orders' || method === 'fetch_closed_orders') return { orders: [...this.orders.values(), ...this.options.open_orders].filter(order => order.symbol === identity.symbol && (method === 'fetch_open_orders' ? order.status === 'open' || order.status == null : order.status !== 'open')) };
        if (method === 'fetch_my_trades') return { trades: [...this.orders.values()].filter(order => order.type === 'market' && Number(order.filled) > 0 && order.symbol === identity.symbol)
            .map(order => ({ id: `trade-${order.id}`, order: order.id, symbol: order.symbol, side: order.side, amount: order.filled,
                price: this.options.price, cost: Number(order.filled) * this.options.price, fee: { cost: Number(order.filled) * this.options.price * Number(this.options.taker), currency: identity.exchange_name === 'kraken' ? 'USD' : 'USDT' } })) };
        this.fail(422, 'NOT_SUPPORTED');
    }
    async write(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
        signal?.throwIfAborted();
        const method = path.split('/').at(-1)!, scenario = this.options.scenario;
        this.writes.push({ method, body: { ...body } });
        if (method === 'cancel_order') {
            if (this.options.cancel_delay) await Bun.sleep(this.options.cancel_delay);
            signal?.throwIfAborted();
            const order = this.orders.get(String(body.id)) ?? this.options.open_orders.find(order => order.id === body.id && order.symbol === body.symbol);
            if (!order) this.fail(404, 'ORDER_NOT_FOUND', true);
            if (scenario === 'cancel-rejected') this.fail(422, 'PROVIDER_OPERATION_REJECTED', true);
            order!.status = 'canceled';
            return { order: this.options.cancel_sparse ? { id: order!.id, symbol: order!.symbol, status: null, type: null, side: null } : order };
        }
        const id = `offline-${this.writes.length}`;
        const entry = method === 'create_market_order', stop = method === 'create_stop_market_order';
        if (entry && this.options.entry_delay) await Bun.sleep(this.options.entry_delay);
        if (!entry && this.options.protection_delay) await Bun.sleep(this.options.protection_delay);
        if (entry && scenario === 'insufficient') this.fail(409, 'INSUFFICIENT_FUNDS', true);
        if (stop && scenario === 'stop-rejected' || !entry && !stop && scenario === 'take-profit-rejected') this.fail(422, 'ORDER_REJECTED', true);
        if (entry && scenario === 'entry-unknown') this.fail(502, 'OPERATION_STATUS_UNKNOWN', true);
        const amount = Number(body.amount);
        const partial = Number(new Decimal(Decimal.parse(String(body.amount)).div(Decimal.parse('0.001')).floor() / 2n).mul(Decimal.parse('0.001')).toString());
        const filled = entry ? scenario === 'partial' || scenario === 'entry-pending' ? Math.max(0.001, partial) : amount : scenario === 'stop-triggered' && stop ? amount : 0;
        const order = { id, symbol: body.symbol, side: body.side, type: entry ? 'market' : stop ? 'stop_market' : 'take_profit_market',
            status: entry ? scenario === 'entry-pending' ? 'open' : scenario === 'partial' ? 'canceled' : 'closed' : scenario === 'stop-triggered' && stop ? 'closed' : 'open',
            amount, filled, average: entry && scenario !== 'missing-average' ? this.options.price : null,
            reduceOnly: body.reduceOnly ?? false, triggerPrice: body.triggerPrice === undefined ? null : Number(body.triggerPrice), clientOrderId: body.clientOrderId };
        this.orders.set(id, order);
        if (entry && scenario === 'entry-unknown-found') this.fail(502, 'OPERATION_STATUS_UNKNOWN', true);
        return { order };
    }
    async control(request: Request) {
        if (request.method === 'POST') {
            const input = await request.json();
            if (input.reset) this.reset();
            for (const key of Object.keys(this.options) as Array<keyof OrderFixtureOptions>) if (input[key] !== undefined) Object.assign(this.options, { [key]: input[key] });
        }
        return Response.json({ reads: this.reads, writes: this.writes, options: this.options });
    }
    async handle(request: Request) {
        const url = new URL(request.url);
        try {
            const body = request.method === 'POST' ? await this.write(url.pathname, await request.json(), request.signal) : await this.read(url.pathname, url.searchParams, request.signal);
            return Response.json(body);
        } catch (error) {
            if (error instanceof GatewayError) return Response.json({ detail: { code: error.code, message: 'DO_NOT_LEAK' } }, { status: error.status });
            return new Response(null, { status: 500 });
        }
    }
}
