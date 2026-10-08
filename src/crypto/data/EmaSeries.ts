import { UPDATE_BARS } from '../options';
import type { OhlcvRow } from './ohlcv';
export interface EmaPoint { time: number; value: number }
interface Accumulator { count: number; sum: number; value: number | null }
const empty = (): Accumulator => ({ count: 0, sum: 0, value: null });

/** 仅保存最近小窗口的计算检查点，历史修正不重新计算整段历史。 */
export class EmaSeries {
    points: EmaPoint[] = [];
    private checkpoints = new Map<number, Accumulator>();
    private afterTail = empty();
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
    private remember(time: number, state: Accumulator) {
        this.checkpoints.set(time, state);
        while (this.checkpoints.size > UPDATE_BARS) this.checkpoints.delete(this.checkpoints.keys().next().value!);
    }
    seed(rows: OhlcvRow[]) {
        this.points = []; this.checkpoints.clear(); this.tailTime = null;
        let state = empty();
        for (const row of rows) {
            this.remember(row[0], state);
            state = this.advance(state, row[4]);
            if (state.value !== null) this.points.push({ time: row[0], value: state.value });
            this.tailTime = row[0];
        }
        this.afterTail = state;
    }
    canUpdate(time: number) { return this.tailTime === null || time > this.tailTime || this.checkpoints.has(time); }
    update(rows: OhlcvRow[]): EmaPoint[] {
        if (!rows.length) return [];
        const first = rows[0]![0];
        if (!this.canUpdate(first)) throw new Error('EMA 修正缺少计算检查点');
        let state = this.tailTime !== null && first <= this.tailTime ? this.checkpoints.get(first)! : this.afterTail;
        this.points = this.points.filter(point => point.time < first);
        for (const time of this.checkpoints.keys()) if (time >= first) this.checkpoints.delete(time);
        const delta: EmaPoint[] = [];
        for (const row of rows) {
            this.remember(row[0], state);
            state = this.advance(state, row[4]);
            if (state.value !== null) {
                const point = { time: row[0], value: state.value };
                this.points.push(point); delta.push(point);
            }
            this.tailTime = row[0];
        }
        this.afterTail = state;
        return delta;
    }
    trim(firstTime: number) {
        const first = this.points.findIndex(point => point.time >= firstTime);
        this.points = first < 0 ? [] : this.points.slice(first);
    }
}
