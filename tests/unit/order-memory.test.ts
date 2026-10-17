import { expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOrderMemory, changeOrderIdentity, cancelOrderDraft, resetOrderDraft, orderReaderSettings, sameChartIdentity } from '../../src/crypto/trading/memory';
import { normalizeSettings, normalizeOptions, activeOptions } from '../../src/crypto/options';
import { parseDashboardQuery, serializeDashboardQuery } from '../../src/crypto/query';
import { MarketHub } from '../../src/crypto/data/MarketHub';
import { IndicatorStream } from '../../src/indicators/IndicatorStream';
import { loadCryptoConfig } from '../../scripts/crypto/config';
import { runtime, defaults, candle, result } from '../fixtures/data';

test('页面记忆只初始化一次且实例隔离，草稿保留原始文本与折叠状态', () => {
    const first = createOrderMemory(runtime.defaults), second = createOrderMemory(runtime.defaults);
    first.draft.risk_amount = '2.'; first.draft.atr_period = ''; first.dirty = true; first.expanded.reference = false;
    first.exampleVisibility.stop = false;
    expect(first.applied.risk_amount).toBe('1'); expect(second.draft.risk_amount).toBe('1');
    expect(second.dirty).toBe(false); expect(second.expanded.reference).toBe(true);
    expect(second.exampleVisibility).toEqual({ entry: true, stop: true, 'take-profit': true });
    const tq = createOrderMemory({ ...runtime.defaults, source: 'tq' });
    expect(tq.draft.symbol).toBe(runtime.defaults.tq.symbol); expect(tq.context).toEqual({ source: 'tq' });
});

test('切身份只替换上下文与两份品种，保持待确认输入，取消不回退到旧品种', () => {
    const memory = createOrderMemory(runtime.defaults);
    memory.applied.risk_amount = '2'; memory.draft.risk_amount = ''; memory.draft.timeframe = '1h'; memory.dirty = true;
    memory.exampleVisibility.entry = false;
    const changed = { ...runtime.defaults, ccxt: { ...runtime.defaults.ccxt, exchange_name: 'kraken' as const, symbol: 'BTC/USD:USD' } };
    changeOrderIdentity(memory, changed);
    expect(memory.draft).toMatchObject({ symbol: 'BTC/USD:USD', risk_amount: '', timeframe: '1h' });
    expect(memory.applied).toMatchObject({ symbol: 'BTC/USD:USD', risk_amount: '2', timeframe: '30m' });
    expect(memory.dirty).toBe(true); expect(orderReaderSettings(memory, runtime.defaults).ccxt).toEqual(changed.ccxt);
    changeOrderIdentity(memory, { ...changed, source: 'tq' });
    expect(memory.context.source).toBe('tq'); expect(memory.draft.risk_amount).toBe('');
    changeOrderIdentity(memory, changed); cancelOrderDraft(memory);
    expect(memory.draft).toEqual(memory.applied); expect(memory.dirty).toBe(false);
    expect(memory.draft.symbol).toBe('BTC/USD:USD');
    expect(memory.exampleVisibility.entry).toBe(false);
});

test('重置只改草稿，以当前图表品种和最小周期为默认，不改已确认参数或界面状态', () => {
    const memory = createOrderMemory(runtime.defaults);
    memory.applied.risk_amount = '2'; memory.expanded.log = false;
    const current = { ...runtime.defaults, layout: '1x2' as const, timeframes: ['4h', '1h'] as ['4h', '1h'] };
    resetOrderDraft(memory, current);
    expect(memory.draft).toMatchObject({ risk_amount: '1', timeframe: '1h', atr_period: '14', atr_multiplier: '2', take_profit_multiplier: '2' });
    expect(memory.dirty).toBe(true); expect(memory.applied.risk_amount).toBe('2'); expect(memory.expanded.log).toBe(false);
    cancelOrderDraft(memory); expect(memory.draft.risk_amount).toBe('2');
    expect(sameChartIdentity(runtime.defaults, { ...runtime.defaults, order_panel_inline_width: 480, order_panel_floating_width: 320, order_panel_layout: 'inline' })).toBe(true);
    expect(sameChartIdentity(runtime.defaults, { ...runtime.defaults, source: 'tq' })).toBe(false);
});

