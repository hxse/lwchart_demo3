/** 用有理数保留十进制输入；比较、网格和预算边界不经过浮点舍入。 */
export function gcd(a: bigint, b: bigint): bigint {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b) [a, b] = [b, a % b];
    return a;
}
export class Decimal {
    readonly n: bigint;
    readonly d: bigint;
    constructor(n: bigint, d = 1n) {
        if (!d) throw new Error('不能除以零');
        if (d < 0n) { n = -n; d = -d; }
        const common = gcd(n, d);
        this.n = n / common; this.d = d / common;
    }
    static parse(value: string): Decimal {
        const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(value);
        if (!match || value.length > 512 || !Number.isFinite(Number(value))) throw new Error('数值必须是有限十进制字符串');
        const [whole, fraction = ''] = match[2]!.split('.');
        const digits = (whole || '0') + fraction;
        const exponent = Number(match[3] ?? 0) - fraction.length;
        if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1024) throw new Error('十进制数值超出可计算范围');
        const sign = match[1] === '-' ? -1n : 1n;
        return exponent >= 0 ? new Decimal(sign * BigInt(digits) * 10n ** BigInt(exponent))
            : new Decimal(sign * BigInt(digits), 10n ** BigInt(-exponent));
    }
    add(other: Decimal) { return new Decimal(this.n * other.d + other.n * this.d, this.d * other.d); }
    sub(other: Decimal) { return new Decimal(this.n * other.d - other.n * this.d, this.d * other.d); }
    mul(other: Decimal) { return new Decimal(this.n * other.n, this.d * other.d); }
    div(other: Decimal) { return new Decimal(this.n * other.d, this.d * other.n); }
    neg() { return new Decimal(-this.n, this.d); }
    abs() { return this.n < 0n ? this.neg() : this; }
    cmp(other: Decimal) {
        const delta = this.n * other.d - other.n * this.d;
        return delta < 0n ? -1 : delta > 0n ? 1 : 0;
    }
    floor() { return this.n >= 0n ? this.n / this.d : -((-this.n + this.d - 1n) / this.d); }
    ceil() { return -this.neg().floor(); }
    toString(): string {
        const sign = this.n < 0n ? '-' : '';
        const numerator = this.n < 0n ? -this.n : this.n;
        const whole = numerator / this.d;
        let remainder = numerator % this.d;
        if (!remainder) return `${sign}${whole}`;
        let divisor = this.d, twos = 0, fives = 0;
        while (divisor % 2n === 0n) { twos++; divisor /= 2n; }
        while (divisor % 5n === 0n) { fives++; divisor /= 5n; }
        // 有限十进制完整输出；非终止比例仅在展示时截到至少 24 位有效数字。
        const places = divisor === 1n ? Math.max(twos, fives) : 24 + Math.max(0, this.d.toString().length - numerator.toString().length);
        let fraction = '';
        for (let i = 0; i < places && remainder; i++) {
            remainder *= 10n;
            fraction += String(remainder / this.d);
            remainder %= this.d;
        }
        return `${sign}${whole}.${fraction.replace(/0+$/, '')}`;
    }
}
export const zero = new Decimal(0n);
export const one = new Decimal(1n);
export const minDecimal = (a: Decimal, b: Decimal) => a.cmp(b) <= 0 ? a : b;
export const maxDecimal = (a: Decimal, b: Decimal) => a.cmp(b) >= 0 ? a : b;

export function numberPreserves(value: Decimal) {
    const number = Number(value.toString());
    return Number.isFinite(number) && Decimal.parse(String(number)).cmp(value) === 0;
}
