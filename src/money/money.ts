/**
 * Money as integer minor units (cents) held in a bigint.
 *
 * No JavaScript `number` ever represents an amount of money here. Addition and
 * subtraction are exact bigint operations. The only place a value is rounded is
 * `multiplyByRate`, which is used at the per-employee, per-component leaf of a
 * calculation; every aggregation above that is exact integer summation. That is
 * what makes "the parts add up to the total" true rather than approximately true.
 */
import Decimal from 'decimal.js';

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpPos: 40,
  toExpNeg: -40,
});

export type Money = { readonly cents: bigint };

export const ZERO_MONEY: Money = { cents: 0n };

export class MoneyParseError extends Error {
  constructor(input: string) {
    super(`Not a valid money amount: "${input}"`);
    this.name = 'MoneyParseError';
  }
}

export function fromCents(cents: bigint): Money {
  return { cents };
}

/** Whole dollars. Convenience for fixtures and tests. */
export function fromDollars(dollars: number | string): Money {
  return fromDecimalString(String(dollars));
}

/**
 * Strict parse of a decimal money string. Accepts an optional leading `$`,
 * thousands separators, a leading sign, and at most two decimal places.
 * Rejects anything else rather than coercing it.
 */
export function fromDecimalString(raw: string): Money {
  const trimmed = raw.trim();
  if (trimmed === '') throw new MoneyParseError(raw);

  let text = trimmed.replace(/,/g, '');
  let negative = false;

  // Accept -$100 and $-100 and (100) is NOT accepted: accounting parens are
  // ambiguous enough that refusing is safer than guessing.
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }
  if (text.startsWith('$')) text = text.slice(1);
  if (text.startsWith('-')) {
    if (negative) throw new MoneyParseError(raw);
    negative = true;
    text = text.slice(1);
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new MoneyParseError(raw);

  const [intPart = '0', fracPart = ''] = text.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  const cents = BigInt(intPart) * 100n + BigInt(frac);
  return { cents: negative ? -cents : cents };
}

export function add(...amounts: readonly Money[]): Money {
  let total = 0n;
  for (const a of amounts) total += a.cents;
  return { cents: total };
}

export function subtract(a: Money, b: Money): Money {
  return { cents: a.cents - b.cents };
}

export function negate(a: Money): Money {
  return { cents: -a.cents };
}

export function absMoney(a: Money): Money {
  return { cents: a.cents < 0n ? -a.cents : a.cents };
}

/** Exact scaling by a whole count, e.g. per-employee amount × headcount. */
export function multiplyByCount(a: Money, count: number | bigint): Money {
  const n = typeof count === 'bigint' ? count : BigInt(Math.trunc(count));
  if (typeof count === 'number' && !Number.isInteger(count)) {
    throw new Error(`multiplyByCount requires an integer count, received ${count}`);
  }
  return { cents: a.cents * n };
}

/**
 * Scale by a rate, rounding half-up away from zero to whole cents.
 * This is the single rounding point in the engine.
 */
export function multiplyByRate(a: Money, rate: Decimal | string | number): Money {
  const d = rate instanceof Decimal ? rate : new Decimal(rate);
  const product = new Decimal(a.cents.toString()).times(d);
  return { cents: roundHalfUpToBigInt(product) };
}

export function roundHalfUpToBigInt(d: Decimal): bigint {
  return BigInt(d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/** Amount as a Decimal in dollars. For ratios and display only. */
export function toDecimalDollars(a: Money): Decimal {
  return new Decimal(a.cents.toString()).div(100);
}

/** Cents as a Decimal. For rate maths that stays in minor units. */
export function centsAsDecimal(a: Money): Decimal {
  return new Decimal(a.cents.toString());
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  if (a.cents < b.cents) return -1;
  if (a.cents > b.cents) return 1;
  return 0;
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.cents === b.cents;
}

export function isZeroMoney(a: Money): boolean {
  return a.cents === 0n;
}

export function isNegativeMoney(a: Money): boolean {
  return a.cents < 0n;
}

/** '-1234.56' style, stable across locales. Used for CSV and tests. */
export function toDecimalString(a: Money): string {
  const negative = a.cents < 0n;
  const abs = negative ? -a.cents : a.cents;
  const dollars = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? '-' : ''}${dollars}.${cents.toString().padStart(2, '0')}`;
}

/**
 * Display format: $1,234.56 and -$1,234.56.
 * Built from the exact string, not from a float, so it cannot drift from the
 * stored value. Grouping is applied manually to keep output locale-independent
 * and therefore deterministic.
 */
export function formatUSD(a: Money, options?: { showCents?: boolean }): string {
  const showCents = options?.showCents ?? true;
  const negative = a.cents < 0n;
  const abs = negative ? -a.cents : a.cents;
  const dollars = abs / 100n;
  const cents = abs % 100n;

  const grouped = groupDigits(dollars.toString());
  const body = showCents ? `${grouped}.${cents.toString().padStart(2, '0')}` : grouped;
  return `${negative ? '-' : ''}$${body}`;
}

/** Signed display, always showing the sign. For differences. */
export function formatSignedUSD(a: Money): string {
  if (a.cents === 0n) return '$0.00';
  const formatted = formatUSD(absMoney(a));
  return `${a.cents < 0n ? '-' : '+'}${formatted}`;
}

function groupDigits(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

export { Decimal };
