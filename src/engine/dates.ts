/**
 * Civil date handling. No `Date`, no timezone, no clock.
 *
 * Using the platform `Date` here would make results depend on the machine's
 * timezone, which would break determinism. These are plain year/month/day
 * triples with explicit arithmetic.
 */
import type { IsoDate, YearMonth } from '../domain/types';

export type CivilDate = { readonly y: number; readonly m: number; readonly d: number };

export class DateParseError extends Error {
  constructor(input: string) {
    super(`Not a valid date (expected YYYY-MM-DD): "${input}"`);
    this.name = 'DateParseError';
  }
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonth(y: number, m: number): number {
  if (m < 1 || m > 12) throw new Error(`Month out of range: ${m}`);
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  const len = MONTH_LENGTHS[m - 1];
  if (len === undefined) throw new Error(`Month out of range: ${m}`);
  return len;
}

export function isValidIsoDate(raw: string): boolean {
  try {
    parseIsoDate(raw);
    return true;
  } catch {
    return false;
  }
}

export function parseIsoDate(raw: string): CivilDate {
  const text = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new DateParseError(raw);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) throw new DateParseError(raw);
  if (d < 1 || d > daysInMonth(y, m)) throw new DateParseError(raw);
  return { y, m, d };
}

export function formatIsoDate(date: CivilDate): IsoDate {
  const m = String(date.m).padStart(2, '0');
  const d = String(date.d).padStart(2, '0');
  return `${date.y}-${m}-${d}`;
}

export function compareDates(a: CivilDate, b: CivilDate): -1 | 0 | 1 {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : 1;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return 0;
}

export function maxDate(a: CivilDate, b: CivilDate): CivilDate {
  return compareDates(a, b) >= 0 ? a : b;
}

export function minDate(a: CivilDate, b: CivilDate): CivilDate {
  return compareDates(a, b) <= 0 ? a : b;
}

export function isWithinInclusive(date: CivilDate, start: CivilDate, end: CivilDate): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

/** Month index since year 0, for month arithmetic and iteration. */
export function monthIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

export function fromMonthIndex(index: number): { y: number; m: number } {
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

export function parseYearMonth(raw: string): { y: number; m: number } {
  const text = raw.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`Not a valid month (expected YYYY-MM): "${raw}"`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) throw new Error(`Not a valid month (expected YYYY-MM): "${raw}"`);
  return { y, m };
}

export function formatYearMonth(y: number, m: number): YearMonth {
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function isValidYearMonth(raw: string): boolean {
  try {
    parseYearMonth(raw);
    return true;
  } catch {
    return false;
  }
}

/** Previous calendar month. */
export function previousYearMonth(ym: YearMonth): YearMonth {
  const { y, m } = parseYearMonth(ym);
  const prev = fromMonthIndex(monthIndex(y, m) - 1);
  return formatYearMonth(prev.y, prev.m);
}

/** Same calendar month one year earlier. */
export function sameMonthPriorYear(ym: YearMonth): YearMonth {
  const { y, m } = parseYearMonth(ym);
  return formatYearMonth(y - 1, m);
}

/** Long-form month for display, e.g. 'January 2027'. Locale-independent. */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatYearMonthLong(ym: YearMonth): string {
  const { y, m } = parseYearMonth(ym);
  return `${MONTH_NAMES[m - 1] ?? m} ${y}`;
}

export function formatIsoDateLong(raw: IsoDate): string {
  const { y, m, d } = parseIsoDate(raw);
  return `${MONTH_NAMES[m - 1] ?? m} ${d}, ${y}`;
}
