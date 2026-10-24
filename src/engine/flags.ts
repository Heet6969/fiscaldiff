/**
 * Review flags.
 *
 * A flag says: a pattern crossed a stated threshold, here are the records and
 * the comparison. It does not say why, and it does not say anything about
 * conduct. The only status wording used is "Needs review".
 */
import { Decimal, formatUSD, formatSignedUSD } from '../money/money';
import type { YearMonth } from '../domain/types';
import {
  REVIEW_THRESHOLD_DISCLAIMER,
  HOURS_COMPARISON_BASIS,
  type ReviewThresholds,
} from './config';
import {
  percentChange,
  percentChangeMoney,
  precedingCompleteMonth,
  type MonthlyOvertimeRow,
} from './overtime';
import { formatYearMonthLong } from './dates';

export const NEEDS_REVIEW = 'Needs review' as const;

export type FlagKind = 'hours-increase' | 'effective-hourly-cost-change' | 'budget-overage';

export type Flag = {
  readonly id: string;
  readonly kind: FlagKind;
  readonly label: typeof NEEDS_REVIEW;
  readonly title: string;
  readonly summary: string;
  /** The records the flag is about. */
  readonly months: readonly YearMonth[];
  /** The comparison that was made, in words. */
  readonly comparison: string;
  /** The threshold that was applied, in words. */
  readonly threshold: string;
  readonly disclaimer: string;
};

export type FlagEvaluation = {
  readonly flags: readonly Flag[];
  /** Months that could not be assessed, and why. */
  readonly notAssessed: readonly { month: YearMonth; reason: string }[];
};

export function evaluateFlags(
  rows: readonly MonthlyOvertimeRow[],
  thresholds: ReviewThresholds,
): FlagEvaluation {
  const flags: Flag[] = [];
  const notAssessed: { month: YearMonth; reason: string }[] = [];

  rows.forEach((row, index) => {
    if (!row.isComplete) {
      notAssessed.push({
        month: row.month,
        reason: 'The record is incomplete, so it is not compared. Missing values are not read as zero.',
      });
      return;
    }

    const previous = precedingCompleteMonth(rows, index);

    if (!previous) {
      notAssessed.push({
        month: row.month,
        reason: 'There is no earlier complete month to compare against.',
      });
    } else {
      // --- Hours increase against the immediately preceding complete month ---
      const hoursChange = percentChange(
        previous.hours.kind === 'known' ? previous.hours.value : undefined,
        row.hours.kind === 'known' ? row.hours.value : undefined,
      );

      if (hoursChange.kind === 'not-enough-data') {
        notAssessed.push({
          month: row.month,
          reason: `Overtime hours not compared: ${hoursChange.reason}`,
        });
      } else if (hoursChange.percent.greaterThanOrEqualTo(thresholds.hoursIncreasePercent)) {
        const prevHours = previous.hours.kind === 'known' ? previous.hours.value : 0;
        const currHours = row.hours.kind === 'known' ? row.hours.value : 0;
        flags.push({
          id: `hours-increase-${row.month}`,
          kind: 'hours-increase',
          label: NEEDS_REVIEW,
          title: `Overtime hours up ${formatPercent(hoursChange.percent)} in ${formatYearMonthLong(row.month)}`,
          summary:
            `Overtime hours rose from ${formatHours(prevHours)} in ` +
            `${formatYearMonthLong(previous.month)} to ${formatHours(currHours)} in ` +
            `${formatYearMonthLong(row.month)}.`,
          months: [previous.month, row.month],
          comparison: `${formatYearMonthLong(row.month)} overtime hours against ${HOURS_COMPARISON_BASIS}, ${formatYearMonthLong(previous.month)}.`,
          threshold: `An increase of ${thresholds.hoursIncreasePercent}% or more in monthly overtime hours.`,
          disclaimer: REVIEW_THRESHOLD_DISCLAIMER,
        });
      }

      // --- Effective hourly cost change ---
      const currCost =
        row.effectiveHourlyCost.kind === 'computed' ? row.effectiveHourlyCost.amount : undefined;
      const prevCost =
        previous.effectiveHourlyCost.kind === 'computed'
          ? previous.effectiveHourlyCost.amount
          : undefined;
      const costChange = percentChangeMoney(prevCost, currCost);

      if (costChange.kind === 'computed') {
        const magnitude = costChange.percent.abs();
        if (magnitude.greaterThanOrEqualTo(thresholds.effectiveHourlyCostChangePercent)) {
          const direction = costChange.percent.isNegative() ? 'down' : 'up';
          flags.push({
            id: `hourly-cost-${row.month}`,
            kind: 'effective-hourly-cost-change',
            label: NEEDS_REVIEW,
            title: `Effective overtime hourly cost ${direction} ${formatPercent(magnitude)} in ${formatYearMonthLong(row.month)}`,
            summary:
              `Effective hourly cost moved from ${prevCost ? formatUSD(prevCost) : '—'} in ` +
              `${formatYearMonthLong(previous.month)} to ${currCost ? formatUSD(currCost) : '—'} in ` +
              `${formatYearMonthLong(row.month)}. The tool does not infer why.`,
            months: [previous.month, row.month],
            comparison: `Effective hourly cost (dollars ÷ hours) for ${formatYearMonthLong(row.month)} against ${formatYearMonthLong(previous.month)}.`,
            threshold: `A change of ${thresholds.effectiveHourlyCostChangePercent}% or more in either direction.`,
            disclaimer: REVIEW_THRESHOLD_DISCLAIMER,
          });
        }
      }
    }

    // --- Budget overage ---
    if (thresholds.flagBudgetOverage && row.budgetVariance.kind === 'computed') {
      if (row.budgetVariance.overBudget) {
        const budgetAmount = row.budget && row.budget.kind === 'known' ? row.budget.value : undefined;
        flags.push({
          id: `budget-${row.month}`,
          kind: 'budget-overage',
          label: NEEDS_REVIEW,
          title: `Overtime spending above budget in ${formatYearMonthLong(row.month)}`,
          summary:
            `Recorded overtime spending was ${formatSignedUSD(row.budgetVariance.variance)} against ` +
            `the entered monthly budget${budgetAmount ? ` of ${formatUSD(budgetAmount)}` : ''}.`,
          months: [row.month],
          comparison: `${formatYearMonthLong(row.month)} recorded overtime dollars against the entered monthly overtime budget.`,
          threshold: 'Any amount above the entered monthly overtime budget.',
          disclaimer: REVIEW_THRESHOLD_DISCLAIMER,
        });
      }
    }
  });

  return { flags, notAssessed };
}

export function formatPercent(percent: Decimal): string {
  return `${percent.toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1)}%`;
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hours`;
}
