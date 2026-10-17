import type { CcxtDefaults, DashboardSettings } from '../options';
import { initialOrderDraft, type OrderDraft } from './panel-state';
import { sameTradeIdentity, type ExampleVisibility } from './preview';
import type { Side } from './types';

type OrderContext = ({ source: 'ccxt' } & Omit<CcxtDefaults, 'symbol'>) | { source: 'tq' };
export interface OrderMemory {
    context: OrderContext;
    draft: OrderDraft;
    applied: OrderDraft;
    dirty: boolean;
    error: string;
    referenceSide: Side;
    exampleVisibility: ExampleVisibility;
    expanded: { parameters: boolean; reference: boolean; log: boolean };
}
function context(settings: DashboardSettings): OrderContext {
    if (settings.source === 'tq') return { source: 'tq' };
    const { exchange_name, market, is_live } = settings.ccxt;
    return { source: 'ccxt', exchange_name, market, is_live };
}
/** 每个页面实例只创建一份；不使用浏览器存储或按品种缓存。 */
export function createOrderMemory(settings: DashboardSettings): OrderMemory {
    const draft = initialOrderDraft(settings);
    return { context: context(settings), draft, applied: { ...draft }, dirty: false, error: '', referenceSide: 'buy',
        exampleVisibility: { entry: true, stop: true, 'take-profit': true },
        expanded: { parameters: true, reference: true, log: true } };
}
export function sameChartIdentity(left: DashboardSettings | undefined, right: DashboardSettings) {
    if (!left || left.source !== right.source) return false;
    return left.source === 'ccxt' ? sameTradeIdentity(left.ccxt, right.ccxt) : left.tq.symbol === right.tq.symbol;
}
export function changeOrderIdentity(memory: OrderMemory, settings: DashboardSettings) {
    memory.context = context(settings);
    const symbol = settings[settings.source].symbol;
    memory.draft.symbol = symbol; memory.applied.symbol = symbol; memory.error = '';
}
export function cancelOrderDraft(memory: OrderMemory) {
    memory.draft = { ...memory.applied }; memory.dirty = false; memory.error = '';
}
export function resetOrderDraft(memory: OrderMemory, settings: DashboardSettings) {
    memory.draft = initialOrderDraft(settings); memory.dirty = true; memory.error = '';
}
export function orderReaderSettings(memory: OrderMemory, settings: DashboardSettings): DashboardSettings {
    if (memory.context.source === 'tq') return { ...settings, source: 'tq', tq: { symbol: memory.applied.symbol } };
    const { source, ...identity } = memory.context;
    return { ...settings, source, ccxt: { ...identity, symbol: memory.applied.symbol } };
}
