import { TickMarkType, type TickMarkFormatter, type Time, type TimeFormatterFn } from 'lightweight-charts';

export interface TimeDisplay { format: TimeFormatterFn; ticks: TickMarkFormatter; zone: string }
export function validateTimezone(value: unknown): string {
    if (typeof value !== 'string' || !value) throw new Error('显示时区不能为空');
    if (value === 'local') return value;
    try { new Intl.DateTimeFormat('en', { timeZone: value }); }
    catch { throw new Error('显示时区必须是 local、UTC 或有效的 IANA 时区'); }
    return value;
}
function dayString(time: Exclude<Time, number>): string {
    if (typeof time === 'string') return time;
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}
export function createTimeDisplay(timezone: string): TimeDisplay {
    validateTimezone(timezone);
    const zone = timezone === 'local' ? new Intl.DateTimeFormat().resolvedOptions().timeZone : timezone;
    const full = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const formats: Intl.DateTimeFormatOptions[] = [{ year: 'numeric' }, { month: 'short' }, { day: '2-digit' },
        { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }];
    const ticks = formats.map(options => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: zone }));
    const dateTicks = formats.slice(0, 3).map(options => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }));
    const cached = new Map<string | number, string>();
    return {
        zone,
        format(time) {
            const key = typeof time === 'number' ? time : dayString(time);
            const existing = cached.get(key);
            if (existing !== undefined) return existing;
            if (typeof time !== 'number') return key as string;
            const parts = Object.fromEntries(full.formatToParts(time * 1000).map(part => [part.type, part.value]));
            const formatted = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} · ${zone}`;
            cached.set(key, formatted);
            if (cached.size > 64) cached.delete(cached.keys().next().value!);
            return formatted;
        },
        ticks(time, type) {
            if (typeof time === 'number') return ticks[type]!.format(time * 1000);
            // BusinessDay 代表交易日期，不给日期本身施加时区偏移。
            if (type > TickMarkType.DayOfMonth) return dayString(time);
            return dateTicks[type]!.format(Date.parse(`${dayString(time)}T00:00:00Z`));
        },
    };
}
