import { expect, test } from 'bun:test';
import type { ISeriesApi, Time } from 'lightweight-charts';
import { clearTimeline, commitTimeline, nextTimeline, seriesValues, timelinePoint, timelineTail, updateTimeline, type SeriesPoint } from '../../src/components/lw-chart/logic/SeriesTimeline';
import { findClosestTime } from '../../src/components/lw-chart/logic/TimeScaleHelper';

const time = (value: number) => value as Time;
const value = (index: number, number = index): SeriesPoint => ({ time: time(index), value: number });
const gap = (index: number): SeriesPoint => ({ time: time(index), customValues: { displayValue: '未定义' } });
function fixture(kind = 'Line') {
    let reads = 0, sdkRows: SeriesPoint[] = [];
    const api = { seriesType: () => kind, data: () => { reads++; return sdkRows.map(point => ({ ...point })); } } as unknown as ISeriesApi<any>;
    return { api, get reads() { return reads; }, set sdkRows(rows: SeriesPoint[]) { sdkRows = rows; },
        replace(rows: SeriesPoint[]) { commitTimeline(api, nextTimeline(api, rows, true)); },
        closest(target: number) { return findClosestTime(new Map([['first', api]]), target); } };
}

test('索引排除缺口，历史增删值、尾部覆盖与追加均保持精确前驱，不整批读取 SDK', () => {
    const f = fixture(); f.replace([gap(0), value(10), gap(20), value(30)]);
    expect(seriesValues(f.api).map(point => Number(point.time))).toEqual([10, 30]);
    expect(f.closest(25)).toBe(10); expect(f.closest(5)).toBeNull(); expect(f.closest(30)).toBe(30);
    expect(timelinePoint(f.api, time(20))?.customValues.displayValue).toBe('未定义');
    updateTimeline(f.api, [value(20, 99)]);
    expect(f.closest(25)).toBe(20);
    updateTimeline(f.api, [gap(10), gap(30)]);
    expect(seriesValues(f.api)).toEqual([value(20, 99)]);
    expect(timelineTail(f.api)?.time).toBe(time(30)); expect(seriesValues(f.api).at(-1)?.time).toBe(time(20));
    updateTimeline(f.api, [value(30, 100), value(40), gap(50)]);
    expect(seriesValues(f.api)).toEqual([value(20, 99), value(30, 100), value(40)]);
    for (let i = 0; i < 100; i++) expect(f.closest(45)).toBe(40);
    expect(f.reads).toBe(0);
});

test('完整替换、裁剪、空窗口和释放同步索引，调用方修改输入不会污染已提交数据', () => {
    const f = fixture(), rows = [value(10), value(20), value(30)]; f.replace(rows);
    rows[0]!.value = -1; rows[0]!.time = time(999);
    expect(seriesValues(f.api)[0]).toEqual(value(10));
    f.replace([value(30), value(40)]); expect(f.closest(20)).toBeNull(); expect(f.closest(35)).toBe(30);
    f.replace([]); expect(seriesValues(f.api)).toEqual([]); expect(timelineTail(f.api)).toBeUndefined(); expect(f.closest(40)).toBeNull();
    clearTimeline(f.api); f.sdkRows = [value(60)];
    expect(f.closest(70)).toBe(60); expect(f.closest(70)).toBe(60); expect(f.reads).toBe(1);
});

test('首次查询之前的历史修正、缺口与完整替换不丢数据，查询后继续局部更新', () => {
    const f = fixture(); f.replace([value(10), gap(20), value(30)]);
    updateTimeline(f.api, [gap(10), value(20), value(30, 99), gap(40)]);
    f.replace([value(30, 99), gap(40)]);
    updateTimeline(f.api, [value(40, 100), value(50)]);
    expect(f.closest(45)).toBe(40); expect(seriesValues(f.api)).toEqual([value(30, 99), value(40, 100), value(50)]);
    updateTimeline(f.api, [gap(40)]); expect(f.closest(45)).toBe(30); expect(f.reads).toBe(0);
});

test('日期点及自定义系列遵守 SDK 的有值集合，日期不匹配数值光标', () => {
    const f = fixture();
    f.replace([{ time: '2026-10-01', value: 0 }, { time: { year: 2026, month: 10, day: 2 } }, { time: '2026-10-03', value: 3 }]);
    expect(f.closest(9999999999)).toBeNull();
    updateTimeline(f.api, [{ time: { year: 2026, month: 10, day: 2 }, value: 2 }]);
    expect(seriesValues(f.api).map(point => point.value)).toEqual([0, 2, 3]);
    const custom = fixture('Custom');
    const points = [{ time: time(1), points: [] }, { time: time(2), points: [{ value: 100 }] }];
    custom.sdkRows = [points[1]!]; custom.replace(points);
    expect(custom.closest(1)).toBeNull(); expect(custom.closest(3)).toBe(2); expect(custom.reads).toBe(1);
});

test('固定输入序列的历史值与缺口反复切换后，索引等于完整可用时间集合', () => {
    const f = fixture(), points = Array.from({ length: 100 }, (_, index) => index % 3 ? value(index) : gap(index));
    f.replace(points);
    for (let step = 0; step < 80; step++) {
        const index = (step * 37) % points.length;
        points[index] = step % 2 ? value(index, -step) : gap(index);
        updateTimeline(f.api, [points[index]!]);
        const expected = points.filter(point => point.value !== undefined);
        expect(seriesValues(f.api)).toEqual(expected);
        for (const target of [-1, 0, 13.5, 37, 99, 150]) {
            const match = expected.filter(point => Number(point.time) <= target).at(-1);
            expect(f.closest(target)).toBe(match ? Number(match.time) : null);
        }
    }
    expect(f.reads).toBe(0);
});
