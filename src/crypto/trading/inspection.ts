import type { LegResult, PositionSnapshot, TradeIdentity, Warning } from './types';

export interface CleanupOrder {
    id: string;
    write_state: LegResult['write_state'];
    confirmation: 'canceled' | 'absent' | 'open' | 'unknown';
    error: Warning | null;
}
export interface CleanupResult {
    identity: TradeIdentity;
    checked_at: number;
    snapshot: PositionSnapshot | null;
    outcome: 'skipped' | 'empty' | 'completed' | 'failed';
    message: string;
    orders: CleanupOrder[];
    issues: Warning[];
}
export interface InspectionState {
    identity: TradeIdentity | null;
    pending: boolean;
    cleanup: boolean;
    snapshot: PositionSnapshot | null;
    result: CleanupResult | null;
    error: string;
}
export function emptyInspection(): InspectionState {
    return { identity: null, pending: false, cleanup: false, snapshot: null, result: null, error: '' };
}
/** 数量已由服务入口归一；未知数量和多空抵销均不能判为空仓。 */
export function positionKind(snapshot: PositionSnapshot | null): 'flat' | 'held' | 'unknown' {
    if (!snapshot) return 'unknown';
    if (snapshot.positions.some(p => p.contracts !== null && p.contracts !== '0')) return 'held';
    return snapshot.positions.some(p => p.contracts === null) ? 'unknown' : 'flat';
}
