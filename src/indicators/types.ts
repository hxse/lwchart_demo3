export type PeriodIndicatorType = 'sma' | 'ema' | 'dema' | 'tema' | 'rsi' | 'cci' | 'atr' | 'adx' | 'er';
export type IndicatorType = PeriodIndicatorType | 'macd' | 'bbands';
export type IndicatorSpec =
    | { [K in PeriodIndicatorType]: { type: K; period: number } }[PeriodIndicatorType]
    | { type: 'macd'; fast: number; slow: number; signal: number }
    | { type: 'bbands'; period: number; deviation: number };
export type IndicatorOutput = 'value' | 'macd' | 'signal' | 'histogram' | 'lower' | 'middle' | 'upper';
export type IndicatorTheme = 'dark' | 'light';
export type IndicatorFormat = 'price' | 'number' | 'ratio';
export interface IndicatorParameter {
    name: 'period' | 'fast' | 'slow' | 'signal' | 'deviation';
    label: string;
    default: number;
    min: number;
    max?: number;
    integer: boolean;
}
export interface IndicatorOutputDefinition {
    key: IndicatorOutput;
    primitive: 'Line' | 'Histogram';
    color: 'primary' | 'secondary' | 'lower' | 'upper';
    label: string;
}
export interface IndicatorDefinition {
    type: IndicatorType;
    title: string;
    parameters: readonly IndicatorParameter[];
    native: {
        constructor: string;
        input: 'close' | 'hlc';
        smoothing?: 'WSMA';
        movingAverage?: 'EMA';
        availability: 'root-stable';
        allowNaN: boolean;
    };
    outputs: readonly IndicatorOutputDefinition[];
    display: {
        placement: 'main' | 'pane';
        format: IndicatorFormat;
        autoscale: 'include' | 'candles';
        references: readonly number[];
        paneWeight: number;
        visible: boolean;
        legend: boolean;
        histogramColors?: 'momentum';
    };
}
export interface IndicatorAnnotation {
    id: string;
    spec: IndicatorSpec;
    output: IndicatorOutput;
}

export interface IndicatorPoint {
    time: number;
    state: 'warmup' | 'value' | 'undefined';
    value?: number;
}
export interface IndicatorResults {
    spec: IndicatorSpec;
    outputs: Map<IndicatorOutput, IndicatorPoint[]>;
}
export interface IndicatorInput { time: number; high: number; low: number; close: number }
