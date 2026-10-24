/**
 * Checking a stated cost against the same calculation.
 *
 * The scope gate runs before any arithmetic. A claim about a different period,
 * about total payroll, or about components this prototype does not calculate is
 * not a small difference to be measured — it is a comparison that should not be
 * made at all, and it returns "Cannot verify".
 *
 * A difference is never called an error. The wording is "Difference requiring
 * review", because a difference can just as easily mean our assumptions differ
 * from the author's.
 */
import {
  ZERO_MONEY,
  absMoney,
  add,
  compareMoney,
  formatSignedUSD,
  formatUSD,
  multiplyByRate,
  subtract,
  Decimal,
  type Money,
} from '../money/money';
import type { Dataset, OfferId, StatedCostClaim, Tolerance } from '../domain/dataset';
import type {
  CalcStep,
  ComponentId,
  Exclusion,
  ValueState,
} from '../domain/types';
import { COMPONENT_LABEL, UNCALCULATED_COMPONENTS, valueOf } from '../domain/types';
import { TOLERANCE_DISCLAIMER } from './config';
import { computeOffer, currentYearComponentAmount, type OfferResult } from './offer';
import { formatIsoDateLong } from './dates';

export type Verdict = 'matches' | 'difference-requires-review' | 'cannot-verify';

export const VERDICT_LABEL: Record<Verdict, string> = {
  matches: 'Matches within the stated tolerance',
  'difference-requires-review': 'Difference requiring review',
  'cannot-verify': 'Cannot verify',
};

export type ComponentLine = {
  readonly component: ComponentId;
  readonly label: string;
  readonly amount: ValueState<Money> | undefined;
};

export type Reconciliation = {
  /** The offer this claim was checked against. */
  readonly offerId: OfferId;
  readonly offerLabel: string;
  readonly claimId: string;
  readonly claimLabel: string;
  readonly verdict: Verdict;
  readonly verdictLabel: string;
  /** Why verification was refused. Present only for 'cannot-verify'. */
  readonly refusalReason?: string;
  readonly statedAmount: ValueState<Money>;
  readonly calculatedAmount: ValueState<Money>;
  /** Signed: stated − calculated. Always shown when computable. */
  readonly difference: ValueState<Money>;
  readonly claimedComponents: readonly ComponentId[];
  readonly componentLines: readonly ComponentLine[];
  readonly toleranceDescription: string;
  readonly toleranceDisclaimer: string;
  readonly periodDescription: string;
  readonly steps: readonly CalcStep[];
  readonly assumptions: readonly string[];
  readonly exclusions: readonly Exclusion[];
  readonly documentLabel?: string;
  readonly documentText?: string;
};

export function describeTolerance(tolerance: Tolerance): string {
  return tolerance.kind === 'absolute'
    ? `${formatUSD(tolerance.amount)} absolute difference`
    : `${tolerance.percent}% of the calculated amount`;
}

function toleranceAmount(tolerance: Tolerance, calculated: Money): Money {
  return tolerance.kind === 'absolute'
    ? tolerance.amount
    : absMoney(multiplyByRate(calculated, new Decimal(tolerance.percent).div(100)));
}

