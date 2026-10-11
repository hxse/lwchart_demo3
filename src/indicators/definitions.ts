import type { IndicatorDefinition, IndicatorParameter, IndicatorType } from './types';

const period = (title: string, value: number, min = 1): IndicatorParameter =>
    ({ name: 'period', label: `${title} 周期`, default: value, min, max: 100000, integer: true });
const scalar = (type: IndicatorType, title: string, value: number, options: {
    min?: number; input?: 'close' | 'hlc'; placement?: 'main' | 'pane';
    format?: 'price' | 'number' | 'ratio'; references?: number[]; smoothing?: 'WSMA'; allowNaN?: boolean;
} = {}): IndicatorDefinition => ({
    type, title, parameters: [period(title, value, options.min)],
    native: { constructor: type.toUpperCase(), input: options.input ?? 'close', smoothing: options.smoothing,
        availability: 'root-stable', allowNaN: options.allowNaN ?? false },
    outputs: [{ key: 'value', primitive: 'Line', color: 'primary', label: '' }],
    display: { placement: options.placement ?? 'main', format: options.format ?? 'price',
        autoscale: options.placement === 'pane' ? 'include' : 'candles', references: options.references ?? [],
        paneWeight: 1, visible: true, legend: true },
});
const macdParameter = (name: 'fast' | 'slow' | 'signal', value: number): IndicatorParameter =>
    ({ name, label: `MACD ${name}`, default: value, min: 1, max: 100000, integer: true });

/** 参数、原生调用口径与显示知识只在此定义。计算能力在计算阶段独立准入。 */
export const indicatorDefinitions: Record<IndicatorType, IndicatorDefinition> = {
    sma: scalar('sma', 'SMA', 20),
    ema: scalar('ema', 'EMA', 14),
    dema: scalar('dema', 'DEMA', 20),
    tema: scalar('tema', 'TEMA', 20),
    rsi: scalar('rsi', 'RSI', 14, { min: 2, placement: 'pane', format: 'number', smoothing: 'WSMA', references: [30, 50, 70] }),
    cci: scalar('cci', 'CCI', 20, { min: 2, input: 'hlc', placement: 'pane', format: 'number', references: [-100, 0, 100], allowNaN: true }),
    macd: {
        type: 'macd', title: 'MACD', parameters: [macdParameter('fast', 12), macdParameter('slow', 26), macdParameter('signal', 9)],
        native: { constructor: 'MACD', input: 'close', movingAverage: 'EMA', availability: 'root-stable', allowNaN: false },
        outputs: [
            { key: 'macd', primitive: 'Line', color: 'primary', label: 'MACD' },
            { key: 'signal', primitive: 'Line', color: 'secondary', label: 'Signal' },
            { key: 'histogram', primitive: 'Histogram', color: 'primary', label: 'Histogram' },
        ],
        display: { placement: 'pane', format: 'price', autoscale: 'include', references: [0], paneWeight: 1,
            visible: true, legend: true, histogramColors: 'momentum' },
    },
    atr: scalar('atr', 'ATR', 14, { input: 'hlc', placement: 'pane', smoothing: 'WSMA' }),
    adx: scalar('adx', 'ADX', 14, { min: 2, input: 'hlc', placement: 'pane', format: 'number', smoothing: 'WSMA', references: [25] }),
    er: scalar('er', 'ER（区间效率）', 10, { min: 2, input: 'hlc', placement: 'pane', format: 'ratio', references: [0, .5, 1] }),
    bbands: {
        type: 'bbands', title: 'BBANDS',
        parameters: [period('BBANDS', 20, 2), { name: 'deviation', label: '布林带倍数', default: 2, min: 0, integer: false }],
        native: { constructor: 'BollingerBands', input: 'close', availability: 'root-stable', allowNaN: false },
        outputs: [
            { key: 'lower', primitive: 'Line', color: 'lower', label: 'Lower' },
            { key: 'middle', primitive: 'Line', color: 'primary', label: 'Middle' },
            { key: 'upper', primitive: 'Line', color: 'upper', label: 'Upper' },
        ],
        display: { placement: 'main', format: 'price', autoscale: 'include', references: [], paneWeight: 1, visible: true, legend: true },
    },
};

export function indicatorDefinition(type: string): IndicatorDefinition {
    if (!Object.hasOwn(indicatorDefinitions, type)) throw new Error('未知指标类型');
    return indicatorDefinitions[type as IndicatorType];
}
