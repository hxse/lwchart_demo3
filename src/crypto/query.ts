import {
    normalizeOptions, optionKeys, LAYOUTS, layoutSlots, parseInteger, changeSource,
    indicatorString, MAX_HISTORY_BARS, type DashboardOptions, type Layout, type RuntimeOptions,
} from './options';

export function parseDashboardQuery(search: string, runtime: RuntimeOptions): DashboardOptions {
    const params = new URLSearchParams(search);
    const source = params.get('source') ?? runtime.defaults.source;
    if (source !== 'ccxt' && source !== 'tq') throw new Error('数据源必须是 ccxt 或 tq');
    const allowed = optionKeys(source);
    for (const key of params.keys()) {
        if (!allowed.includes(key as typeof allowed[number]) || params.getAll(key).length !== 1) throw new Error('URL 含有未知或重复参数');
    }
    const defaults = source === runtime.defaults.source ? runtime.defaults : changeSource(runtime.defaults, source, runtime.sources);
    const value: Record<string, unknown> = { ...defaults, timeframes: [...defaults.timeframes] };
    for (const [key, raw] of params) {
        if (!raw) throw new Error('URL 参数不能为空');
        if (key === 'is_live') {
            if (raw !== 'true' && raw !== 'false') throw new Error('is_live 必须是 true 或 false');
            value[key] = raw === 'true';
        } else if (key === 'timeframes') value[key] = raw.split(',');
        else if (key === 'refresh_seconds') value[key] = parseInteger(raw, 1, 3600, '更新间隔');
        else if (key === 'history_bars') value[key] = parseInteger(raw, 1, MAX_HISTORY_BARS, '历史 K 线数量');
        else value[key] = raw;
    }
    if (params.has('layout') && !params.has('timeframes')) {
        if (!Object.hasOwn(LAYOUTS, String(value.layout))) throw new Error('未知图表布局');
        value.timeframes = defaults.timeframes.slice(0, layoutSlots(value.layout as Layout));
    } else if (params.has('timeframes') && !params.has('layout')) {
        const count = (value.timeframes as string[]).length;
        if (count !== defaults.timeframes.length) value.layout = ({1:'1x1',2:'1x2',3:'1x3',4:'2x2'} as Record<number,string>)[count];
    }
    return normalizeOptions(value);
}
export function serializeDashboardQuery(options: DashboardOptions): string {
    const o = normalizeOptions(options);
    return new URLSearchParams({
        source: o.source,
        ...(o.source === 'ccxt' ? { exchange_name: o.exchange_name, market: o.market, is_live: String(o.is_live) } : {}),
        symbol: o.symbol, layout: o.layout, timeframes: o.timeframes.join(','), indicators: indicatorString(o.indicators),
        refresh_seconds: String(o.refresh_seconds), history_bars: String(o.history_bars), theme: o.theme, timezone: o.timezone,
    }).toString();
}
export function changeLayout(options: DashboardOptions, layout: Layout, defaults: DashboardOptions): DashboardOptions {
    const timeframes = options.timeframes.slice(0, layoutSlots(layout));
    while (timeframes.length < layoutSlots(layout)) timeframes.push(defaults.timeframes[timeframes.length % defaults.timeframes.length]!);
    return { ...options, layout, timeframes };
}
