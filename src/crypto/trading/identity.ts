import type { LegName } from './types';

export const orderLegs: LegName[] = ['entry', 'stop_loss', 'take_profit'];
export function clientOrderIds(requestId: string): Record<LegName, string> {
    const prefix = `lw${requestId.replaceAll('-', '')}`;
    return { entry: prefix + 'e', stop_loss: prefix + 's', take_profit: prefix + 't' };
}
