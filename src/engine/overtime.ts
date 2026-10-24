/**
 * Overtime history review.
 *
 * This module only describes what the records say. It never extrapolates the
 * history into a forecast, and it never attributes a cause to a movement.
 *
 * Two guards matter here. A percentage change is produced only when the
 * denominator is known and non-zero, so no Infinity or NaN can reach the
 * interface. And a missing monthly value stays missing: it is never read as
 * zero, because "no record" and "zero hours" are different facts.
 */
import {
  Decimal,
  ZERO_MONEY,
  add,
  centsAsDecimal,
  fromCents,
  roundHalfUpToBigInt,
  subtract,
  type Money,
} from '../money/money';
import type { Dataset, OvertimeRecord } from '../domain/dataset';
import type { ValueState, YearMonth } from '../domain/types';
import { valueOf } from '../domain/types';
import { knownState } from '../domain/valueState';
import { parseYearMonth, monthIndex } from './dates';

export const NOT_ENOUGH_DATA_LABEL = 'Not enough comparable data';

export type EffectiveHourlyCost =
  | { readonly kind: 'computed'; readonly amount: Money }
  | { readonly kind: 'not-enough-data'; readonly reason: string };

export type PercentChange =
  | { readonly kind: 'computed'; readonly percent: Decimal }
  | { readonly kind: 'not-enough-data'; readonly reason: string };

export type BudgetVariance =
  | { readonly kind: 'computed'; readonly variance: Money; readonly overBudget: boolean }
  | { readonly kind: 'no-budget' }
  | { readonly kind: 'not-enough-data'; readonly reason: string };

export type MonthlyOvertimeRow = {
  readonly month: YearMonth;
  readonly hours: ValueState<number>;
  readonly dollars: ValueState<Money>;
  readonly effectiveHourlyCost: EffectiveHourlyCost;
  readonly budget: ValueState<Money> | undefined;
  readonly budgetVariance: BudgetVariance;
  readonly isComplete: boolean;
};

/**
 * Effective hourly cost. Requires both figures known and hours strictly
 * positive: dividing by zero hours is not a very large cost, it is no answer.
 */
export function effectiveHourlyCost(
  hours: ValueState<number>,
  dollars: ValueState<Money>,
): EffectiveHourlyCost {
  if (hours.kind !== 'known') {
    return { kind: 'not-enough-data', reason: `Overtime hours are ${hours.kind}.` };
  }
  if (dollars.kind !== 'known') {
    return { kind: 'not-enough-data', reason: `Overtime dollars are ${dollars.kind}.` };
  }
  if (hours.value <= 0) {
    return {
      kind: 'not-enough-data',
      reason: 'Overtime hours are zero, so an hourly cost cannot be divided out.',
    };
  }
  const perHour = centsAsDecimal(dollars.value).div(hours.value);
  return { kind: 'computed', amount: fromCents(roundHalfUpToBigInt(perHour)) };
}

/** Percentage change, guarded against a zero or absent denominator. */
export function percentChange(from: number | undefined, to: number | undefined): PercentChange {
  if (from === undefined || to === undefined) {
    return { kind: 'not-enough-data', reason: 'A comparison value is missing.' };
  }
  if (from === 0) {
    return {
      kind: 'not-enough-data',
      reason: 'The comparison month is zero, so a percentage change has no meaning.',
    };
  }
  return {
    kind: 'computed',
    percent: new Decimal(to).minus(from).div(from).times(100),
  };
}

export function percentChangeMoney(from: Money | undefined, to: Money | undefined): PercentChange {
  if (from === undefined || to === undefined) {
    return { kind: 'not-enough-data', reason: 'A comparison value is missing.' };
  }
  if (from.cents === 0n) {
    return {
      kind: 'not-enough-data',
      reason: 'The comparison month is zero, so a percentage change has no meaning.',
    };
  }
  return {
    kind: 'computed',
    percent: centsAsDecimal(to).minus(centsAsDecimal(from)).div(centsAsDecimal(from)).times(100),
  };
}