test('下单面板显示配置使用统一默认与 URL 往返，不接受交易参数进入 URL', () => {
    expect(normalizeSettings({ ...runtime.defaults, order_panel_layout: undefined, order_panel_inline_width: undefined, order_panel_floating_width: undefined }))
        .toMatchObject({ order_panel_layout: 'floating', order_panel_inline_width: 230, order_panel_floating_width: 230 });
    const value = parseDashboardQuery('?order_panel_layout=inline&order_panel_inline_width=480&order_panel_floating_width=320', runtime);
    expect(value).toMatchObject({ order_panel_layout: 'inline', order_panel_inline_width: 480, order_panel_floating_width: 320 });
    expect(parseDashboardQuery(serializeDashboardQuery(value), runtime)).toEqual(value);
    expect(activeOptions({ ...value, source: 'tq' })).toMatchObject({ order_panel_inline_width: 480, order_panel_floating_width: 320 });
    for (const key of ['order_panel_inline_width', 'order_panel_floating_width']) {
        for (const raw of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992', '0x100']) {
            expect(() => parseDashboardQuery(`?${key}=${raw}`, runtime)).toThrow('下单面板宽度');
        }
        for (const value of [null, true, '480', NaN, Infinity, 0, .5]) {
            expect(() => normalizeOptions({ ...defaults, [key]: value })).toThrow('下单面板宽度');
        }
        expect(() => parseDashboardQuery(`?${key}=`, runtime)).toThrow('URL 参数不能为空');
        expect(() => parseDashboardQuery(`?${key}=480&${key}=560`, runtime)).toThrow('未知或重复参数');
    }
    for (const value of ['unknown', 'INLINE', null, true]) expect(() => normalizeSettings({ ...runtime.defaults, order_panel_layout: value })).toThrow('下单面板布局');
    expect(() => normalizeSettings({ ...runtime.defaults, order_panel_width: 230 })).toThrow('未知字段');
    for (const query of ['?order_panel_width=480', '?order_panel_layout=inline&order_panel_layout=floating', '?risk_amount=2']) {
        expect(() => parseDashboardQuery(query, runtime)).toThrow('未知或重复参数');
    }
});

test('TOML 缺省及部署场景覆盖沿用同一面板显示配置校验', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lwchart-order-display-')), path = join(directory, 'config.toml');
    const example = (await Bun.file('config.example.toml').text()).replace('username = ""', 'username = "offline"').replace('password = ""', 'password = "offline-password"');
    try {
        await Bun.write(path, example.replace('order_panel_layout = "floating"', '').replace('order_panel_inline_width = 230', '').replace('order_panel_floating_width = 230', ''));
        expect((await loadCryptoConfig(path, 'dev')).runtime.defaults).toMatchObject({ order_panel_layout: 'floating', order_panel_inline_width: 230, order_panel_floating_width: 230 });
        await Bun.write(join(directory, 'config.local.toml'), '[server]\nhost="0.0.0.0"\n[dashboard]\norder_panel_layout="inline"\norder_panel_inline_width=480\norder_panel_floating_width=320\n');
        expect((await loadCryptoConfig(path, 'local')).runtime.defaults).toMatchObject({ order_panel_layout: 'inline', order_panel_inline_width: 480, order_panel_floating_width: 320 });
        await Bun.write(path, example.replace('order_panel_inline_width = 230', 'order_panel_inline_width = 0'));
        await expect(loadCryptoConfig(path, 'dev')).rejects.toThrow('下单面板宽度');
        await Bun.write(path, example.replace('order_panel_floating_width = 230', 'order_panel_floating_width = 0'));
        await expect(loadCryptoConfig(path, 'dev')).rejects.toThrow('下单面板宽度');
        await Bun.write(path, example.replace('order_panel_inline_width = 230', 'order_panel_width = 230'));
        await expect(loadCryptoConfig(path, 'dev')).rejects.toThrow('未知字段');
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('仅修改面板布局和宽度保留行情流与原生指标，不重取数据或重新计算', async () => {
    let reads = 0;
    const hub = new MarketHub({ async latest() { reads++; return result(Array.from({ length: 30 }, (_, i) => candle(i))); } });
    try {
        const before = hub.configure(defaults); await Promise.all(before.map(stream => stream.poll()));
        const add = spyOn(IndicatorStream.prototype, 'add'), replace = spyOn(IndicatorStream.prototype, 'replace');
        try {
            expect(hub.configure({ ...defaults, order_panel_layout: 'inline', order_panel_inline_width: 480, order_panel_floating_width: 320 })).toEqual(before);
            expect(reads).toBe(4); expect(add).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
        } finally { add.mockRestore(); replace.mockRestore(); }
    } finally { hub.dispose(); }
});
