import { indicatorDefinition } from './definitions';
import { parseIndicator, indicatorKey } from './parameters';
import { createNativeIndicator, nativeInput, sameIndicatorInput, type NativeIndicator } from './native';
import type { IndicatorInput, IndicatorOutput, IndicatorPoint, IndicatorResults, IndicatorSpec } from './types';

export class IndicatorCalculationError extends Error {
    constructor(readonly indicator: string, readonly time: number, readonly output: string, reason: string) {
        super(`指标 ${indicator} 在 ${time} 的 ${output} 计算失败：${reason}`);
        this.name = 'IndicatorCalculationError';
    }
}

/** 原生状态只追加或覆盖末根；显示点不可变，失败不会污染已提交快照。 */
export class IndicatorStream {
    readonly spec: IndicatorSpec;
    private native: NativeIndicator;
    private last: IndicatorInput | undefined;
    private count = 0;
    private published = new Set<IndicatorOutput>();
    private points = new Map<IndicatorOutput, IndicatorPoint[]>();
    private previous = new Map<IndicatorOutput, IndicatorPoint>();
    constructor(spec: IndicatorSpec, inputs: readonly IndicatorInput[] = []) {
        this.spec = parseIndicator(spec);
        this.native = createNativeIndicator(this.spec);
        for (const output of indicatorDefinition(this.spec.type).outputs) this.points.set(output.key, []);
        for (const input of inputs) this.add(input);
    }
    get inputCount() { return this.count; }
    snapshot(): IndicatorResults {
        for (const role of this.points.keys()) this.published.add(role);
        return { spec: this.spec, outputs: new Map(this.points), previous: new Map(this.previous) };
    }
    add(input: IndicatorInput) {
        if (this.last && input.time <= this.last.time) throw new Error('指标追加时间必须晚于末根');
        return this.update(input, false);
    }
    replace(input: IndicatorInput) {
        if (!this.last || input.time !== this.last.time) throw new Error('指标只能覆盖当前末根');
        if (sameIndicatorInput(this.spec, this.last, input)) return new Map<IndicatorOutput, IndicatorPoint[]>();
        return this.update(input, true);
    }
    private update(input: IndicatorInput, replace: boolean): Map<IndicatorOutput, IndicatorPoint[]> {
        const definition = indicatorDefinition(this.spec.type);
        const key = indicatorKey(this.spec);
        const delta = new Map<IndicatorOutput, IndicatorPoint[]>();
        try {
            if (replace && this.count === 1) {
                this.native = createNativeIndicator(this.spec);
                this.native.add(nativeInput(this.spec, input));
            } else if (replace) this.native.replace(nativeInput(this.spec, input));
            else this.native.add(nativeInput(this.spec, input));
            const stable = this.native.isStable;
            const result = stable ? this.native.getResultOrThrow() : undefined;
            for (const role of definition.outputs) {
                let point: IndicatorPoint = { time: input.time, state: 'warmup' };
                if (stable) {
                    const value = role.key === 'value' ? result : (result as Record<string, unknown> | undefined)?.[role.key];
                    if (typeof value !== 'number' || (!Number.isFinite(value) && !(definition.native.allowNaN && Number.isNaN(value)))) {
                        throw new IndicatorCalculationError(key, input.time, role.key, '原生结果不是允许的有限数值');
                    }
                    point = { time: input.time, state: Number.isNaN(value) ? 'undefined' : 'value', value };
                }
                delta.set(role.key, [point]);
            }
        } catch (error) {
            if (error instanceof IndicatorCalculationError) throw error;
            throw new IndicatorCalculationError(key, input.time, 'result', '原生更新或读取失败');
        }
        for (const [role, points] of delta) {
            let values = this.points.get(role)!;
            // 发布后的数组只复制一次；同一批中尚未发布的追加／覆盖复用该副本。
            if (this.published.delete(role)) { values = values.slice(); this.points.set(role, values); }
            if (replace) values[values.length - 1] = points[0]!;
            else values.push(...points);
        }
        this.last = { ...input };
        if (!replace) this.count++;
        return delta;
    }
    trim(firstTime: number) {
        for (const [role, points] of this.points) {
            const first = points.findIndex(point => point.time >= firstTime);
            if (first > 0) this.previous.set(role, points[first - 1]!);
            if (first !== 0) {
                this.points.set(role, first < 0 ? [] : points.slice(first));
                this.published.delete(role);
            }
        }
    }
}