function budgetVarianceFor(
  dollars: ValueState<Money>,
  budget: ValueState<Money> | undefined,
): BudgetVariance {
  if (budget === undefined) return { kind: 'no-budget' };
  if (budget.kind === 'excluded') return { kind: 'no-budget' };
  if (budget.kind !== 'known') {
    return { kind: 'not-enough-data', reason: `The overtime budget is ${budget.kind}.` };
  }
  if (dollars.kind !== 'known') {
    return { kind: 'not-enough-data', reason: `Overtime dollars are ${dollars.kind}.` };
  }
  const variance = subtract(dollars.value, budget.value);
  return { kind: 'computed', variance, overBudget: variance.cents > 0n };
}

/** Monthly rows in chronological order. */
export function monthlyOvertimeRows(dataset: Dataset): MonthlyOvertimeRow[] {
  const sorted = [...dataset.overtimeRecords].sort(
    (a, b) => monthSortKey(a.month) - monthSortKey(b.month),
  );

  return sorted.map((record) => {
    const budget = resolveBudget(record, dataset);
    const hours = record.hours.state;
    const dollars = record.dollars.state;
    return {
      month: record.month,
      hours,
      dollars,
      effectiveHourlyCost: effectiveHourlyCost(hours, dollars),
      budget,
      budgetVariance: budgetVarianceFor(dollars, budget),
      isComplete: hours.kind === 'known' && dollars.kind === 'known',
    };
  });
}

function resolveBudget(
  record: OvertimeRecord,
  dataset: Dataset,
): ValueState<Money> | undefined {
  if (record.budgetDollars) return record.budgetDollars.state;
  if (dataset.overtimeMonthlyBudget) return dataset.overtimeMonthlyBudget.state;
  return undefined;
}

export function monthSortKey(month: YearMonth): number {
  const { y, m } = parseYearMonth(month);
  return monthIndex(y, m);
}

export type OvertimeTotals = {
  readonly monthsCounted: number;
  readonly monthsIncomplete: number;
  readonly totalHours: ValueState<number>;
  readonly totalDollars: ValueState<Money>;
  readonly overallEffectiveHourlyCost: EffectiveHourlyCost;
};

/**
 * Totals across the history. Any incomplete month blocks the totals rather than
 * being silently skipped, because a total over an unknown subset is misleading.
 */
export function overtimeTotals(rows: readonly MonthlyOvertimeRow[]): OvertimeTotals {
  const incomplete = rows.filter((r) => !r.isComplete).length;

  if (incomplete > 0) {
    return {
      monthsCounted: rows.length,
      monthsIncomplete: incomplete,
      totalHours: { kind: 'missing' },
      totalDollars: { kind: 'missing' },
      overallEffectiveHourlyCost: {
        kind: 'not-enough-data',
        reason: `${incomplete} of ${rows.length} months are incomplete.`,
      },
    };
  }

  let hours = 0;
  let dollars: Money = ZERO_MONEY;
  for (const r of rows) {
    if (r.hours.kind === 'known') hours += r.hours.value;
    if (r.dollars.kind === 'known') dollars = add(dollars, r.dollars.value);
  }

  return {
    monthsCounted: rows.length,
    monthsIncomplete: 0,
    totalHours: knownState(hours),
    totalDollars: knownState(dollars),
    overallEffectiveHourlyCost: effectiveHourlyCost(knownState(hours), knownState(dollars)),
  };
}

/**
 * The immediately preceding complete month, by calendar order.
 * Returns undefined when there is no earlier complete record.
 */
export function precedingCompleteMonth(
  rows: readonly MonthlyOvertimeRow[],
  index: number,
): MonthlyOvertimeRow | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = rows[i];
    if (candidate && candidate.isComplete) return candidate;
  }
  return undefined;
}

/** Same calendar month in the prior year, when present and complete. */
export function priorYearSameMonth(
  rows: readonly MonthlyOvertimeRow[],
  month: YearMonth,
): MonthlyOvertimeRow | undefined {
  const { y, m } = parseYearMonth(month);
  const target = `${y - 1}-${String(m).padStart(2, '0')}`;
  const found = rows.find((r) => r.month === target);
  return found && found.isComplete ? found : undefined;
}

export function hoursValue(row: MonthlyOvertimeRow): number | undefined {
  return valueOf({ state: row.hours, provenance: 'synthetic-sample' });
}
