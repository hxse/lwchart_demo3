import { symbol, type DashboardSettings } from './options';

export const WATCH_PROVIDERS = ['binance', 'kraken', 'tq'] as const;
export type WatchProvider = typeof WATCH_PROVIDERS[number];
export interface WatchEntry { provider: WatchProvider; symbol: string }
export interface WatchlistState { entries: WatchEntry[]; flat: boolean }
export const MAX_URL_LENGTH = 8192;

export function watchEntry(provider: string, value: string): WatchEntry {
    const key = provider.toLowerCase();
    if (!WATCH_PROVIDERS.includes(key as WatchProvider)) throw new Error('自选来源必须是 binance、kraken 或 tq');
    return { provider: key as WatchProvider, symbol: symbol(value) };
}
export function parseWatchlist(hash: string): WatchlistState {
    const body = hash.replace(/^#/, '');
    if (!body) return { entries: [], flat: false };
    const items = body.split(';');
    if (items.at(-1) === '') items.pop();
    let flat = false;
    let hasFlat = false;
    const rows = items.filter(item => {
        if (!item.startsWith('flat=')) return true;
        if (hasFlat) throw new Error('自选平铺参数不能重复');
        hasFlat = true;
        const raw = item.slice(5);
        if (raw !== 'true' && raw !== 'false') throw new Error('自选平铺参数必须是 true 或 false');
        flat = raw === 'true';
        return false;
    });
    const entries = rows.map(item => {
        const fields = item.split(',');
        if (fields.length !== 2 || !fields[0] || !fields[1]) throw new Error('自选格式必须是 来源,品种;来源,品种');
        let provider: string, value: string;
        try { provider = decodeURIComponent(fields[0]); value = decodeURIComponent(fields[1]); }
        catch { throw new Error('自选 URL 编码无效'); }
        return watchEntry(provider, value);
    });
    return { entries, flat };
}
export function serializeWatchlist(state: WatchlistState): string {
    if (typeof state.flat !== 'boolean') throw new Error('自选平铺参数必须是 boolean');
    const rows = state.entries.map(item => {
        const valid = watchEntry(item.provider, item.symbol);
        return `${valid.provider},${encodeURIComponent(valid.symbol)}`;
    });
    if (state.flat) rows.unshift('flat=true');
    return rows.length ? '#' + rows.join(';') : '';
}
export function shortWatchLabel(entry: { provider: string; symbol: string }): string {
    if (entry.provider === 'binance' || entry.provider === 'kraken') return entry.symbol.split('/')[0] || entry.symbol;
    if (entry.provider === 'tq') return entry.symbol.slice(entry.symbol.lastIndexOf('.') + 1) || entry.symbol;
    return entry.symbol;
}
export function currentWatchIndex(entries: WatchEntry[], settings: DashboardSettings): number {
    const provider = settings.source === 'tq' ? 'tq' : settings.ccxt.exchange_name;
    return entries.findIndex(item => item.provider === provider && item.symbol === settings[settings.source].symbol);
}
export function adjacentWatch(entries: WatchEntry[], settings: DashboardSettings, direction: -1 | 1): WatchEntry | undefined {
    if (!entries.length) return;
    const index = currentWatchIndex(entries, settings);
    return entries[index < 0 ? (direction === 1 ? 0 : entries.length - 1) : (index + direction + entries.length) % entries.length];
}
export function selectWatch(settings: DashboardSettings, entry: WatchEntry): DashboardSettings {
    const item = watchEntry(entry.provider, entry.symbol);
    return item.provider === 'tq'
        ? { ...settings, source: 'tq', tq: { symbol: item.symbol } }
        : { ...settings, source: 'ccxt', ccxt: { ...settings.ccxt, exchange_name: item.provider, symbol: item.symbol } };
}
export function assertUrlLength(url: string) {
    const length = new URL(url).href.length;
    if (length > MAX_URL_LENGTH) throw new Error(`URL 长度为 ${length} 字符，超过 ${MAX_URL_LENGTH} 字符上限。请缩短自选列表，或使用多个书签分别保存。`);
}
export function moveWatch<T>(items: T[], from: number, to: number): T[] {
    const result = [...items];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item!);
    return result;
}
