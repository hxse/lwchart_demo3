import { UPDATE_BARS, MAX_COMPUTED_INDICATORS } from '../options';
import { IndicatorStream } from '../../indicators/IndicatorStream';
import { indicatorKey, indicatorListString, parseIndicatorList } from '../../indicators/parameters';
import { assertComputable } from '../../indicators/support';
import type { IndicatorInput, IndicatorOutput, IndicatorPoint, IndicatorResults, IndicatorSpec } from '../../indicators/types';
import type { OhlcvRow } from './ohlcv';

export interface DataChange { kind: 'replace' | 'update'; rows: OhlcvRow[]; indicators: Map<string, IndicatorResults> }
export interface ReloadRequired {
    kind: 'reload'; reason: 'missing-tail' | 'history-mismatch' | 'history-insertion'; oldTail?: number; time?: number;
    differences?: Array<{ field: string; oldValue: number; newValue: number }>;
}
const columns = ['time','open','high','low','close','volume'];
const copy = (row: OhlcvRow): OhlcvRow => [...row];
const input = (row: OhlcvRow): IndicatorInput => ({ time: row[0], high: row[2], low: row[3], close: row[4] });
const equal = (a: OhlcvRow, b: OhlcvRow) => a.every((value, index) => Object.is(value, b[index]));

/** 行情和展示结果统一提交；原生实例只负责当前末根与新根。 */
export class CandleStore {
    rows: OhlcvRow[] = [];
    indicators = new Map<string, IndicatorResults>();
    private engines = new Map<string, IndicatorStream>();
    private recent = new Map<number, OhlcvRow>();
    private configuration = 'none';
    private broken = false;
    constructor(readonly capacity: number) {}
    get tail() { return this.rows.at(-1)?.[0]; }
    snapshot(): DataChange { return { kind: 'replace', rows: this.rows, indicators: this.indicators }; }
    setIndicators(indicators: readonly IndicatorSpec[]): boolean {
        const specs = parseIndicatorList(indicators,MAX_COMPUTED_INDICATORS);
        specs.forEach(assertComputable);
        const key = indicatorListString(specs);
        if (key === this.configuration) return false;
        const next = new Map<string, IndicatorStream>();
        for (const spec of specs) {
            const id = indicatorKey(spec);
            next.set(id, !this.broken && this.engines.has(id) ? this.engines.get(id)! : new IndicatorStream(spec, this.rows.map(input)));
        }
        this.engines = next; this.configuration = key; this.broken = false;
        this.commitResults();
        return true;
    }
    initialize(rows: OhlcvRow[]): DataChange {
        const next = rows.map(copy);
        const engines = new Map<string, IndicatorStream>();
        for (const [key, engine] of this.engines) engines.set(key, new IndicatorStream(engine.spec, next.map(input)));
        this.rows = next.slice(-this.capacity);
        if (this.rows.length) for (const engine of engines.values()) engine.trim(this.rows[0]![0]);
        this.engines = engines; this.broken = false;
        this.recent = new Map(next.slice(-UPDATE_BARS).map(row => [row[0], row]));
        this.commitResults();
        return this.snapshot();
    }
    private commitResults() { this.indicators = new Map([...this.engines].map(([key, engine]) => [key, engine.snapshot()])); }
    merge(rows: OhlcvRow[]): DataChange | ReloadRequired {
        const tail = this.tail;
        if (tail === undefined || !rows.some(row => row[0] === tail)) return { kind: 'reload', reason: 'missing-tail', oldTail: tail };
        if (this.broken) throw new Error('指标状态已失效，需要重新初始化');
        const known = new Map([...this.rows, ...this.recent.values()].map(row => [row[0], row]));
        const first = Math.min(...known.keys());
        // 完整历史校验先于任何原生状态更新，旧末根允许变化。
        for (const row of rows) {
            if (row[0] >= tail || row[0] < first) continue;
            const old = known.get(row[0]);
            if (!old) return { kind: 'reload', reason: 'history-insertion', oldTail: tail, time: row[0] };
            if (!equal(old, row)) return { kind: 'reload', reason: 'history-mismatch', oldTail: tail, time: row[0],
                differences: columns.flatMap((field, index) => Object.is(old[index], row[index]) ? []
                    : [{ field, oldValue: old[index]!, newValue: row[index]! }]) };
        }
        const oldTail = this.rows.at(-1)!;
        const replacement = rows.find(row => row[0] === tail)!;
        const changes = [...(!equal(oldTail, replacement) ? [replacement] : []), ...rows.filter(row => row[0] > tail)].map(copy);
        const delta = new Map<string, IndicatorResults>();
        try {
            for (const row of changes) for (const [key, engine] of this.engines) {
                const points = row[0] === tail ? engine.replace(input(row)) : engine.add(input(row));
                if (!points.size) continue;
                const outputs = delta.get(key)?.outputs ?? new Map<IndicatorOutput, IndicatorPoint[]>();
                for (const [role, values] of points) outputs.set(role, (outputs.get(role) ?? []).concat(values));
                delta.set(key, { spec: engine.spec, outputs });
            }
        } catch (error) { this.broken = true; throw error; }
        const next = [...this.rows.slice(0, -1), copy(replacement), ...changes.filter(row => row[0] > tail)];
        const trimmed = next.length > this.capacity;
        this.rows = next.slice(-this.capacity);
        this.recent = new Map([...new Map([...this.recent.values(), ...rows.map(copy)].map(row => [row[0], row])).values()]
            .sort((a, b) => a[0] - b[0]).slice(-UPDATE_BARS).map(row => [row[0], row]));
        if (trimmed) for (const engine of this.engines.values()) engine.trim(this.rows[0]![0]);
        this.commitResults();
        return trimmed ? this.snapshot() : { kind: 'update', rows: changes, indicators: delta };
    }
}
