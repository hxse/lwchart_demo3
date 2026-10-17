import { expect, test } from 'bun:test';
import type { AutoscaleInfo, AutoscaleInfoProvider, CreatePriceLineOptions, IPriceLine, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter } from 'lightweight-charts';
import type { PriceLineGroup } from '../../src/utils/chartTypes';
import { SeriesPriceLines } from '../../src/components/lw-chart/logic/SeriesPriceLines';
import { examplePriceLines, matchesChart } from '../../src/crypto/trading/preview';
import { runtime } from '../fixtures/data';

function fixture(provider?: AutoscaleInfoProvider) {
    const lines = new Set<IPriceLine>();
    const primitives = new Set<ISeriesPrimitive>();
    let attached = 0, detached = 0, redraws = 0;
    let creates = 0, updates = 0, removes = 0, optionUpdates = 0;
    let autoscale = provider;
    const series = {
        createPriceLine(options: CreatePriceLineOptions) {
            creates++; let value = { ...options };
            const line = { options: () => value, applyOptions(next: object) { updates++; value = { ...value, ...next }; } } as IPriceLine;
            lines.add(line); return line;
        },
        removePriceLine(line: IPriceLine) { expect(lines.delete(line)).toBe(true); removes++; },
        applyOptions(options: { autoscaleInfoProvider?: AutoscaleInfoProvider }) { optionUpdates++; autoscale = options.autoscaleInfoProvider; },
        attachPrimitive(primitive: ISeriesPrimitive) {
            attached++; primitives.add(primitive);
            primitive.attached?.({ series, requestUpdate() { redraws++; } } as SeriesAttachedParameter);
        },
        detachPrimitive(primitive: ISeriesPrimitive) { expect(primitives.delete(primitive)).toBe(true); detached++; primitive.detached?.(); },
    } as unknown as ISeriesApi<any>;
    return { manager: new SeriesPriceLines(series, provider), lines, primitives,
        labelCounts: () => ({ attached, detached, redraws }),
        counts: () => ({ creates, updates, removes, optionUpdates }),
        range: () => { const base = () => ({ priceRange: { minValue: 90, maxValue: 110 } }); return autoscale ? autoscale(base) : base(); },
    };
}
const group = (price = 200): PriceLineGroup => ({ series: 'candles', id: 'example', autoscale: true, lines: [
    { id: 'entry', price, color: '#60a5fa', title: '参考开仓（示例）' },
    { id: 'stop', price: 50, color: '#f87171', title: '止损（示例）' },
    { id: 'take-profit', price: 300, color: '#34d399', title: '止盈（示例）' },
] });

test('分组价格线复用对象，重复帧不写 SDK，变价只更新对应线且存量不随更新次数增长', () => {
    const f = fixture(); f.manager.set(group());
    const original = [...f.lines]; const counts = f.counts();
    for (let i = 0; i < 20; i++) f.manager.set(group());
    expect(f.counts()).toEqual(counts);
    for (let i = 1; i <= 100; i++) f.manager.set(group(200 + i / 10));
    expect([...f.lines]).toEqual(original);
    expect(f.counts()).toEqual({ creates: 3, updates: 100, removes: 0, optionUpdates: 1 });
    expect(f.range()?.priceRange).toEqual({ minValue: 50, maxValue: 300 });
    f.manager.clear('example'); expect(f.lines.size).toBe(0);
    expect(f.range()?.priceRange).toEqual({ minValue: 90, maxValue: 110 });
    f.manager.clear('example'); expect(f.counts().removes).toBe(3);
});

test('各组和配置参考线互不覆盖，自动纵轴组合原计算，清组／销毁完整释放', () => {
    const base: AutoscaleInfo = { priceRange: { minValue: 70, maxValue: 120 }, margins: { above: 5, below: 7 } };
    const f = fixture(() => base);
    f.manager.setReferences([{ price: 100, color: '#888888' }]);
    f.manager.set(group());
    f.manager.set({ ...group(), id: 'other', lines: [{ ...group().lines[0]!, price: 400 }] });
    expect(f.range()).toEqual({ ...base, priceRange: { minValue: 50, maxValue: 400 } });
    f.manager.applyOptions({ color: '#ffffff' });
    expect(f.range()?.priceRange).toEqual({ minValue: 50, maxValue: 400 });
    f.manager.set({ ...group(), lines: [] });
    expect(f.lines.size).toBe(2); expect(f.range()?.priceRange).toEqual({ minValue: 70, maxValue: 400 });
    f.manager.clear('other'); expect(f.range()).toEqual(base); expect(f.lines.size).toBe(1);
    f.manager.set({ ...group(), autoscale: false }); expect(f.range()).toEqual(base);
    f.manager.dispose(); expect(f.lines.size).toBe(0); expect(f.counts().creates).toBe(f.counts().removes);
});

