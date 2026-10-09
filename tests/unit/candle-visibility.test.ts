import { expect, test } from 'bun:test';
import type { ISeriesApi, ITimeScaleApi, Time } from 'lightweight-charts';
import { candleRightEdge, latestCandleIsUnclipped } from '../../src/components/lw-chart/logic/CandleVisibility';

test('蜡烛边缘适配 SDK 的宽度、奇偶对齐和实际 bitmap 比例', () => {
    for (const [spacing, ratio, right] of [
        [2.4, 1, 101], [2.5, 1, 102], [4, 1, 102], [6, 1, 103],
        [7.25, 1, 103], [10, 1, 104], [10, 2, 208], [10, 1.25, 130],
    ]) expect(candleRightEdge(100, spacing!, ratio!)).toBe(right!);
});

function fixture(ratio: number, spacing: number) {
    let center = 0;
    let available = true;
    let empty = false;
    const canvas = { width: 600 * ratio, clientWidth: 600, clientHeight: 300 };
    const series = {
        data: () => empty ? [] : [{ time: 100 }],
        getPane: () => ({ getHTMLElement: () => ({ querySelectorAll: () => available ? [canvas] : [] }) }),
    } as unknown as ISeriesApi<any>;
    const scale = {
        timeToCoordinate: () => center, width: () => 600, options: () => ({ barSpacing: spacing }),
    } as unknown as ITimeScaleApi<Time>;
    return { visible: () => latestCandleIsUnclipped(scale, series), set center(value: number) { center = value; },
        set available(value: boolean) { available = value; }, set empty(value: boolean) { empty = value; } };
}

test('完整贴边跟随，一个 bitmap 像素裁切或约 1/3 裁切均保持历史', () => {
    for (const ratio of [1, 1.25, 2]) {
        const f = fixture(ratio, 10);
        // 三种比例在此均完整贴边，偏移 1 / ratio 恰好裁掉一个 bitmap 像素。
        f.center = 596;
        expect(f.visible()).toBe(true);
        f.center = 596 + 1 / ratio;
        expect(f.visible()).toBe(false);
        f.center = 598.5;
        expect(f.visible()).toBe(false);
        f.center = 620;
        expect(f.visible()).toBe(false);
        f.center = 500;
        expect(f.visible()).toBe(true);
    }
});

test('空数据保留初始化；未形成绘图区不强制跟随', () => {
    const f = fixture(1, 6);
    f.available = false;
    expect(f.visible()).toBe(false);
    f.empty = true;
    expect(f.visible()).toBe(true);
});
