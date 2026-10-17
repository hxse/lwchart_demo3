import { expect, spyOn, test } from 'bun:test';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import { initialOrderDraft, OrderPanelState } from '../../src/crypto/trading/panel-state';
import type { Quote, TradeIdentity } from '../../src/crypto/trading/types';
import { orderData } from '../fixtures/orders';
import { candle, deferred, result, runtime } from '../fixtures/data';

const settle = () => Bun.sleep(0);
function data(identity: TradeIdentity) {
    const value = orderData(); value.market_info.symbol = identity.symbol; value.trading_fee.symbol = identity.symbol;
    value.trading_fee.mode = identity.is_live ? 'live' : 'sandbox'; return value;
}
const quote = (symbol: string): Quote => ({ ticker: { symbol, last: '10000', bid: null, ask: null, timestamp: null }, observed_at: Date.now() });
function timers() {
    let counter = 0;
    const callbacks = new Map<number, { callback: () => void; delay: number }>();
    const start = spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
        const id = ++counter; callbacks.set(id, { callback, delay }); return id;
    }) as unknown as typeof setInterval);
    const stop = spyOn(globalThis, 'clearInterval').mockImplementation(id => { callbacks.delete(Number(id)); });
    return { callbacks, restore() { start.mockRestore(); stop.mockRestore(); } };
}

test('面板默认取全部图表最小周期，风险参数应用不重取历史或重建 ticker，关闭释放自身订阅', async () => {
    const clock = timers(); let histories = 0, quotes = 0, metadata = 0;
    const hub = new MarketHub({ async latest() { histories++; return result(Array.from({ length: 30 }, (_, i) => candle(i))); } });
    const settings = { ...runtime.defaults, timeframes: ['4h', '1d', '30m', '1w'] as const };
    const draft = initialOrderDraft({ ...settings, timeframes: [...settings.timeframes] });
    expect(draft.timeframe).toBe('30m'); expect(draft.atr_period).toBe('14'); expect(draft.risk_amount).toBe('1');
    const panel = new OrderPanelState(runtime.defaults, hub, {
        async data(id) { metadata++; return data(id); }, async quote(id) { quotes++; return quote(id.symbol); },
    });
    try {
        panel.start(); await settle();
        expect(panel.snapshot().directions.buy.preview).not.toBeNull();
        expect([histories, quotes, metadata]).toEqual([1, 1, 1]);
        const original = [...clock.callbacks.keys()];
        panel.apply({ ...panel.initialDraft, risk_amount: '2' });
        expect(panel.snapshot().parameters.risk_amount).toBe('2');
        expect([histories, quotes, metadata]).toEqual([1, 1, 1]);
        expect([...clock.callbacks.keys()]).toEqual(original);
        panel.apply({ ...panel.initialDraft, timeframe: '1h', atr_period: '20' }); await settle();
        expect(histories).toBe(2); expect(quotes).toBe(1); expect(metadata).toBe(1);
        panel.apply({ ...panel.initialDraft, symbol: 'ETH/USDT:USDT' }); await settle();
        expect(panel.prepare('buy').symbol).toBe('ETH/USDT:USDT');
        expect([histories, quotes, metadata]).toEqual([3, 2, 2]);
        const date = spyOn(Date, 'now').mockReturnValue(Date.now() + 20000);
        try { expect(panel.snapshot().directions.buy.error).toContain('过期'); } finally { date.mockRestore(); }
    } finally { panel.dispose(); hub.dispose(); expect(clock.callbacks.size).toBe(0); clock.restore(); }
});

test('ticker 一秒单飞，换身份和关闭均取消旧请求并丢弃迟到响应', async () => {
    const clock = timers(); const old = deferred<Quote>();
    const signals: AbortSignal[] = []; let quotes = 0;
    const hub = new MarketHub({ async latest() { return result(Array.from({ length: 30 }, (_, i) => candle(i))); } });
    const panel = new OrderPanelState(runtime.defaults, hub, { async data(id) { return data(id); },
        async quote(id, signal) { signals.push(signal); quotes++; return quotes === 1 ? old.promise : quote(id.symbol); } });
    try {
        panel.start(); await settle();
        const ticker = [...clock.callbacks.values()].find(timer => timer.delay === 1000)!;
        ticker.callback(); ticker.callback(); await settle(); expect(quotes).toBe(1);
        panel.apply({ ...panel.initialDraft, symbol: 'ETH/USDT:USDT' }); await settle();
        expect(quotes).toBe(2); expect(signals[0]!.aborted).toBe(true);
        old.resolve(quote('BTC/USDT:USDT')); await settle();
        expect(panel.snapshot().quote?.ticker.symbol).toBe('ETH/USDT:USDT');
        expect(panel.prepare('buy').symbol).toBe('ETH/USDT:USDT');
        panel.dispose(); expect(signals[1]!.aborted).toBe(true); expect(clock.callbacks.size).toBe(0);
    } finally { panel.dispose(); hub.dispose(); clock.restore(); }
});

test('非法草稿不启动新请求，报价失败或 ATR 未预热时不保留可下单预览', async () => {
    const clock = timers(); let count = 0, failQuote = false;
    const hub = new MarketHub({ async latest() { return result([candle(0)]); } });
    const panel = new OrderPanelState(runtime.defaults, hub, { async data(id) { count++; return data(id); },
        async quote(id) { count++; if (failQuote) throw new Error('报价失败'); return quote(id.symbol); } });
    try {
        panel.start(); await settle();
        expect(panel.snapshot().directions.buy.error).toContain('ATR');
        const before = count;
        expect(() => panel.apply({ ...panel.initialDraft, risk_tolerance: '100' })).toThrow('100%');
        expect(count).toBe(before);
        failQuote = true;
        [...clock.callbacks.values()].find(timer => timer.delay === 1000)!.callback(); await settle();
        expect(panel.snapshot().quote).toBeNull();
        expect(() => panel.prepare('sell')).toThrow('报价失败');
    } finally { panel.dispose(); hub.dispose(); clock.restore(); }
});

