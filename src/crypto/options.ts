import { GridTemplateType, gridTemplates } from '../components/grid-template/gridTemplates';
import { validateTimezone } from './time';

export const TIMEFRAMES = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w'] as const;
export const LAYOUTS = {
    '1x1': GridTemplateType.SINGLE,
    '1x2': GridTemplateType.HORIZONTAL_1x1,
    '2x1': GridTemplateType.VERTICAL_1x1,
    '1x3': GridTemplateType.HORIZONTAL_1x1x1,
    '3x1': GridTemplateType.VERTICAL_1x1x1,
    '2x2': GridTemplateType.GRID_2x2,
} as const;
export const EMA_COLORS = ['#FF9800', '#4CAF50', '#2196F3'];
export const MAX_HISTORY_BARS = 10000;
export const UPDATE_BARS = 5;
export type Timeframe = typeof TIMEFRAMES[number];
export type Layout = keyof typeof LAYOUTS;
export type Theme = 'dark' | 'light';
export type Source = 'ccxt' | 'tq';
export interface IndicatorSpec { type: 'ema'; period: number }
export interface CcxtDefaults { exchange_name: 'binance' | 'kraken'; market: 'future' | 'spot'; is_live: boolean; symbol: string }
export interface TqDefaults { symbol: string }
interface DisplayOptions {
    symbol: string; layout: Layout; timeframes: Timeframe[]; indicators: IndicatorSpec[];
    refresh_seconds: number; history_bars: number; theme: Theme; timezone: string;
}
export interface CcxtOptions extends DisplayOptions, CcxtDefaults { source: 'ccxt' }
export interface TqOptions extends DisplayOptions { source: 'tq' }
export type DashboardOptions = CcxtOptions | TqOptions;
export interface SourceDefaults { ccxt: CcxtDefaults; tq: TqDefaults }
export interface RuntimeOptions { defaults: DashboardOptions; sources: SourceDefaults }
export const COMMON_KEYS = ['source','symbol','layout','timeframes','indicators','refresh_seconds','history_bars','theme','timezone'] as const;
export const CCXT_KEYS = ['exchange_name','market','is_live'] as const;
export const DASHBOARD_KEYS = COMMON_KEYS.filter(key => key !== 'symbol');
export function optionKeys(source: Source) { return source === 'ccxt' ? [...COMMON_KEYS, ...CCXT_KEYS] : [...COMMON_KEYS]; }

