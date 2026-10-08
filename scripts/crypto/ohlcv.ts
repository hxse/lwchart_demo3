import { record, onlyKeys } from '../../src/crypto/options';
import { validateRows, type CandleBatch } from '../../src/crypto/data/ohlcv';

export function ccxtBatch(input: unknown, limit: number): CandleBatch {
    const value = record(input, 'CCXT 响应');
    onlyKeys(value, ['rows', 'last_bar_completion_confirmed'], 'CCXT 响应');
    const rows = validateRows(value.rows, limit);
    if (rows.some(row => row[0] < 1e12)) throw new Error('CCXT 时间必须是 13 位 UTC 毫秒');
    if (rows.length ? typeof value.last_bar_completion_confirmed !== 'boolean' : value.last_bar_completion_confirmed !== null) {
        throw new Error('CCXT 完成状态无效');
    }
    return { rows };
}
export function parseTqJson(text: string): unknown {
    // JSON source token 避免先把纳秒整数转换成不安全的浮点数。
    return JSON.parse(text, (key: string, value: unknown, context?: { source: string }) => {
        if (key === 'datetime' && typeof value === 'number') {
            if (!context?.source) throw new Error('缺少精确时间 token');
            return BigInt(context.source);
        }
        return value;
    });
}
export function tqBatch(input: unknown, limit: number): CandleBatch {
    if (!Array.isArray(input) || input.length > limit) throw new Error('TQ 行情数量无效');
    const rows = input.map(raw => {
        const value = record(raw, 'TQ 行情');
        const time = value.datetime;
        if (typeof time !== 'bigint' || time <= 0n || time % 1000000n !== 0n || time / 1000000n > 9999999999999n) {
            throw new Error('TQ 纳秒时间无法无损转换为 UTC 毫秒');
        }
        return [Number(time / 1000000n), value.open, value.high, value.low, value.close, value.volume];
    });
    return { rows: validateRows(rows, limit) };
}
