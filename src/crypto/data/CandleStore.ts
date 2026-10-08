import type { IndicatorSpec } from '../options';
import { EmaSeries, type EmaPoint } from './EmaSeries';
import type { OhlcvRow } from './ohlcv';

export interface DataChange { kind: 'replace' | 'update'; rows: OhlcvRow[]; emas: Map<number, EmaPoint[]> }
export class CandleStore {
    rows: OhlcvRow[] = [];
    readonly emas = new Map<number, EmaSeries>();
    private indexes = new Map<number, number>();
    constructor(readonly capacity: number) {}
    get tail() { return this.rows.at(-1)?.[0]; }
    private index() { this.indexes = new Map(this.rows.map((row, index) => [row[0], index])); }
    snapshot(): DataChange {
        return { kind: 'replace', rows: this.rows, emas: new Map([...this.emas].map(([p, e]) => [p, [...e.points]])) };
    }
    setIndicators(indicators: IndicatorSpec[]) {
        const periods = new Set(indicators.map(indicator => indicator.period));
        for (const period of this.emas.keys()) if (!periods.has(period)) this.emas.delete(period);
        for (const period of periods) if (!this.emas.has(period)) this.emas.set(period, new EmaSeries(period, this.rows));
    }
    initialize(rows: OhlcvRow[]) {
        this.rows = rows.slice(-this.capacity); this.index();
        for (const ema of this.emas.values()) ema.seed(this.rows);
        return this.snapshot();
    }
    merge(rows: OhlcvRow[]): DataChange | null {
        if (!rows.length || this.tail === undefined || !rows.some(row => this.indexes.has(row[0]))) return null;
        if (rows.at(-1)![0] < this.tail) throw new Error('返回的最新时间早于已有行情，保留当前窗口');
        const first = this.rows[0]![0];
        const tail = this.tail;
        const next = [...this.rows];
        const changes: OhlcvRow[] = [];
        let emaStart = Infinity;
        for (const row of rows) {
            if (row[0] < first) continue;
            const index = this.indexes.get(row[0]);
            if (index === undefined) {
                // SDK 不能增量插入此前不存在的历史点，改为重载完整窗口。
                if (row[0] <= tail) return null;
                next.push(row); changes.push(row); emaStart = Math.min(emaStart, next.length - 1);
            } else if (!next[index]!.every((value, column) => value === row[column])) {
                if (next[index]![4] !== row[4]) emaStart = Math.min(emaStart, index);
                next[index] = row; changes.push(row);
            }
        }
        const recalculation = Number.isFinite(emaStart) ? next.slice(emaStart) : [];
        if (recalculation.length && [...this.emas.values()].some(ema => !ema.canUpdate(recalculation[0]![0]))) return null;
        const emas = new Map<number, EmaPoint[]>();
        if (recalculation.length) for (const [period, ema] of this.emas) emas.set(period, ema.update(recalculation));
        const trimmed = next.length > this.capacity;
        this.rows = next.slice(-this.capacity);
        if (next.length !== this.indexes.size || trimmed) this.index();
        if (trimmed) {
            for (const ema of this.emas.values()) ema.trim(this.rows[0]![0]);
            return this.snapshot();
        }
        return { kind: 'update', rows: changes, emas };
    }
}
