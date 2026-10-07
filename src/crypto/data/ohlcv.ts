export type OhlcvRow = [number, number, number, number, number, number];
export interface OhlcvResult { rows: OhlcvRow[]; last_bar_completion_confirmed: boolean | null }

export function validateOhlcv(input: unknown, limit: number): OhlcvResult {
    if (!input || typeof input !== 'object') throw new Error('行情响应格式错误');
    const value = input as Record<string, unknown>;
    if (!Array.isArray(value.rows) || value.rows.length > limit) throw new Error('行情数量无效');
    const completion = value.last_bar_completion_confirmed;
    if (value.rows.length ? typeof completion !== 'boolean' : completion !== null) throw new Error('行情完成状态无效');
    let previous = -Infinity;
    const rows = value.rows.map((raw): OhlcvRow => {
        if (!Array.isArray(raw) || raw.length !== 6 || !raw.every(v => typeof v === 'number' && Number.isFinite(v))) {
            throw new Error('行情必须是六列有限数值');
        }
        const [time, open, high, low, close, volume] = raw as OhlcvRow;
        if (!Number.isSafeInteger(time) || time < 1e12 || time > 9999999999999 || time <= previous) {
            throw new Error('行情时间必须是升序且唯一的 UTC 毫秒');
        }
        if (volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close)) throw new Error('行情价格或成交量无效');
        previous = time;
        return [time, open, high, low, close, volume];
    });
    return { rows, last_bar_completion_confirmed: completion as boolean | null };
}