export function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是表`);
    return value as Record<string, unknown>;
}
export function onlyKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
    if (Object.keys(value).some(k => !keys.includes(k))) throw new Error(`${label} 含有未知字段`);
}
export function integer(value: unknown, min: number, max: number, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${label} 必须是 ${min}..${max} 的整数`);
    }
    return value;
}
export function parseInteger(value: string, min: number, max: number, label: string) {
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label} 必须是正整数`);
    return integer(Number(value), min, max, label);
}
export function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空`);
    return value;
}
export function symbol(value: unknown): string {
    const result = text(value, '品种');
    if (result.length > 128 || /[\u0000-\u001f]/.test(result)) throw new Error('品种格式无效');
    return result;
}
export function normalizeCcxt(input: unknown): CcxtDefaults {
    const value = record(input, 'CCXT 身份');
    onlyKeys(value, [...CCXT_KEYS, 'symbol'], 'CCXT 身份');
    if (typeof value.exchange_name !== 'string' || !['binance', 'kraken'].includes(value.exchange_name)) throw new Error('交易所必须是 binance 或 kraken');
    if (typeof value.market !== 'string' || !['future', 'spot'].includes(value.market)) throw new Error('市场必须是 future 或 spot');
    if (typeof value.is_live !== 'boolean') throw new Error('is_live 必须是 true 或 false');
    return { exchange_name: value.exchange_name as CcxtDefaults['exchange_name'], market: value.market as CcxtDefaults['market'],
        is_live: value.is_live, symbol: symbol(value.symbol) };
}
export function normalizeSources(input: unknown): SourceDefaults {
    const value = record(input, '数据源默认身份');
    onlyKeys(value, ['ccxt', 'tq'], '数据源默认身份');
    const tq = record(value.tq, 'TQ 身份');
    onlyKeys(tq, ['symbol'], 'TQ 身份');
    return { ccxt: normalizeCcxt(value.ccxt), tq: { symbol: symbol(tq.symbol) } };
}
export function parseIndicators(input: unknown): IndicatorSpec[] {
    if (input === 'none') return [];
    const values = typeof input === 'string' ? input.split(';') : input;
    if (!Array.isArray(values) || values.length > 12) throw new Error('指标必须是至多 12 项的 EMA 列表');
    const result = values.map((item): IndicatorSpec => {
        if (typeof item === 'string') {
            const fields = item.split(',');
            if (fields.length !== 2 || fields[0] !== 'ema') throw new Error('指标写法必须是 ema,周期');
            return { type: 'ema', period: parseInteger(fields[1]!, 1, 100000, 'EMA 周期') };
        }
        const value = record(item, '指标');
        onlyKeys(value, ['type', 'period'], '指标');
        if (value.type !== 'ema') throw new Error('目前仅支持 EMA 指标');
        return { type: 'ema', period: integer(value.period, 1, 100000, 'EMA 周期') };
    });
    if (new Set(result.map(i => i.period)).size !== result.length) throw new Error('EMA 周期不能重复');
    return result;
}
export function indicatorString(indicators: IndicatorSpec[]) {
    return indicators.length ? indicators.map(i => `ema,${i.period}`).join(';') : 'none';
}
export function layoutSlots(layout: Layout) { return gridTemplates[LAYOUTS[layout]].slots; }
export function normalizeOptions(input: unknown): DashboardOptions {
    const value = record(input, '看盘配置');
    if (value.source !== 'ccxt' && value.source !== 'tq') throw new Error('数据源必须是 ccxt 或 tq');
    onlyKeys(value, optionKeys(value.source), '看盘配置');
    if (value.theme !== 'dark' && value.theme !== 'light') throw new Error('主题必须是 dark 或 light');
    if (typeof value.layout !== 'string' || !Object.hasOwn(LAYOUTS, value.layout)) throw new Error('未知图表布局');
    const layout = value.layout as Layout;
    if (!Array.isArray(value.timeframes) || value.timeframes.length !== layoutSlots(layout)
        || value.timeframes.some(t => !TIMEFRAMES.includes(t))) throw new Error('周期列表必须匹配布局，且周期受支持');
    const display: DisplayOptions = { symbol: symbol(value.symbol), layout, timeframes: [...value.timeframes], indicators: parseIndicators(value.indicators),
        refresh_seconds: integer(value.refresh_seconds, 1, 3600, '更新间隔'),
        history_bars: integer(value.history_bars, 1, MAX_HISTORY_BARS, '历史 K 线数量'), theme: value.theme, timezone: validateTimezone(value.timezone) };
    if (value.source === 'tq') return { ...display, source: 'tq' };
    const identity = normalizeCcxt(Object.fromEntries([...CCXT_KEYS, 'symbol'].map(key => [key, value[key]])));
    return { ...display, ...identity, source: 'ccxt' };
}
export function changeSource(options: DashboardOptions, source: Source, sources: SourceDefaults): DashboardOptions {
    return { ...Object.fromEntries(COMMON_KEYS.map(key => [key, options[key]])), ...sources[source], source } as DashboardOptions;
}
export function normalizeRuntime(input: unknown): RuntimeOptions {
    const value = record(input, '运行配置');
    onlyKeys(value, ['defaults', 'sources'], '运行配置');
    return { defaults: normalizeOptions(value.defaults), sources: normalizeSources(value.sources) };
}
