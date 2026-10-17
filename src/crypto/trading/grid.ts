import { Decimal, gcd, maxDecimal, minDecimal, zero } from './decimal';

export interface Grid { origin: Decimal; step: Decimal }
export interface Bounds { minimum: Decimal; maximum: Decimal | null }
const mod = (n: bigint, d: bigint) => ((n % d) + d) % d;
const lcm = (a: bigint, b: bigint) => a / gcd(a, b) * b;
function inverse(a: bigint, divisor: bigint) {
    let old = a, next = divisor, x = 1n, y = 0n;
    while (next) {
        const quotient = old / next;
        [old, next] = [next, old - quotient * next];
        [x, y] = [y, x - quotient * y];
    }
    return mod(x, divisor);
}

/** 非零起点也参与同余约束，不能只取步长的最小公倍数。 */
export function intersectGrids(grids: Grid[]): Grid | null {
    if (!grids.length) return null;
    const scale = grids.reduce((n, grid) => lcm(lcm(n, grid.origin.d), grid.step.d), 1n);
    let origin = 0n, step = 1n;
    for (const grid of grids) {
        const nextStep = grid.step.n * (scale / grid.step.d);
        if (nextStep <= 0n) throw new Error('网格步长必须为正');
        const nextOrigin = mod(grid.origin.n * (scale / grid.origin.d), nextStep);
        const common = gcd(step, nextStep);
        const delta = nextOrigin - origin;
        if (delta % common) return null;
        const divisor = nextStep / common;
        const offset = divisor === 1n ? 0n : mod(delta / common * inverse(step / common, divisor), divisor);
        origin += step * offset;
        step = lcm(step, nextStep);
        origin = mod(origin, step);
    }
    return { origin: new Decimal(origin, scale), step: new Decimal(step, scale) };
}
export const gridValue = (grid: Grid, index: bigint) => grid.origin.add(grid.step.mul(new Decimal(index)));
export const lowerIndex = (grid: Grid, value: Decimal) => value.sub(grid.origin).div(grid.step).ceil();
export const upperIndex = (grid: Grid, value: Decimal) => value.sub(grid.origin).div(grid.step).floor();
export function inBounds(value: Decimal, bounds: Bounds) {
    return value.cmp(zero) > 0 && value.cmp(bounds.minimum) >= 0 && (!bounds.maximum || value.cmp(bounds.maximum) <= 0);
}
export function onGrid(value: Decimal, grid: Grid) { return value.sub(grid.origin).div(grid.step).d === 1n; }
export function intersectBounds(a: Bounds, b: Bounds): Bounds {
    return { minimum: maxDecimal(a.minimum, b.minimum), maximum: a.maximum && b.maximum
        ? minDecimal(a.maximum, b.maximum) : a.maximum ?? b.maximum };
}
export function gridInterval(grid: Grid, minimum: Decimal, maximum: Decimal): [bigint, bigint] | null {
    const low = lowerIndex(grid, minimum), high = upperIndex(grid, maximum);
    return low <= high ? [low, high] : null;
}
