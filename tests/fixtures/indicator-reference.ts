import { SMA, EMA, DEMA, TEMA, RSI, CCI, MACD, ATR, ADX, ER, BollingerBands, WSMA } from 'trading-signals';
import type { IndicatorInput, IndicatorPoint, IndicatorSpec } from '../../src/indicators/types';
import type { NativeIndicator } from '../../src/indicators/native';

/** 测试直接构造第三方类，不复用生产构造、输入转换或结果读取。 */
export function referenceNative(spec: IndicatorSpec): NativeIndicator {
    switch (spec.type) {
        case 'sma': return new SMA(spec.period);
        case 'ema': return new EMA(spec.period);
        case 'dema': return new DEMA(spec.period);
        case 'tema': return new TEMA(spec.period);
        case 'rsi': return new RSI(spec.period, WSMA);
        case 'cci': return new CCI(spec.period);
        case 'macd': return new MACD(new EMA(spec.fast), new EMA(spec.slow), new EMA(spec.signal));
        case 'atr': return new ATR(spec.period, WSMA);
        case 'adx': return new ADX(spec.period, WSMA);
        case 'er': return new ER(spec.period);
        case 'bbands': return new BollingerBands(spec.period, spec.deviation);
    }
}
const candleTypes = new Set(['cci', 'atr', 'adx', 'er']);
export function directResults(spec: IndicatorSpec, inputs: readonly IndicatorInput[]) {
    const native = referenceNative(spec);
    const roles = spec.type === 'macd' ? ['macd', 'signal', 'histogram'] : spec.type === 'bbands' ? ['lower', 'middle', 'upper'] : ['value'];
    const results = new Map<string, IndicatorPoint[]>(roles.map(role => [role, []]));
    for (const input of inputs) {
        native.add(candleTypes.has(spec.type) ? { high: input.high, low: input.low, close: input.close } : input.close);
        const stable = native.isStable;
        const raw = stable ? native.getResultOrThrow() : undefined;
        for (const role of roles) {
            const value = role === 'value' ? raw : (raw as Record<string, number> | undefined)?.[role];
            results.get(role)!.push(!stable ? { time: input.time, state: 'warmup' }
                : { time: input.time, state: typeof value === 'number' && Number.isNaN(value) ? 'undefined' : 'value', value: value as number });
        }
    }
    return results;
}
export function simulatedInputs(count: number, seed = 42): IndicatorInput[] {
    let state = seed;
    return Array.from({ length: count }, (_, index) => {
        state = (1664525 * state + 1013904223) >>> 0;
        const close = 100 + index * .23 + state / 4294967296 * 10;
        return { time: Date.UTC(2026, 0, 1) + index * 60000 + (index >= 40 ? 3600000 : 0), high: close + 1.7, low: close - 1.3, close };
    });
}
