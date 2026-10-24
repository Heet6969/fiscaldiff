/**
 * Fiscal-year bounds and the proration convention.
 *
 * The convention, stated once here and disclosed in the interface and every
 * export: a full applicable month counts as 1/12 of annual salary, and a
 * partial month counts as (applicable calendar days / days in that month) × 1/12.
 * The effective date itself counts as applicable.
 *
 * This is a disclosed simplifying convention for a prototype. It is NOT a
 * reproduction of an actual payroll calendar, and it is not presented as one.
 */
import { Decimal } from '../money/money';
import type { IsoDate } from '../domain/types';
import {
  type CivilDate,
  compareDates,
  daysInMonth,
  fromMonthIndex,
  maxDate,
  minDate,
  monthIndex,
  parseIsoDate,
} from './dates';

export type FiscalYear = {
  readonly start: IsoDate;
  readonly end: IsoDate;
  readonly label: string;
};

export type FiscalBounds = {
  readonly start: CivilDate;
  readonly end: CivilDate;
};

export const PRORATION_CONVENTION =
  'Monthly proration: each full applicable month counts as one twelfth of annual ' +
  'salary; a partial month counts as its applicable calendar days divided by the ' +
  'days in that month, times one twelfth. The effective date counts as applicable. ' +
  'This is a disclosed simplifying convention, not a reproduction of an actual ' +
  'payroll calendar.';

export function boundsOf(fy: FiscalYear): FiscalBounds {
  const start = parseIsoDate(fy.start);
  const end = parseIsoDate(fy.end);
  if (compareDates(start, end) > 0) {
    throw new Error(`Fiscal year start ${fy.start} is after its end ${fy.end}`);
  }
  return { start, end };
}

export function isWithinFiscalYear(date: IsoDate, fy: FiscalYear): boolean {
  const { start, end } = boundsOf(fy);
  const d = parseIsoDate(date);
  return compareDates(d, start) >= 0 && compareDates(d, end) <= 0;
}

/**
 * Fraction of an annual amount that falls inside the fiscal year when a change
 * takes effect on `effectiveDate`.
 *
 * Returns 1 when the change is already in force at the start of the year,
 * 0 when it takes effect after the year ends, and the month-weighted fraction
 * otherwise. A mid-month date is never snapped to a month boundary.
 */
export function prorationFactor(effectiveDate: IsoDate, fy: FiscalYear): Decimal {
  const { start, end } = boundsOf(fy);
  const effective = parseIsoDate(effectiveDate);

  if (compareDates(effective, end) > 0) return new Decimal(0);

  const from = maxDate(effective, start);
  const firstIndex = monthIndex(from.y, from.m);
  const lastIndex = monthIndex(end.y, end.m);

  let monthsSum = new Decimal(0);

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const { y, m } = fromMonthIndex(index);
    const totalDays = daysInMonth(y, m);
    const monthFirst: CivilDate = { y, m, d: 1 };
    const monthLast: CivilDate = { y, m, d: totalDays };

    const overlapStart = maxDate(from, monthFirst);
    const overlapEnd = minDate(end, monthLast);
    if (compareDates(overlapStart, overlapEnd) > 0) continue;

    const applicableDays = overlapEnd.d - overlapStart.d + 1;

    monthsSum =
      applicableDays === totalDays
        ? monthsSum.plus(1)
        : monthsSum.plus(new Decimal(applicableDays).div(totalDays));
  }

  return monthsSum.div(12);
}

/**
 * Human-readable description of how a factor was reached, for the audit trail.
 */
export function prorationExplanation(effectiveDate: IsoDate, fy: FiscalYear): string {
  const { start, end } = boundsOf(fy);
  const effective = parseIsoDate(effectiveDate);

  if (compareDates(effective, end) > 0) {
    return `Effective ${effectiveDate} falls after the fiscal year ends ${fy.end}; no current-year effect.`;
  }
  if (compareDates(effective, start) <= 0) {
    return `Effective ${effectiveDate} is on or before the fiscal year start ${fy.start}; full 12 of 12 months apply.`;
  }

  const from = effective;
  const firstIndex = monthIndex(from.y, from.m);
  const lastIndex = monthIndex(end.y, end.m);

  let fullMonths = 0;
  const partials: string[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const { y, m } = fromMonthIndex(index);
    const totalDays = daysInMonth(y, m);
    const overlapStart = maxDate(from, { y, m, d: 1 });
    const overlapEnd = minDate(end, { y, m, d: totalDays });
    if (compareDates(overlapStart, overlapEnd) > 0) continue;
    const applicableDays = overlapEnd.d - overlapStart.d + 1;
    if (applicableDays === totalDays) fullMonths += 1;
    else partials.push(`${applicableDays} of ${totalDays} days in ${y}-${String(m).padStart(2, '0')}`);
  }

  const parts = [`${fullMonths} full month${fullMonths === 1 ? '' : 's'} of 12`];
  if (partials.length > 0) parts.push(`plus ${partials.join(' and ')}`);
  return `Effective ${effectiveDate} in fiscal year ${fy.label}: ${parts.join(', ')}.`;
}

/** Count of whole months in the fiscal year's span, for display. */
export function fiscalYearMonthSpan(fy: FiscalYear): number {
  const { start, end } = boundsOf(fy);
  return monthIndex(end.y, end.m) - monthIndex(start.y, start.m) + 1;
}
