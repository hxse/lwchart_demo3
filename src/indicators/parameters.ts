import { indicatorDefinition } from './definitions';
import type { IndicatorAnnotation, IndicatorParameter, IndicatorSpec } from './types';

export const MAX_INDICATORS_PER_LIST = 12;

function parameter(value: unknown, definition: IndicatorParameter, fromString: boolean) {
    let numeric = value;
    if (fromString) {
        const pattern = definition.integer ? /^[1-9]\d*$/ : /^(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/;
        if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${definition.label} 格式无效`);
        numeric = Number(value);
    }
    if (typeof numeric !== 'number' || !Number.isFinite(numeric)
        || (definition.integer && !Number.isInteger(numeric))
        || (definition.integer ? numeric < definition.min : numeric <= definition.min)
        || (definition.max !== undefined && numeric > definition.max)) {
        throw new Error(`${definition.label} 必须是${definition.integer ? ` ${definition.min}..${definition.max} 的整数` : '有限正数'}`);
    }
    return numeric;
}

export function parseIndicator(input: unknown): IndicatorSpec {
    const fields = typeof input === 'string' ? input.split(',') : undefined;
    if (!fields && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('指标必须是参数对象或紧凑写法');
    const object = input as Record<string, unknown>;
    const type = fields ? fields[0] : object.type;
    if (typeof type !== 'string') throw new Error('指标类型必须是字符串');
    const definition = indicatorDefinition(type);
    const names = ['type', ...definition.parameters.map(p => p.name)];
    if (fields ? fields.length !== names.length : Object.keys(object).some(key => !names.includes(key))) {
        throw new Error('指标参数数量不正确或含未知字段');
    }
    const result: Record<string, string | number> = { type };
    definition.parameters.forEach((p, index) => { result[p.name] = parameter(fields ? fields[index + 1] : object[p.name], p, !!fields); });
    if (type === 'macd' && Number(result.fast) >= Number(result.slow)) throw new Error('MACD fast 必须小于 slow');
    return result as unknown as IndicatorSpec;
}

export function indicatorKey(spec: IndicatorSpec): string {
    const values = spec as unknown as Record<string, number | string>;
    return [spec.type, ...indicatorDefinition(spec.type).parameters.map(p => values[p.name])].join(',');
}
export function parseIndicatorList(input: unknown, maxItems = MAX_INDICATORS_PER_LIST): IndicatorSpec[] {
    if (input === 'none') return [];
    const values = typeof input === 'string' ? input.split(';') : input;
    if (!Array.isArray(values) || values.length > maxItems) throw new Error(`指标必须是至多 ${maxItems} 项的列表`);
    const result = values.map(parseIndicator);
    if (new Set(result.map(indicatorKey)).size !== result.length) throw new Error('相同指标配置不能重复');
    return result;
}
export function indicatorListString(indicators: readonly IndicatorSpec[]): string {
    return indicators.length ? indicators.map(indicatorKey).join(';') : 'none';
}
export function defaultIndicator(type: string): IndicatorSpec {
    const definition = indicatorDefinition(type);
    return parseIndicator(Object.fromEntries([['type', type], ...definition.parameters.map(p => [p.name, p.default])]));
}
export function marketSeriesKey(spec: IndicatorSpec, output: string): string { return `market/${indicatorKey(spec)}/${output}`; }
export function legacySeriesKey(id: string, output: string): string { return `legacy/${id}/${output}`; }

export function parseIndicatorAnnotation(input: unknown): IndicatorAnnotation {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('indicator 必须是对象');
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some(k => !['id', 'spec', 'output'].includes(k))) throw new Error('indicator 含未知字段');
    if (typeof value.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.id)) throw new Error('指标组 id 格式无效');
    if (!value.spec || typeof value.spec !== 'object' || Array.isArray(value.spec)) throw new Error('indicator.spec 必须是参数对象');
    const spec = parseIndicator(value.spec);
    const output = indicatorDefinition(spec.type).outputs.find(role => role.key === value.output);
    if (!output) throw new Error('未知指标输出角色');
    return { id: value.id, spec, output: output.key };
}
