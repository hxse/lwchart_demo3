import { expect, test } from 'bun:test';
import { ChartDataProcessor } from '../../src/pages/ChartDashboard/logic/ChartDataProcessor';
import { buildPositionArrowSeries } from '../../src/pages/ChartDashboard/logic/PositionMarkerBuilder';
import { buildSlTpLines } from '../../src/pages/ChartDashboard/logic/SlTpLineBuilder';
import { legacyZip, legacyConfig, legacyRows } from '../fixtures/legacy';

test('原 ZIP 配置、CSV、Parquet 与时间转换继续可用', async () => {
    const bytes = await legacyZip();
    const parsed = await ChartDataProcessor.processZipBlob(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    expect(parsed.config).toEqual(legacyConfig);
    const candles = parsed.files.find(f => f.filename === 'candles.json')!;
    expect(candles.data).toHaveLength(200);
    expect(candles.data[0].time).toBe(legacyRows[0]!.time / 1000);
    const parquet = parsed.files.find(f => f.filename.endsWith('.parquet'))!;
    expect(parquet.type).toBe('parquet');
    expect(parquet.data).toHaveLength(8);
    expect(parquet.data.map((r: { id: number }) => r.id).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const backtest = parsed.files.find(f => f.filename === 'backtest_result.csv')!;
    expect(backtest.data[0].entry_short_price).toBeNull();
    const arrows = buildPositionArrowSeries(backtest.data, 0, candles.data)!;
    expect(arrows.type).toBe('PositionArrow');
    expect(arrows.data.map((p: any) => p.points.length)).toEqual([2, 2]);
    expect(arrows.data[0].points).toMatchObject([{ direction: 'entry', isLong: true, value: 103 }, { direction: 'exit', isLong: true, value: 106 }]);
    const lines = buildSlTpLines(backtest.data, 0);
    expect(lines.map(l => l.name)).toEqual(['L-SL-PCT', 'L-TP-PCT']);
    expect(lines[0]!.data[0]).toMatchObject({ value: 98, isSinglePoint: true, isBreak: true });
});
