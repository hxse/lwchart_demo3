import type { ChartPriceLine, PriceLineGroup } from '../../utils/chartTypes';
import type { DashboardSettings, Theme } from '../options';
import type { Side, TradeIdentity } from './types';

export type ExampleLine = 'entry' | 'stop' | 'take-profit';
export type ExampleVisibility = Record<ExampleLine, boolean>;
export interface OrderExample {
    identity: TradeIdentity; side: Side; entry: string; stop: string; takeProfit: string; visible: ExampleVisibility;
}
export function sameTradeIdentity(left: TradeIdentity, right: TradeIdentity) {
    return left.exchange_name === right.exchange_name && left.market === right.market
        && left.is_live === right.is_live && left.symbol === right.symbol;
}
export function matchesChart(settings: DashboardSettings | undefined, identity: TradeIdentity) {
    return settings?.source === 'ccxt' && sameTradeIdentity(settings.ccxt, identity);
}
/** 只生成业务显示配置，SDK 实例与价格轴由共享图表模块管理。 */
export function examplePriceLines(example: OrderExample, theme: Theme): PriceLineGroup {
    const side = example.side === 'buy' ? '多' : '空';
    const lines: Array<ChartPriceLine & { id: ExampleLine }> = [
        { id: 'entry', price: Number(example.entry), color: theme === 'dark' ? '#60a5fa' : '#2563eb', title: `${side}入` },
        { id: 'stop', price: Number(example.stop), color: theme === 'dark' ? '#f87171' : '#dc2626', title: `${side}损` },
        { id: 'take-profit', price: Number(example.takeProfit), color: theme === 'dark' ? '#34d399' : '#059669', title: `${side}盈` },
    ];
    return { series: 'candles', id: 'order-preview', autoscale: true, labelPosition: 'left', lines: lines.filter(line => example.visible[line.id]) };
}
