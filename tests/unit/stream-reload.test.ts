import { expect, test, spyOn } from 'bun:test';
import { MarketStream } from '../../src/crypto/data/MarketStream';
import { candle, identity, result } from '../fixtures/data';
import { parseIndicator } from '../../src/indicators/parameters';
import type { OhlcvRow } from '../../src/crypto/data/ohlcv';

test('缺旧末根但历史仍重叠，直接获取完整数量；历史差异警告含身份和字段', async () => {
    let rows = Array.from({ length: 5 }, (_, i) => candle(i));
    const limits: number[] = [];
    let latest: OhlcvRow[] | undefined;
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const stream = new MarketStream(identity, { async latest(_id, limit) { limits.push(limit); return result(limit === 5 ? latest! : rows); } }, 20);
    stream.store.setIndicators([parseIndicator('ema,3')]);
    try {
        await stream.poll();
        latest = [rows[2]!,rows[3]!,candle(5)]; rows = [...rows,candle(5)];
        await stream.poll();
        expect(limits).toEqual([20,5,20]); expect(stream.store.rows).toEqual(rows);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![1]).toMatchObject({ reason: 'missing-tail', source: 'ccxt', symbol: identity.symbol, oldTail: candle(4)[0] });
        latest = [candle(3,111),rows[4]!,rows[5]!]; rows = [rows[0]!,rows[1]!,rows[2]!,candle(3,111),rows[4]!,rows[5]!];
        await stream.poll();
        expect(limits).toEqual([20,5,20,5,20]);
        expect(warn.mock.calls[1]![1]).toMatchObject({ reason: 'history-mismatch', timeframe: identity.timeframe, time: candle(3)[0] });
        expect(JSON.stringify(warn.mock.calls[1])).toContain('close');
        expect(stream.store.rows).toEqual(rows);
    } finally { stream.dispose(); warn.mockRestore(); }
});

test('计算错误原子保留旧快照并停止自动取数，移除失败实例才恢复', async () => {
    let rows = [candle(0),candle(1)];
    const limits: number[] = [];
    const stream = new MarketStream(identity, { async latest(_id, limit) { limits.push(limit); return result(rows); } }, 20);
    stream.store.setIndicators([parseIndicator('sma,2')]);
    try {
        await stream.poll(); const old = stream.store.snapshot();
        const huge = (index: number): OhlcvRow => [candle(index)[0],1e308,1e308,1e308,1e308,10];
        rows = [rows[0]!,huge(1),huge(2)]; await stream.poll();
        expect(stream.status.phase).toBe('error'); expect(stream.status.message).toContain('自动更新已暂停');
        expect(stream.store.snapshot()).toEqual(old);
        await stream.poll(); await stream.poll(); expect(limits).toEqual([20,5]);
        rows = [candle(0),candle(1),candle(2)]; stream.configure([],60); await stream.poll();
        expect(limits).toEqual([20,5,5]); expect(stream.status.phase).toBe('ready'); expect(stream.store.rows).toEqual(rows);
    } finally { stream.dispose(); }
});