test('整组先校验非法输入，错误不能部分删线、变价或修改纵轴', () => {
    const f = fixture(); f.manager.set(group());
    const before = f.counts();
    for (const [bad, message] of [
        [{ ...group(), id: '' }, '组 ID'],
        [{ ...group(), lines: [{ ...group().lines[0]!, price: 201 }, { ...group().lines[1]!, price: Infinity }] }, '有限数值'],
        [{ ...group(), lines: [group().lines[0]!, group().lines[0]!] }, '重复'],
        [{ ...group(), lines: [{ ...group().lines[0]!, lineWidth: 9 }] }, '样式'],
        [{ ...group(), labelPosition: 'right' }, '标签位置'],
        [{ ...group(), labelPosition: null }, '标签位置'],
    ] as const) expect(() => f.manager.set(bad as PriceLineGroup)).toThrow(message);
    expect(f.counts()).toEqual(before); expect(f.lines.size).toBe(3);
    expect(f.range()?.priceRange).toEqual({ minValue: 50, maxValue: 300 });
});

test('示例严格匹配交易身份，沿用预览价格且只生成展示配置', () => {
    const settings = runtime.defaults, identity = { ...settings.ccxt };
    expect(matchesChart(settings, identity)).toBe(true);
    for (const changed of [{ ...identity, is_live: !identity.is_live }, { ...identity, exchange_name: 'kraken' as const },
        { ...identity, symbol: 'ETH/USDT:USDT' }]) expect(matchesChart(settings, changed)).toBe(false);
    expect(matchesChart({ ...settings, source: 'tq' }, identity)).toBe(false);
    const example = { identity, side: 'sell' as const, entry: '100.25', stop: '110.5', takeProfit: '90',
        visible: { entry: true, stop: true, 'take-profit': true } };
    const value = examplePriceLines(example, 'dark');
    expect(value.lines.map(line => line.price)).toEqual([100.25, 110.5, 90]);
    expect(value.labelPosition).toBe('left'); expect(value.lines.map(line => line.title)).toEqual(['空入', '空损', '空盈']);
    expect(examplePriceLines({ ...example, visible: { entry: true, stop: false, 'take-profit': true } }, 'dark').lines.map(line => line.id))
        .toEqual(['entry', 'take-profit']);
    expect(examplePriceLines({ ...example, visible: { entry: false, stop: false, 'take-profit': false } }, 'dark').lines).toEqual([]);
});

test('左侧标签共用一个 primitive，原位更新和切回原生标签不重建线，清组与销毁释放', () => {
    const f = fixture(), left = { ...group(), labelPosition: 'left' as const };
    f.manager.set(left);
    const native = [...f.lines], primitive = [...f.primitives][0]!;
    expect(native.every(line => line.options().title === '' && !line.options().axisLabelVisible)).toBe(true);
    expect(primitive.paneViews!()).toBe(primitive.paneViews!());
    const before = f.labelCounts();
    for (let i = 0; i < 20; i++) f.manager.set(left);
    expect(f.labelCounts()).toEqual(before);
    for (let i = 0; i < 100; i++) f.manager.set({ ...group(201 + i), labelPosition: 'left' });
    expect([...f.primitives]).toEqual([primitive]); expect([...f.lines]).toEqual(native);
    expect(f.counts().creates).toBe(3); expect(f.labelCounts().redraws).toBe(100);
    f.manager.set(group()); expect(f.primitives.size).toBe(0);
    expect(native.every(line => line.options().title && line.options().axisLabelVisible)).toBe(true);
    f.manager.set(left); f.manager.set({ ...left, id: 'other' });
    expect(f.primitives.size).toBe(1); f.manager.clear(left.id); expect(f.primitives.size).toBe(1);
    f.manager.clear('other'); expect(f.primitives.size).toBe(0);
    f.manager.set(left); f.manager.dispose();
    expect(f.primitives.size).toBe(0); expect(f.labelCounts().attached).toBe(f.labelCounts().detached);
    expect(f.lines.size).toBe(0);
});
