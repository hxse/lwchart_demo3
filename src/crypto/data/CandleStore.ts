import type { IndicatorSpec } from '../options';
import { EmaSeries, type EmaPoint } from './EmaSeries';
import type { OhlcvRow } from './ohlcv';

export interface DataChange { kind: 'replace' | 'update'; rows: OhlcvRow[]; emas: Map<number, EmaPoint[]> }

export class CandleStore {
    rows: OhlcvRow[] = [];
    readonly emas = new Map<number, EmaSeries>();
    constructor(readonly capacity: number) {}
    get tail() { return this.rows.at(-1)?.[0]; }
    snapshot(): DataChange {
        return { kind: 'replace', rows: this.rows, emas: new Map([...this.emas].map(([p, e]) => [p, [...e.points]])) };
    }
    setIndicators(indicators: IndicatorSpec[]) {
        const periods = new Set(indicators.map(i => i.period));
        for (const period of this.emas.keys()) if (!periods.has(period)) this.emas.delete(period);
        for (const period of periods) if (!this.emas.has(period)) this.emas.set(period, new EmaSeries(period, this.rows));
    }
    initialize(rows: OhlcvRow[]) {
        this.rows = rows.slice(-this.capacity);
        for (const ema of this.emas.values()) ema.seed(this.rows);
        return this.snapshot();
    }
    merge(rows: OhlcvRow[]): DataChange {
        if (!rows.length || this.tail === undefined || rows[0]![0] !== this.tail) throw new Error('增量数据缺少末根重叠');
        const emas = new Map<number, EmaPoint[]>();
        for (const [period, ema] of this.emas) emas.set(period, ema.update(rows));
        const next = [...this.rows.slice(0, -1), ...rows];
        const trimmed = next.length > this.capacity;
        this.rows = next.slice(-this.capacity);
        if (trimmed) {
            for (const ema of this.emas.values()) ema.trim(this.rows[0]![0]);
            return this.snapshot();
        }
        return { kind: 'update', rows, emas };
    }
}
