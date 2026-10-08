import { expect, test, spyOn } from 'bun:test';
import { TickMarkType, type UTCTimestamp } from 'lightweight-charts';
import { createTimeDisplay, validateTimezone } from '../../src/crypto/time';

const timestamp = (year: number, month: number, day: number, hour: number, minute = 0) => Date.UTC(year, month - 1, day, hour, minute) / 1000 as UTCTimestamp;

test('本地、UTC 和 IANA 时间显示保持同一 UTC 数据，轴和图例使用相同格式器', () => {
    const time = timestamp(2026, 10, 8, 1, 30);
    const shanghai = createTimeDisplay('Asia/Shanghai');
    expect(shanghai.format(time)).toBe('2026-10-08 09:30:00 · Asia/Shanghai');
    expect(shanghai.ticks(time, TickMarkType.Time, 'en')).toBe('09:30');
    expect(createTimeDisplay('UTC').format(time)).toBe('2026-10-08 01:30:00 · UTC');
    const local = createTimeDisplay('local');
    expect(local.zone).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(local.format(time)).toBe(createTimeDisplay(local.zone).format(time));
    expect(time).toBe(Date.UTC(2026, 9, 8, 1, 30) / 1000 as UTCTimestamp);
    expect(validateTimezone('UTC')).toBe('UTC');
    expect(() => validateTimezone('Invalid/Zone')).toThrow('显示时区');
    expect(() => validateTimezone('')).toThrow('显示时区');
});

test('按每个实际时间处理夏令时，交易日期不随时区平移', () => {
    const display = createTimeDisplay('America/New_York');
    expect(display.format(timestamp(2026, 11, 1, 5, 30))).toBe('2026-11-01 01:30:00 · America/New_York');
    expect(display.format(timestamp(2026, 11, 1, 7, 30))).toBe('2026-11-01 02:30:00 · America/New_York');
    expect(display.format({ year: 2026, month: 10, day: 8 })).toBe('2026-10-08');
    expect(display.ticks('2026-10-08', TickMarkType.DayOfMonth, 'en')).toBe('08');
});

test('格式器预创建，多个图表重复格式化同一根不再次构造 Intl 或解析日期', () => {
    const display = createTimeDisplay('Asia/Shanghai');
    const parts = spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
    const constructor = spyOn(Intl, 'DateTimeFormat');
    try {
        const a = timestamp(2026, 10, 8, 1, 30); const b = timestamp(2026, 10, 8, 0);
        const first = display.format(a); display.format(b);
        for (let i = 0; i < 20; i++) { expect(display.format(a)).toBe(first); display.format(b); }
        expect(constructor).not.toHaveBeenCalled(); expect(parts).toHaveBeenCalledTimes(2);
    } finally { constructor.mockRestore(); parts.mockRestore(); }
});
