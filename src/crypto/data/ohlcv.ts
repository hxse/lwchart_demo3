export type OhlcvRow = [number, number, number, number, number, number];
export interface CandleBatch { rows: OhlcvRow[] }

export function validateRows(input: unknown, limit: number): OhlcvRow[] {
    if (!Array.isArray(input) || input.length > limit) throw new Error('行情数量无效');
    let previous = -Infinity;
    return input.map((raw): OhlcvRow => {
        if (!Array.isArray(raw) || raw.length !== 6 || !raw.every(v => typeof v === 'number' && Number.isFinite(v))) {
            throw new Error('行情必须是六列有限数值');
        }
        const [time, open, high, low, close, volume] = raw as OhlcvRow;
        if (!Number.isSafeInteger(time) || time <= 0 || time > 9999999999999 || time <= previous) {
            throw new Error('行情时间必须是升序且唯一的 UTC 毫秒');
        }
        if (volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close)) throw new Error('行情价格或成交量无效');
        previous = time;
        return [time, open, high, low, close, volume];
    });
}
export function validateBatch(input: unknown, limit: number): CandleBatch {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('行情响应格式错误');
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some(key => key !== 'rows')) throw new Error('行情响应含有未知字段');
    return { rows: validateRows(value.rows, limit) };
}
