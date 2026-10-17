/** 配置与浏览器共用的纯校验，不依赖绘图库或显示格式器。 */
export function validateTimezone(value: unknown): string {
    if (typeof value !== 'string' || !value) throw new Error('显示时区不能为空');
    if (value === 'local') return value;
    try { new Intl.DateTimeFormat('en', { timeZone: value }); }
    catch { throw new Error('显示时区必须是 local、UTC 或有效的 IANA 时区'); }
    return value;
}
