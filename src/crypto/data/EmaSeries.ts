import type { OhlcvRow } from './ohlcv';
export interface EmaPoint { time: number; value: number }
interface Accumulator { count: number; sum: number; value: number | null }
const empty = (): Accumulator => ({ count: 0, sum: 0, value: null });

/** 保存末根之前的状态；重叠尾根每次重新计算，不重复递推同一根。 */
export class EmaSeries {
    points: EmaPoint[] = [];
    private beforeTail = empty();
    private tailTime: number | null = null;
    constructor(readonly period: number, rows: OhlcvRow[] = []) {
        if (!Number.isInteger(period) || period < 1 || period > 100000) throw new Error('EMA 周期无效');
        this.seed(rows);
    }
    private advance(state: Accumulator, close: number): Accumulator {
        const count = state.count + 1;
        if (state.value === null) {
            const sum = state.sum + close;
            return { count, sum, value: count === this.period ? sum / this.period : null };
        }
        const alpha = 2 / (this.period + 1);
        return { count, sum: state.sum, value: alpha * close + (1 - alpha) * state.value };
    }
    seed(rows: OhlcvRow[]) {
        this.points = [];
        this.tailTime = null;
        this.beforeTail = empty();
        let state = empty();
        for (const row of rows) {
            this.beforeTail = state;
            state = this.advance(state, row[4]);
            if (state.value !== null) this.points.push({ time: row[0], value: state.value });
            this.tailTime = row[0];
        }
    }
    update(rows: OhlcvRow[]): EmaPoint[] {
        if (!rows.length) return [];
        if (this.tailTime !== null && rows[0]![0] !== this.tailTime) throw new Error('EMA 增量缺少末根重叠');
        let state = this.beforeTail;
        const delta: EmaPoint[] = [];
        for (const row of rows) {
            this.beforeTail = state;
            state = this.advance(state, row[4]);
            if (state.value !== null) {
                const point = { time: row[0], value: state.value };
                if (this.points.at(-1)?.time === row[0]) this.points[this.points.length - 1] = point;
                else this.points.push(point);
                delta.push(point);
            }
            this.tailTime = row[0];
        }
        return delta;
    }
    trim(firstTime: number) {
        const first = this.points.findIndex(p => p.time >= firstTime);
        this.points = first < 0 ? [] : this.points.slice(first);
    }
}
