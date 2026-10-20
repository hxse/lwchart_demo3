export type TqSeries = 'main' | 'index';
export type ChartTqSeries = Record<string, TqSeries>;

export function parseChartTqSeries(input: unknown, slots: number): ChartTqSeries {
    if (input === undefined) return {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('窗口 TQ 品种形式必须是对象');
    return Object.fromEntries(Object.entries(input).map(([key, value]) => {
        if (!/^[1-9]\d*$/.test(key) || Number(key) > slots) throw new Error('窗口 TQ 品种形式编号必须在当前布局范围内');
        if (value !== 'main' && value !== 'index') throw new Error(`窗口 ${key} TQ 品种形式必须是 main 或 index`);
        return [key, value];
    }));
}
export function trimChartTqSeries(overrides: ChartTqSeries, slots: number): ChartTqSeries {
    return Object.fromEntries(Object.entries(overrides).filter(([key]) => Number(key) <= slots));
}
export function isTqContinuousSymbol(symbol: string): boolean {
    return /^KQ\.[mi]@/.test(symbol);
}
/** 仅替换连续合约前缀，具体合约及后缀原样保留。 */
export function tqChartSymbol(symbol: string, series?: TqSeries): string {
    if (!series) return symbol;
    return symbol.replace(/^KQ\.[mi]@/, series === 'main' ? 'KQ.m@' : 'KQ.i@');
}
