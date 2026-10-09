import {
    normalizeSettings, DASHBOARD_KEYS, CCXT_KEYS, LAYOUTS, layoutSlots, parseInteger,
    indicatorString, MAX_HISTORY_BARS, type DashboardSettings, type Layout, type RuntimeOptions,
} from './options';

const identityKeys = [...CCXT_KEYS, 'symbol'] as const;
const queryKeys = [...DASHBOARD_KEYS, ...identityKeys.map(key => `ccxt.${key}`), 'tq.symbol'];

export function parseDashboardQuery(search: string, runtime: RuntimeOptions): DashboardSettings {
    const params = new URLSearchParams(search);
    for (const key of params.keys()) {
        if (!queryKeys.includes(key) || params.getAll(key).length !== 1) throw new Error('URL 含有未知或重复参数');
    }
    const value = normalizeSettings(runtime.defaults);
    for (const [key, raw] of params) {
        if (!raw) throw new Error('URL 参数不能为空');
        if (key.startsWith('ccxt.')) {
            const field = key.slice(5);
            if (field === 'is_live') {
                if (raw !== 'true' && raw !== 'false') throw new Error('is_live 必须是 true 或 false');
                value.ccxt.is_live = raw === 'true';
            } else Object.assign(value.ccxt, { [field]: raw });
        } else if (key === 'tq.symbol') value.tq.symbol = raw;
        else if (key === 'timeframes') Object.assign(value, { timeframes: raw.split(',') });
        else if (key === 'refresh_seconds') value.refresh_seconds = parseInteger(raw, 1, 3600, '更新间隔');
        else if (key === 'history_bars') value.history_bars = parseInteger(raw, 1, MAX_HISTORY_BARS, '历史 K 线数量');
        else Object.assign(value, { [key]: raw });
    }
    if (params.has('layout') && !params.has('timeframes')) {
        if (!Object.hasOwn(LAYOUTS, value.layout)) throw new Error('未知图表布局');
        value.timeframes = runtime.defaults.timeframes.slice(0, layoutSlots(value.layout));
    } else if (params.has('timeframes') && !params.has('layout') && value.timeframes.length !== runtime.defaults.timeframes.length) {
        value.layout = ({ 1: '1x1', 2: '1x2', 3: '1x3', 4: '2x2' } as Record<number, Layout>)[value.timeframes.length]!;
    }
    return normalizeSettings(value);
}
export function serializeDashboardQuery(settings: DashboardSettings): string {
    const o = normalizeSettings(settings);
    return new URLSearchParams({
        source: o.source,
        ...Object.fromEntries(identityKeys.map(key => [`ccxt.${key}`, String(o.ccxt[key])])),
        'tq.symbol': o.tq.symbol,
        layout: o.layout, timeframes: o.timeframes.join(','), indicators: indicatorString(o.indicators),
        refresh_seconds: String(o.refresh_seconds), history_bars: String(o.history_bars), theme: o.theme, timezone: o.timezone, dock_position: o.dock_position,
    }).toString();
}
export function changeLayout(options: DashboardSettings, layout: Layout, defaults: DashboardSettings): DashboardSettings {
    const timeframes = options.timeframes.slice(0, layoutSlots(layout));
    while (timeframes.length < layoutSlots(layout)) timeframes.push(defaults.timeframes[timeframes.length % defaults.timeframes.length]!);
    return { ...options, layout, timeframes };
}
