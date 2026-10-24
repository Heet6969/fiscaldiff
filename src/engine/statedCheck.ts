/**
 * The stated-cost check as the user has currently set it up.
 *
 * One definition of "the active check" for the screen, the CSV report and the
 * printable summary, so the three cannot describe different claims.
 *
 * The draft allows the period dates and the tolerance to be null. Null means the
 * field is empty or holds something that is not valid. That state is kept as
 * null rather than falling back to the last good value: a verdict computed from
 * a value the person has since cleared or broken would look authoritative and
 * mean nothing. While anything is null, no comparison is made, and the outcome
 * lists exactly what needs correcting.
 */
import type { Dataset, OfferId, StatedCostClaim, Tolerance } from '../domain/dataset';
import { known } from '../domain/types';
import { DEFAULT_TOLERANCE_AMOUNT } from './config';
import { fromDollars } from '../money/money';
import { checkStatedCost, type Reconciliation } from './reconcile';

export type StatedClaimDraft = Omit<StatedCostClaim, 'periodStart' | 'periodEnd' | 'tolerance'> & {
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly tolerance: Tolerance | null;
};

export type StatedCheckInputs = {
  readonly claim: StatedClaimDraft;
  readonly offerId: OfferId;
};

export type StatedCheckOutcome =
  | {
      readonly kind: 'needs-correction';
      readonly offerId: OfferId;
      readonly offerLabel: string;
      readonly claimLabel: string;
      readonly draft: StatedClaimDraft;
      /** What to fix, in plain words. Never empty for this kind. */
      readonly problems: readonly string[];
    }
  | {
      readonly kind: 'checked';
      readonly offerId: OfferId;
      readonly offerLabel: string;
      readonly reconciliation: Reconciliation;
    };

export function draftFromClaim(claim: StatedCostClaim): StatedClaimDraft {
  return { ...claim };
}

export function blankDraft(fiscalYear: { start: string; end: string }): StatedClaimDraft {
  return {
    id: 'custom',
    label: 'Figure entered on screen',
    statedAmount: known(fromDollars('0'), 'user-assumption'),
    periodStart: fiscalYear.start,
    periodEnd: fiscalYear.end,
    claimedComponents: ['base-pay-increment', 'one-time-bonus'],
    tolerance: { kind: 'absolute', amount: DEFAULT_TOLERANCE_AMOUNT },
  };
}

export function initialStatedInputs(dataset: Dataset): StatedCheckInputs {
  const first = dataset.statedCosts[0];
  return {
    claim: first ? draftFromClaim(first) : blankDraft(dataset.fiscalYear),
    offerId: 'A',
  };
}

export function statedProblems(draft: StatedClaimDraft): string[] {
  const problems: string[] = [];
  if (draft.periodStart === null) {
    problems.push(
      'The "from" date is empty or not a valid date. Enter the first day the figure covers as YYYY-MM-DD.',
    );
  }
  if (draft.periodEnd === null) {
    problems.push(
      'The "to" date is empty or not a valid date. Enter the last day the figure covers as YYYY-MM-DD.',
    );
  }
  if (draft.tolerance === null) {
    problems.push(
      'The tolerance is empty or not a valid amount. Enter a dollar amount of 0 or more, for example 1.00.',
    );
  }
  return problems;
}

export function resolveStatedCheck(
  dataset: Dataset,
  inputs: StatedCheckInputs,
): StatedCheckOutcome {
  const { claim: draft, offerId } = inputs;
  const offerLabel = dataset.offers[offerId].label;
  const problems = statedProblems(draft);

  if (
    problems.length > 0 ||
    draft.periodStart === null ||
    draft.periodEnd === null ||
    draft.tolerance === null
  ) {
    return {
      kind: 'needs-correction',
      offerId,
      offerLabel,
      claimLabel: draft.label,
      draft,
      problems,
    };
  }

  const claim: StatedCostClaim = {
    ...draft,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    tolerance: draft.tolerance,
  };

  return {
    kind: 'checked',
    offerId,
    offerLabel,
    reconciliation: checkStatedCost(dataset, claim, offerId),
  };
}