export function checkStatedCost(
  dataset: Dataset,
  claim: StatedCostClaim,
  offerId: OfferId,
): Reconciliation {
  const offerResult = computeOffer(dataset, offerId);
  const fy = dataset.fiscalYear;

  const componentLines: ComponentLine[] = claim.claimedComponents.map((component) => ({
    component,
    label: COMPONENT_LABEL[component],
    amount: currentYearComponentAmount(offerResult, component),
  }));

  const base = {
    offerId,
    offerLabel: offerResult.label,
    claimId: claim.id,
    claimLabel: claim.label,
    statedAmount: claim.statedAmount.state,
    claimedComponents: claim.claimedComponents,
    componentLines,
    toleranceDescription: describeTolerance(claim.tolerance),
    toleranceDisclaimer: TOLERANCE_DISCLAIMER,
    periodDescription: `${formatIsoDateLong(claim.periodStart)} to ${formatIsoDateLong(claim.periodEnd)}`,
    assumptions: offerResult.assumptions,
    exclusions: offerResult.exclusions,
    documentLabel: claim.documentLabel,
    documentText: claim.documentText,
  };

  const cannotVerify = (reason: string, steps: CalcStep[] = []): Reconciliation => ({
    ...base,
    verdict: 'cannot-verify',
    verdictLabel: VERDICT_LABEL['cannot-verify'],
    refusalReason: reason,
    calculatedAmount: { kind: 'missing' },
    difference: { kind: 'missing' },
    steps,
  });

  // ---- Scope gate, before any arithmetic ----

  if (claim.claimedComponents.length === 0) {
    return cannotVerify(
      'The claim does not say which components it covers, so there is no scope to compare against.',
    );
  }

  if (claim.claimedComponents.includes('total-payroll')) {
    return cannotVerify(
      'The claim is stated as total payroll. Total payroll is not an incremental-cost scope, ' +
        'so comparing it against an increase over the baseline would be comparing unlike figures.',
    );
  }

  if (claim.periodStart !== fy.start || claim.periodEnd !== fy.end) {
    return cannotVerify(
      `The claim covers ${formatIsoDateLong(claim.periodStart)} to ` +
        `${formatIsoDateLong(claim.periodEnd)}, but the dataset fiscal year is ` +
        `${formatIsoDateLong(fy.start)} to ${formatIsoDateLong(fy.end)}. The periods differ, ` +
        'so the scopes are not comparable.',
    );
  }

  const uncalculated = claim.claimedComponents.filter((c) =>
    UNCALCULATED_COMPONENTS.includes(c),
  );
  if (uncalculated.length > 0) {
    return cannotVerify(
      `The claim includes ${uncalculated.map((c) => COMPONENT_LABEL[c]).join(', ')}, which this ` +
        'prototype does not calculate. No rate was supplied for those and none is assumed, so the ' +
        'claimed scope cannot be reproduced.',
    );
  }

  const stated = valueOf(claim.statedAmount);
  if (stated === undefined) {
    return cannotVerify('No stated amount was entered.');
  }

  // ---- Required inputs for the matched scope ----
  // A claimed component that is missing, unknown or excluded has no calculated
  // amount to compare against. An excluded component in particular must not be
  // read as $0: "not calculated" and "calculated as zero" are different claims,
  // and treating one as the other could report a match that was never measured.
  const gapped = componentLines.filter(
    (line) =>
      line.amount === undefined || line.amount.kind === 'missing' || line.amount.kind === 'unknown',
  );
  if (gapped.length > 0) {
    return cannotVerify(
      `The calculation for ${gapped.map((l) => l.label).join(', ')} is not available ` +
        'because required inputs are missing or unknown. A figure is not produced from a gap.',
    );
  }

  const excludedLines = componentLines.filter((line) => line.amount?.kind === 'excluded');
  if (excludedLines.length > 0) {
    const reasons = excludedLines
      .map((l) => (l.amount?.kind === 'excluded' ? `${l.label}: ${l.amount.reason}` : l.label))
      .join('; ');
    return cannotVerify(
      `${excludedLines.map((l) => l.label).join(', ')} ` +
        `${excludedLines.length === 1 ? 'is' : 'are'} excluded from this calculation (${reasons}), ` +
        'so the claimed scope cannot be reproduced. An excluded component is not the same as $0.',
    );
  }

  // ---- Arithmetic, only now ----
  let calculated: Money = ZERO_MONEY;
  const steps: CalcStep[] = [];

  for (const line of componentLines) {
    const amount = line.amount;
    if (!amount) continue;
    if (amount.kind === 'known') {
      calculated = add(calculated, amount.value);
      steps.push({
        label: line.label,
        formula: 'Calculated for the claimed fiscal period from the shared engine',
        result: formatUSD(amount.value),
      });
    }
  }

  const difference = subtract(stated, calculated);
  const allowance = toleranceAmount(claim.tolerance, calculated);
  const withinTolerance = compareMoney(absMoney(difference), allowance) <= 0;

  steps.push({
    label: 'Calculated amount for the claimed scope',
    formula: componentLines.map((l) => l.label).join(' + '),
    result: formatUSD(calculated),
  });
  steps.push({
    label: 'Stated amount',
    formula: claim.documentLabel ? `As stated in ${claim.documentLabel}` : 'As entered',
    result: formatUSD(stated),
    provenance: claim.statedAmount.provenance,
    sourceLabel: claim.statedAmount.sourceLabel,
    agreementPassage: claim.statedAmount.agreementPassage,
    originalSource: claim.statedAmount.originalSource,
  });
  steps.push({
    label: 'Difference (stated − calculated)',
    formula: `${formatUSD(stated)} − ${formatUSD(calculated)}`,
    result: formatSignedUSD(difference),
  });
  steps.push({
    label: 'Tolerance applied',
    formula: describeTolerance(claim.tolerance),
    result: withinTolerance ? 'Within tolerance' : 'Outside tolerance',
  });

  return {
    ...base,
    verdict: withinTolerance ? 'matches' : 'difference-requires-review',
    verdictLabel: withinTolerance
      ? VERDICT_LABEL.matches
      : VERDICT_LABEL['difference-requires-review'],
    calculatedAmount: { kind: 'known', value: calculated },
    difference: { kind: 'known', value: difference },
    steps,
  };
}

export type { OfferResult };
