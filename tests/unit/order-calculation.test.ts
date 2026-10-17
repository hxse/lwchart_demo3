import { expect, test } from 'bun:test';
import { calculatePreview, calculateProtection } from '../../src/crypto/trading/calculate';
import { Decimal } from '../../src/crypto/trading/decimal';
import { planNotionalValue } from '../../src/crypto/trading/risk-model';
import { arithmeticData, orderData, orderIdentity, orderParameters, orderRequest } from '../fixtures/orders';

test('含费多空固定样本精确匹配，未知额度与空仓模式保留警告并允许计算', () => {
    const data = arithmeticData(), quote = orderRequest().quote_snapshot;
    const long = calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy');
    expect(long.plan).toMatchObject({ amount: '0.0045', stop_price: '9800', take_profit_price: '10200', estimated_risk: '0.9891',
        opening_fee: '0.045', estimated_stop_fee: '0.0441', estimated_take_profit_net: '0.8091' });
    expect(long.risk_error).toBe('0.0109'); expect(long.atr_error).toBe('0');
    expect(planNotionalValue(long.plan)).toBe('45');
    expect(long.warnings.map(w => w.code)).toContain('POSITION_MODE_UNVERIFIED');
    expect(long.warnings.map(w => w.code)).toContain('NOTIONAL_UNVERIFIED');
    expect(data.market_info.notional_rules[0]!.maximum.status).toBe('unknown');
    const short = calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'sell');
    expect(short.plan).toMatchObject({ amount: '0.0045', stop_price: '10200', take_profit_price: '9800', estimated_risk: '0.9909', estimated_take_profit_net: '0.8109' });
    expect(planNotionalValue(short.plan)).toBe('45');
});