test('报价年龄只按成功响应计时，失败保留上次时间，换品种清空并从新响应重新计时', async () => {
    const clock = timers(); let now = 0, fail = false;
    const time = spyOn(performance, 'now').mockImplementation(() => now);
    let gate = deferred<Quote>();
    const hub = new MarketHub({ async latest() { return result(Array.from({ length: 30 }, (_, i) => candle(i))); } });
    const panel = new OrderPanelState(runtime.defaults, hub, { async data(id) { return data(id); },
        async quote() { if (fail) throw new Error('报价失败'); return gate.promise; } });
    try {
        panel.start(); await settle(); expect(panel.snapshot().quoteAgeSeconds).toBeNull();
        gate.resolve(quote('BTC/USDT:USDT')); await settle(); expect(panel.snapshot().quoteAgeSeconds).toBe(0);
        now = 2300; expect(panel.snapshot().quoteAgeSeconds).toBe(2);
        fail = true;
        const tick = [...clock.callbacks.values()].find(timer => timer.delay === 1000)!.callback;
        tick(); await settle();
        expect(panel.snapshot().quote).toBeNull(); expect(panel.snapshot().quoteAgeSeconds).toBe(2);
        expect(() => panel.prepare('buy')).toThrow('报价失败');
        now = 7200; expect(panel.snapshot().quoteAgeSeconds).toBe(7);
        fail = false; tick(); await settle(); expect(panel.snapshot().quoteAgeSeconds).toBe(0);
        now = 12201; expect(() => panel.prepare('buy')).toThrow('报价已失效');
        gate = deferred<Quote>();
        panel.apply({ ...panel.initialDraft, symbol: 'ETH/USDT:USDT' }); await settle();
        expect(panel.snapshot().quoteAgeSeconds).toBeNull(); expect(panel.snapshot().quote).toBeNull();
        gate.resolve(quote('ETH/USDT:USDT')); await settle();
        now = 13201; expect(panel.snapshot().quoteAgeSeconds).toBe(1);
        expect(panel.prepare('buy').symbol).toBe('ETH/USDT:USDT');
    } finally { panel.dispose(); hub.dispose(); time.mockRestore(); clock.restore(); }
});

test('强制刷新共用在途 ticker，五秒冷却及在途门禁拦截重复调用，失败也冷却且不影响自动轮询', async () => {
    const clock = timers(); let now = 0, histories = 0, quotes = 0, metadata = 0, fail = false;
    const time = spyOn(performance, 'now').mockImplementation(() => now);
    let gate: ReturnType<typeof deferred<Quote>> | null = null;
    const rows = Array.from({ length: 30 }, (_, i) => candle(i));
    const hub = new MarketHub({ async latest(_id, limit) { histories++; return result(rows.slice(-limit)); } });
    const panel = new OrderPanelState(runtime.defaults, hub, {
        async data(id) { metadata++; if (fail) throw new Error('资料失败'); return data(id); },
        async quote(id) { quotes++; if (fail) throw new Error('报价失败'); return gate ? gate.promise : quote(id.symbol); },
    });
    try {
        panel.start(); await settle(); expect([histories, quotes, metadata]).toEqual([1, 1, 1]);
        const tick = [...clock.callbacks.values()].find(timer => timer.delay === 1000)!.callback;
        now = 1000; gate = deferred<Quote>(); tick();
        const refreshing = panel.refresh(); await panel.refresh(); await settle();
        expect([histories, quotes, metadata]).toEqual([2, 2, 2]);
        expect(panel.snapshot().refreshing).toBe(true); expect(panel.snapshot().refreshCooldownSeconds).toBe(5);
        now = 7000; expect(panel.snapshot().refreshCooldownSeconds).toBe(0);
        await panel.refresh(); tick(); expect([histories, quotes, metadata]).toEqual([2, 2, 2]);
        gate.resolve(quote('BTC/USDT:USDT')); await refreshing; gate = null;
        expect(panel.snapshot().refreshing).toBe(false); expect(panel.snapshot().quoteAgeSeconds).toBe(0);
        now = 7100; fail = true; await panel.refresh();
        expect([histories, quotes, metadata]).toEqual([3, 3, 3]);
        expect(panel.snapshot().error).toBe('资料失败'); expect(panel.snapshot().refreshing).toBe(false);
        expect(panel.snapshot().refreshCooldownSeconds).toBe(5);
        for (let i = 0; i < 5; i++) await panel.refresh();
        expect([histories, quotes, metadata]).toEqual([3, 3, 3]);
        now = 9100; fail = false; tick(); await settle();
        expect([histories, quotes, metadata]).toEqual([3, 4, 3]);
        expect(panel.snapshot().quoteAgeSeconds).toBe(0); expect(panel.snapshot().refreshCooldownSeconds).toBe(3);
        now = 12100; await panel.refresh();
        expect([histories, quotes, metadata]).toEqual([4, 5, 4]);
        expect(panel.snapshot().directions.buy.preview).not.toBeNull();
        panel.dispose(); now = 20000; await panel.refresh();
        expect([histories, quotes, metadata]).toEqual([4, 5, 4]);
    } finally { panel.dispose(); hub.dispose(); time.mockRestore(); clock.restore(); }
});
