import { expect, test } from 'bun:test';
import { Decimal, numberPreserves } from '../../src/crypto/trading/decimal';
import { gridInterval, gridValue, intersectGrids, onGrid } from '../../src/crypto/trading/grid';

const decimal = Decimal.parse;
test('交易预算使用精确十进制，边界不会因浮点加减漂移', () => {
    expect(decimal('.1').add(decimal('0.2')).toString()).toBe('0.3');
    expect(decimal('1.00e-3').toString()).toBe('0.001');
    const amount = decimal('0.0045');
    const risk = amount.mul(decimal('200').add(decimal('10000').mul(decimal('.001'))).add(decimal('9800').mul(decimal('.001'))));
    expect(risk.toString()).toBe('0.9891');
    expect(risk.sub(decimal('1')).abs().div(decimal('1')).toString()).toBe('0.0109');
    expect(decimal('0.00000000000000000000000001').toString()).toBe('0.00000000000000000000000001');
    expect(decimal('-1.5').floor()).toBe(-2n);
    expect(decimal('-1.5').ceil()).toBe(-1n);
    expect(decimal('1').div(decimal('3')).toString()).toBe('0.333333333333333333333333');
});

test('数量网格同时约束非零起点，不相容网格明确无交集', () => {
    const a = { origin: decimal('.01'), step: decimal('.02') };
    const b = { origin: decimal('.03'), step: decimal('.06') };
    const grid = intersectGrids([a, b])!;
    expect(grid.origin.toString()).toBe('0.03');
    expect(grid.step.toString()).toBe('0.06');
    expect(onGrid(decimal('.09'), grid)).toBe(true);
    expect(onGrid(decimal('.06'), grid)).toBe(false);
    expect(gridInterval(grid, decimal('.031'), decimal('.149'))).toEqual([1n, 1n]);
    expect(gridValue(grid, 1n).toString()).toBe('0.09');
    expect(intersectGrids([a, { origin: decimal('0'), step: decimal('.02') }])).toBeNull();
    expect(gridInterval(grid, decimal('.031'), decimal('.089'))).toBeNull();
});

test('后端 number 边界拒绝不可保真的计划值，未知和非法数值不当作零', () => {
    expect(numberPreserves(decimal('0.0045'))).toBe(true);
    expect(numberPreserves(decimal('9007199254740993'))).toBe(false);
    expect(numberPreserves(decimal('0.10000000000000000001'))).toBe(false);
    for (const input of ['NaN', 'Infinity', '0xff', '', ' ', '1e99999', '1e-99999']) expect(() => decimal(input)).toThrow();
    expect(() => decimal('1').div(decimal('0'))).toThrow('不能除以零');
});
