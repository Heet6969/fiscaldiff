/**
 * The single public surface of the calculation engine.
 *
 * Every view imports from here and nowhere deeper. No view holds a formula, so
 * a figure shown in two places is the same figure, not two implementations that
 * happen to agree today.
 */
export * from './dates';
export * from './fiscalCalendar';
export * from './config';
export * from './baseline';
export * from './offer';
export * from './overtime';
export * from './flags';
export * from './reconcile';
export * from './statedCheck';
export * from './comparators';

import type { Dataset, OfferId } from '../domain/dataset';
import type { ReviewThresholds } from './config';
import { computeBudgetPosition, computeOffer, type BudgetPosition, type OfferResult } from './offer';
import { evaluateFlags, type FlagEvaluation } from './flags';
import { monthlyOvertimeRows, overtimeTotals, type MonthlyOvertimeRow, type OvertimeTotals } from './overtime';

export type EngineView = {
  readonly offers: Readonly<Record<OfferId, OfferResult>>;
  readonly budgets: Readonly<Record<OfferId, BudgetPosition | undefined>>;
  readonly overtimeRows: readonly MonthlyOvertimeRow[];
  readonly overtimeTotals: OvertimeTotals;
  readonly flags: FlagEvaluation;
};

/**
 * Computes everything the three views need, once, from one dataset.
 * This is the function that makes cross-view agreement structural.
 */
export function computeEngineView(
  dataset: Dataset,
  thresholds: ReviewThresholds,
): EngineView {
  const offerA = computeOffer(dataset, 'A');
  const offerB = computeOffer(dataset, 'B');
  const rows = monthlyOvertimeRows(dataset);

  return {
    offers: { A: offerA, B: offerB },
    budgets: {
      A: computeBudgetPosition(dataset, offerA),
      B: computeBudgetPosition(dataset, offerB),
    },
    overtimeRows: rows,
    overtimeTotals: overtimeTotals(rows),
    flags: evaluateFlags(rows, thresholds),
  };
}
