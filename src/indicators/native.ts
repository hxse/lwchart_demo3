import { SMA, EMA, DEMA, TEMA, RSI, CCI, MACD, ATR, ADX, ER, BollingerBands, WSMA } from 'trading-signals';
import { indicatorDefinition } from './definitions';
import type { IndicatorInput, IndicatorSpec } from './types';

export interface NativeIndicator {
    readonly isStable: boolean;
    add(input: number | { high: number; low: number; close: number }): unknown;
    replace(input: number | { high: number; low: number; close: number }): unknown;
    getResultOrThrow(): unknown;
}
const constructors = { SMA, EMA, DEMA, TEMA, RSI, CCI, MACD, ATR, ADX, ER, BollingerBands };

/** 根据唯一构造配方绑定原生类；不实现任何指标公式。 */
export function createNativeIndicator(spec: IndicatorSpec): NativeIndicator {
    const definition = indicatorDefinition(spec.type);
    const values = spec as unknown as Record<string, number>;
    const parameters = definition.parameters.map(p => values[p.name]);
    const args = definition.native.movingAverage ? parameters.map(p => new EMA(p))
        : definition.native.smoothing ? [parameters[0], WSMA] : parameters;
    const constructor = constructors[definition.native.constructor as keyof typeof constructors];
    if (!constructor) throw new Error('指标原生构造未绑定');
    return Reflect.construct(constructor, args) as NativeIndicator;
}
export function nativeInput(spec: IndicatorSpec, input: IndicatorInput) {
    return indicatorDefinition(spec.type).native.input === 'close' ? input.close
        : { high: input.high, low: input.low, close: input.close };
}
export function sameIndicatorInput(spec: IndicatorSpec, a: IndicatorInput, b: IndicatorInput): boolean {
    return Object.is(a.close, b.close) && (indicatorDefinition(spec.type).native.input === 'close'
        || (Object.is(a.high, b.high) && Object.is(a.low, b.low)));
}