test('分别使用 ask／bid，合约乘数保留单位，零和负费率不作缺失', () => {
    const data = arithmeticData(), quote = orderRequest().quote_snapshot;
    quote.ticker.ask = '10001'; quote.ticker.bid = '9999';
    expect(calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy').quote_source).toBe('ask');
    expect(calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'sell').plan.entry_price).toBe('9999');
    quote.ticker.ask = null; quote.ticker.bid = null;
    data.market_info.contract_size_decimal = '0.1';
    const fractional = calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy');
    expect(fractional.plan.amount).toBe('0.0455'); expect(planNotionalValue(fractional.plan)).toBe('45.5');
    expect(planNotionalValue({ amount: '2.892', contract_size: '1', entry_price: '57.09' })).toBe('165.10428');
    data.market_info.contract_size_decimal = '1'; data.trading_fee.taker = '-0.001';
    const rebate = calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy');
    expect(rebate.plan).toMatchObject({ amount: '0.0055', opening_fee: '-0.055', estimated_stop_fee: '-0.0539', estimated_risk: '0.9911' });
    data.trading_fee.taker = '0';
    expect(calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy').plan.estimated_risk).toBe('1');
});

test('价格空间巨大但数量无解时按区间排除，不构造价格数组', () => {
    const data = orderData(), quote = orderRequest().quote_snapshot;
    data.trading_fee.taker = '0'; quote.ticker.last = '60000';
    data.market_info.price_rules.step_size = { status: 'known', value: '0.00000001' };
    const started = performance.now();
    expect(() => calculatePreview(data, orderIdentity, orderParameters, '300', quote, 'buy')).toThrow('两项容差');
    expect(performance.now() - started).toBeLessThan(1000);
});

test('金额容差无法精确满足、关键步长缺失和已知双向模式均禁止，未知上下限仅提示', () => {
    const data = arithmeticData(), quote = orderRequest().quote_snapshot;
    expect(() => calculatePreview(data, orderIdentity, { ...orderParameters, risk_tolerance: '0' }, '100', quote, 'buy')).toThrow('两项容差');
    data.market_info.quantity_rules[0]!.minimum = { status: 'unknown', value: null };
    expect(calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy').warnings.map(w => w.code)).toContain('LIMITS_UNVERIFIED');
    data.market_info.price_rules.step_size = { status: 'unknown', value: null };
    expect(() => calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy')).toThrow('步长');
    const hedge = arithmeticData(); hedge.position_evidence = [{ symbol: orderIdentity.symbol, hedged: true }];
    expect(() => calculatePreview(hedge, orderIdentity, orderParameters, '100', quote, 'buy')).toThrow('双向持仓');
    expect(() => calculatePreview(arithmeticData(), { ...orderIdentity, market: 'spot' }, orderParameters, '100', quote, 'buy')).toThrow('现货');
});

test('非零数量起点与多条规则求交，保护腿的已知限制也参与入场计划', () => {
    const data = arithmeticData(), quote = orderRequest().quote_snapshot;
    const common = data.market_info.quantity_rules[0]!;
    common.step_size = { status: 'known', value: '0.0002' }; common.grid_origin = { status: 'known', value: '0.0001' };
    const market = data.market_info.quantity_rules[1]!;
    market.step_size = { status: 'known', value: '0.0006' }; market.grid_origin = { status: 'known', value: '0.0003' };
    const preview = calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy');
    expect(preview.plan.amount).toBe('0.0045');
    data.market_info.quantity_rules.push({ ...common, source: 'conditional', order_types: ['stop_market'], maximum: { status: 'known', value: '0.003' } });
    expect(() => calculatePreview(data, orderIdentity, orderParameters, '100', quote, 'buy')).toThrow('两项容差');
});

test('成交后只保护实际数量，实际开仓费替换估计，风险偏差不触发补仓', () => {
    const data = arithmeticData();
    const partial = calculateProtection(data, orderIdentity, orderParameters, '100', 'buy', '0.002', '10000', '0.015');
    expect(partial.plan).toMatchObject({ amount: '0.002', opening_fee: '0.015', opening_fee_source: 'reported', stop_price: '9800',
        take_profit_price: '10200', estimated_risk: '0.4346', estimated_take_profit_net: '0.3646' });
    expect(planNotionalValue(partial.plan)).toBe('20');
    expect(partial.warnings.map(w => w.code)).toContain('FILLED_RISK_CHANGED');
    expect(() => calculateProtection(data, orderIdentity, orderParameters, '100', 'buy', '0.00001', '10000')).toThrow('保护单数量');
    const parameters = { ...orderParameters, risk_amount: '3' };
    const boundary = calculateProtection(data, orderIdentity, parameters, '100', 'buy', '0.0135', '10000', '0.3177');
    expect(boundary.warnings.map(w => w.code)).not.toContain('FILLED_RISK_CHANGED');
    const beyond = calculateProtection(data, orderIdentity, parameters, '100', 'buy', '0.0135', '10000', '0.317700000000000000000000000000001');
    expect(beyond.warnings.map(w => w.code)).toContain('FILLED_RISK_CHANGED');
});

test('小范围独立枚举证明优先最小 ATR 误差，再选择最接近预算的数量', () => {
    const data = arithmeticData(), quote = orderRequest().quote_snapshot;
    data.market_info.price_rules.step_size = { status: 'known', value: '1' };
    for (const rule of data.market_info.quantity_rules) rule.step_size = { status: 'known', value: '0.01' };
    quote.ticker.last = '100';
    const options = { ...orderParameters, atr_tolerance: '0.3', risk_tolerance: '0.1' };
    const output = calculatePreview(data, orderIdentity, options, '3', quote, 'buy');
    const candidates = [];
    for (let stop = 93; stop <= 95; stop++) for (let count = 1; count < 30; count++) {
        const distance = 100 - stop;
        const amount = new Decimal(BigInt(count), 100n);
        const risk = amount.mul(new Decimal(BigInt(distance * 1000 + 100 + stop), 1000n));
        if (risk.cmp(Decimal.parse('0.9')) >= 0 && risk.cmp(Decimal.parse('1.1')) <= 0) candidates.push({ stop, amount, risk, error: risk.sub(Decimal.parse('1')).abs() });
    }
    candidates.sort((a, b) => Math.abs(100 - a.stop - 6) - Math.abs(100 - b.stop - 6) || a.error.cmp(b.error)
        || Number(a.risk.cmp(Decimal.parse('1')) > 0) - Number(b.risk.cmp(Decimal.parse('1')) > 0) || a.amount.cmp(b.amount) || a.stop - b.stop);
    expect(output.plan.stop_price).toBe(String(candidates[0]!.stop));
    expect(output.plan.amount).toBe(candidates[0]!.amount.toString());
});
