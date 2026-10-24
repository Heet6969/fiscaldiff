/**
 * Offer cost: what a proposal adds on top of the baseline.
 *
 * Rounding happens only at per-employee, per-component leaves. Every total
 * above those leaves is exact bigint summation, so the displayed parts always
 * add up to the displayed total.
 *
 * Overtime is computed as a single (cost under offer − cost under baseline)
 * subtraction. That is what prevents a simultaneous rate change and hours
 * change from being counted twice.
 */
import {
  Decimal,
  ZERO_MONEY,
  add,
  formatUSD,
  fromCents,
  multiplyByCount,
  multiplyByRate,
  roundHalfUpToBigInt,
  subtract,
  type Money,
} from '../money/money';
import type { Dataset, Offer, OfferId } from '../domain/dataset';
import type {
  CalcStep,
  Completeness,
  ComponentId,
  Exclusion,
  IsoDate,
  ValueState,
} from '../domain/types';
import { valueOf } from '../domain/types';
import {
  MISSING_STATE,
  blocksCompleteness,
  excludedState,
  knownState,
  sumStates,
} from '../domain/valueState';
import { STANDARD_EXCLUSIONS } from './config';
import { computeBaseline, overtimeHourlyRate, type BaselineResult } from './baseline';
import {
  PRORATION_CONVENTION,
  isWithinFiscalYear,
  prorationExplanation,
  prorationFactor,
  type FiscalYear,
} from './fiscalCalendar';
import { formatIsoDateLong } from './dates';
import {
  ADJUSTMENT_BASIS_NOTE,
  ADJUSTMENT_SOURCE_LABEL,
  formatSignedPercent,
  netBasePayChange,
} from './adjustments';

export type OfferResult = {
  readonly offerId: OfferId;
  readonly label: string;
  readonly fiscalYear: FiscalYear;
  readonly baseline: BaselineResult;

  readonly prorationFactor: ValueState<Decimal>;
  readonly prorationNote: string;

  readonly currentYearBasePayIncrement: ValueState<Money>;
  readonly annualizedBasePayIncrease: ValueState<Money>;
  readonly oneTimeCost: ValueState<Money>;
  readonly currentYearOvertimeIncrement: ValueState<Money>;
  readonly annualizedOvertimeIncrease: ValueState<Money>;

  readonly currentYearTotalIncremental: ValueState<Money>;
  readonly annualizedRecurringIncrease: ValueState<Money>;
  readonly baselineTotalCost: ValueState<Money>;
  readonly totalProposedExpenditure: ValueState<Money>;

  readonly completeness: Completeness;
  readonly exclusions: readonly Exclusion[];
  readonly steps: readonly CalcStep[];
  readonly warnings: readonly string[];
  readonly assumptions: readonly string[];
};

export function computeOffer(dataset: Dataset, offerId: OfferId): OfferResult {
  const offer = dataset.offers[offerId];
  const baseline = computeBaseline(dataset);
  const fy = dataset.fiscalYear;

  const absent: string[] = [...baseline.absentInputs];
  const steps: CalcStep[] = [...baseline.steps];
  const warnings: string[] = [];
  const assumptions: string[] = [PRORATION_CONVENTION];

  // ---- Proration factor ----
  const effectiveDate = valueOf(offer.raiseEffectiveDate);
  // The net base-pay change, computed once. Offer A has one percentage; Offer B
  // may have several increase/decrease rows. Everything below reads the net, so
  // base pay, derived overtime and the audit trail cannot use different numbers.
  const change = netBasePayChange(offer);
  const raisedOffer: Offer = { ...offer, basePayRaisePercent: change.input };
  const raisePercent = valueOf(change.input);
  absent.push(...change.problems);
  if (change.usesRows) assumptions.push(ADJUSTMENT_BASIS_NOTE);

  let factor: ValueState<Decimal>;
  let prorationNote: string;

  if (effectiveDate === undefined) {
    if (raisePercent !== undefined && raisePercent !== 0) {
      factor = MISSING_STATE;
      prorationNote = 'No effective date entered, so the raise cannot be placed in the fiscal year.';
      absent.push('Raise effective date');
    } else {
      // No raise, so the date does not matter.
      factor = knownState(new Decimal(0));
      prorationNote = 'No base-pay raise entered.';
    }
  } else {
    factor = knownState(prorationFactor(effectiveDate, fy));
    prorationNote = prorationExplanation(effectiveDate, fy);
    if (!isWithinFiscalYear(effectiveDate, fy)) {
      warnings.push(
        `The raise effective date ${formatIsoDateLong(effectiveDate)} falls outside fiscal year ` +
          `${fy.label}. The annualized recurring increase is still shown; the current-year ` +
          `figure reflects only the part that falls inside the year.`,
      );
    }
  }

  // ---- Base pay ----
  const basePay = computeBasePayIncrements(dataset, raisedOffer, factor);
  // When rows are the reason, say which; the generic line would only repeat it.
  absent.push(
    ...basePay.absent.filter(
      (item) => !(change.problems.length > 0 && item === 'Base-pay raise percentage'),
    ),
  );
  if (change.usesRows) {
    steps.push({
      label: 'Net base-pay change',
      formula: `${change.summary}. ${ADJUSTMENT_BASIS_NOTE}`,
      result:
        change.input.state.kind === 'known'
          ? formatSignedPercent(new Decimal(change.input.state.value))
          : 'Not available',
      provenance: 'user-assumption',
      sourceLabel: ADJUSTMENT_SOURCE_LABEL,
    });
  }
  steps.push(...basePay.steps);

  // ---- One-time bonus ----
  const bonus = computeOneTimeCost(dataset, offer, fy);
  absent.push(...bonus.absent);
  steps.push(...bonus.steps);
  warnings.push(...bonus.warnings);

  // ---- Overtime ----
  const overtime = computeOvertimeIncrements(dataset, raisedOffer, baseline, factor, raisePercent);
  absent.push(...overtime.absent);
  steps.push(...overtime.steps);
  warnings.push(...overtime.warnings);
  assumptions.push(...overtime.assumptions);

  // ---- Totals ----
  const currentYearTotalIncremental = sumStates(
    [basePay.currentYear, bonus.amount, overtime.currentYear],
    ZERO_MONEY,
    (a, b) => add(a, b),
  );

  // One-time amounts are deliberately absent here.
  const annualizedRecurringIncrease = sumStates(
    [basePay.annualized, overtime.annualized],
    ZERO_MONEY,
    (a, b) => add(a, b),
  );

  const baselineTotalCost = sumStates(
    [baseline.annualBasePay, baseline.annualOvertimeCost],
    ZERO_MONEY,
    (a, b) => add(a, b),
  );

  const totalProposedExpenditure =
    baselineTotalCost.kind === 'known' && currentYearTotalIncremental.kind === 'known'
      ? knownState(add(baselineTotalCost.value, currentYearTotalIncremental.value))
      : MISSING_STATE;

  if (currentYearTotalIncremental.kind === 'known') {
    steps.push({
      label: 'Current fiscal-year incremental cost',
      formula: 'Base-pay increase + one-time cost + overtime increase',
      result: formatUSD(currentYearTotalIncremental.value),
    });
  }
  if (annualizedRecurringIncrease.kind === 'known') {
    steps.push({
      label: 'Annualized recurring increase',
      formula: 'Full-year base-pay increase + full-year overtime increase (one-time amounts excluded)',
      result: formatUSD(annualizedRecurringIncrease.value),
    });
  }

  const uniqueAbsent = [...new Set(absent)];
  const completeness = determineCompleteness(
    currentYearTotalIncremental,
    [basePay.currentYear, bonus.amount, overtime.currentYear],
    uniqueAbsent,
  );

  return {
    offerId,
    label: offer.label,
    fiscalYear: fy,
    baseline,
    prorationFactor: factor,
    prorationNote,
    currentYearBasePayIncrement: basePay.currentYear,
    annualizedBasePayIncrease: basePay.annualized,
    oneTimeCost: bonus.amount,
    currentYearOvertimeIncrement: overtime.currentYear,
    annualizedOvertimeIncrease: overtime.annualized,
    currentYearTotalIncremental,
    annualizedRecurringIncrease,
    baselineTotalCost,
    totalProposedExpenditure,
    completeness,
    exclusions: buildExclusions(dataset, offer),
    steps,
    warnings,
    assumptions,
  };
}

function determineCompleteness(
  total: ValueState<Money>,
  components: readonly ValueState<Money>[],
  absentInputs: readonly string[],
): Completeness {
  if (total.kind === 'known') return { kind: 'complete' };
  const anyKnown = components.some((c) => c.kind === 'known' || c.kind === 'excluded');
  return anyKnown
    ? { kind: 'partial', absentInputs }
    : { kind: 'refused', absentInputs };
}

function buildExclusions(dataset: Dataset, offer: Offer): Exclusion[] {
  const list: Exclusion[] = [...STANDARD_EXCLUSIONS];

  // Only the overtime *increase* can be excluded here. Baseline overtime, when
  // it is modeled, is part of the baseline and total figures and is shown in
  // the baseline summary, so claiming it is excluded would be wrong.
  if (offer.overtime.kind === 'excluded') {
    list.unshift({ category: 'Overtime increase', reason: offer.overtime.reason });
  } else if (dataset.baselineOvertime.kind === 'excluded') {
    list.unshift({ category: 'Overtime increase', reason: dataset.baselineOvertime.reason });
  }
  return list;
}

// ---------------------------------------------------------------------------
// Base pay
// ---------------------------------------------------------------------------

function computeBasePayIncrements(
  dataset: Dataset,
  offer: Offer,
  factor: ValueState<Decimal>,
): {
  currentYear: ValueState<Money>;
  annualized: ValueState<Money>;
  absent: string[];
  steps: CalcStep[];
} {
  const absent: string[] = [];
  const steps: CalcStep[] = [];
  const percent = valueOf(offer.basePayRaisePercent);

  if (percent === undefined) {
    if (blocksCompleteness(offer.basePayRaisePercent.state)) {
      absent.push('Base-pay raise percentage');
    }
    const state = offer.basePayRaisePercent.state as ValueState<Money>;
    return { currentYear: state, annualized: state, absent, steps };
  }

  const rate = new Decimal(percent).div(100);

  let annualizedTotal: Money = ZERO_MONEY;
  let currentYearTotal: Money = ZERO_MONEY;
  let blocked = false;

  for (const e of dataset.employees) {
    const salary = valueOf(e.annualBaseSalary);
    if (salary === undefined) {
      blocked = true;
      continue;
    }
    // Leaf rounding: the new salary is a real per-employee amount.
    const newSalary = multiplyByRate(salary, rate.plus(1));
    const annualIncrement = subtract(newSalary, salary);
    annualizedTotal = add(annualizedTotal, annualIncrement);

    if (factor.kind === 'known') {
      currentYearTotal = add(currentYearTotal, multiplyByRate(annualIncrement, factor.value));
    }
  }

  if (blocked) absent.push('Annual base salary for one or more employees');

  const annualized: ValueState<Money> = blocked ? MISSING_STATE : knownState(annualizedTotal);
  const currentYear: ValueState<Money> =
    blocked || factor.kind !== 'known'
      ? blocked
        ? MISSING_STATE
        : (factor as ValueState<Money>)
      : knownState(currentYearTotal);

  if (annualized.kind === 'known') {
    steps.push({
      label: 'Annualized base-pay increase',
      formula:
        `For each employee: round(annual salary × (1 ${percent < 0 ? '−' : '+'} ${Math.abs(percent)}%)) − annual salary, summed ` +
        `across ${dataset.employees.length} employees`,
      result: formatUSD(annualized.value),
      provenance: offer.basePayRaisePercent.provenance,
      sourceLabel: offer.basePayRaisePercent.sourceLabel,
      agreementPassage: offer.basePayRaisePercent.agreementPassage,
      originalSource: offer.basePayRaisePercent.originalSource,
    });
  }
  if (currentYear.kind === 'known' && factor.kind === 'known') {
    steps.push({
      label: 'Current fiscal-year base-pay increase',
      formula: `Per-employee annual increase × proration factor ${factor.value.toFixed(6)}, summed`,
      result: formatUSD(currentYear.value),
    });
  }

  return { currentYear, annualized, absent, steps };
}

// ---------------------------------------------------------------------------
// One-time bonus
// ---------------------------------------------------------------------------

function computeOneTimeCost(
  dataset: Dataset,
  offer: Offer,
  fy: FiscalYear,
): {
  amount: ValueState<Money>;
  absent: string[];
  steps: CalcStep[];
  warnings: string[];
} {
  const absent: string[] = [];
  const steps: CalcStep[] = [];
  const warnings: string[] = [];

  const perEmployee = valueOf(offer.oneTimeBonusPerEmployee);
  if (perEmployee === undefined) {
    if (blocksCompleteness(offer.oneTimeBonusPerEmployee.state)) {
      absent.push('One-time bonus amount');
    }
    return {
      amount: offer.oneTimeBonusPerEmployee.state as ValueState<Money>,
      absent,
      steps,
      warnings,
    };
  }

  if (perEmployee.cents === 0n) {
    return { amount: knownState(ZERO_MONEY), absent, steps, warnings };
  }

  // A non-zero bonus needs a payment date before it can be attributed to a
  // fiscal period. We do not guess one.
  const paymentDate = valueOf(offer.bonusPaymentDate);
  if (paymentDate === undefined) {
    absent.push('Bonus payment date');
    return { amount: MISSING_STATE, absent, steps, warnings };
  }

  const eligible = dataset.employees.filter((e) => e.bonusEligible);

  if (!isWithinFiscalYear(paymentDate, fy)) {
    warnings.push(
      `The bonus payment date ${formatIsoDateLong(paymentDate)} is outside fiscal year ` +
        `${fy.label}, so no one-time cost is charged to this year.`,
    );
    steps.push({
      label: 'One-time bonus',
      formula: `Payment date ${paymentDate} falls outside ${fy.label}`,
      result: formatUSD(ZERO_MONEY),
    });
    return { amount: knownState(ZERO_MONEY), absent, steps, warnings };
  }

  if (eligible.length === 0) {
    warnings.push(
      'No employee in the cohort is marked bonus-eligible, so no one-time cost is charged. ' +
        'Eligibility must be stated explicitly; it is not inferred.',
    );
  }

  const total = multiplyByCount(perEmployee, eligible.length);

  steps.push({
    label: 'One-time bonus',
    formula:
      `${formatUSD(perEmployee)} × ${eligible.length} explicitly bonus-eligible employees, ` +
      `payment date ${paymentDate} inside ${fy.label}`,
    result: formatUSD(total),
    provenance: offer.oneTimeBonusPerEmployee.provenance,
    sourceLabel: offer.oneTimeBonusPerEmployee.sourceLabel,
    agreementPassage: offer.oneTimeBonusPerEmployee.agreementPassage,
    originalSource: offer.oneTimeBonusPerEmployee.originalSource,
  });

  return { amount: knownState(total), absent, steps, warnings };
}

// ---------------------------------------------------------------------------
// Overtime
// ---------------------------------------------------------------------------

function computeOvertimeIncrements(
  dataset: Dataset,
  offer: Offer,
  baseline: BaselineResult,
  factor: ValueState<Decimal>,
  raisePercent: number | undefined,
): {
  currentYear: ValueState<Money>;
  annualized: ValueState<Money>;
  absent: string[];
  steps: CalcStep[];
  warnings: string[];
  assumptions: string[];
} {
  const absent: string[] = [];
  const steps: CalcStep[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];

  const offerModel = offer.overtime;

  if (offerModel.kind === 'excluded') {
    const state = excludedState<Money>(offerModel.reason);
    return { currentYear: state, annualized: state, absent, steps, warnings, assumptions };
  }
  if (dataset.baselineOvertime.kind === 'excluded') {
    const state = excludedState<Money>(dataset.baselineOvertime.reason);
    return { currentYear: state, annualized: state, absent, steps, warnings, assumptions };
  }

  const baselineCost = baseline.annualOvertimeCost;
  if (baselineCost.kind !== 'known') {
    if (baselineCost.kind === 'excluded') {
      const state = excludedState<Money>(baselineCost.reason);
      return { currentYear: state, annualized: state, absent, steps, warnings, assumptions };
    }
    absent.push('Baseline overtime hours or rate');
    return {
      currentYear: baselineCost,
      annualized: baselineCost,
      absent,
      steps,
      warnings,
      assumptions,
    };
  }
  const baselineAnnualCost: Money = baselineCost.value;

  const hours = valueOf(offerModel.monthlyHours);
  if (hours === undefined) {
    absent.push('Modeled overtime hours per month');
    return {
      currentYear: offerModel.monthlyHours.state as ValueState<Money>,
      annualized: offerModel.monthlyHours.state as ValueState<Money>,
      absent,
      steps,
      warnings,
      assumptions,
    };
  }

  const annualHours = new Decimal(hours).times(12);

  // Pre-raise rate under the offer's own rate basis.
  const preRate = overtimeHourlyRate(offerModel, baseline.meanOvertimeEligibleHourlyCents);
  if (preRate.kind !== 'known') {
    if (blocksCompleteness(preRate)) absent.push('Overtime rate');
    return { currentYear: preRate, annualized: preRate, absent, steps, warnings, assumptions };
  }

  let postRate: Money = preRate.value;

  if (offerModel.rate.kind === 'derived') {
    // A derived rate rises with the base-pay raise, so the raise is an input to
    // it. If the raise is missing or unknown there is no basis for saying the
    // rate stays the same; carrying on with "unchanged" would present a gap as a
    // result. Block the dependent outputs and say which input is needed. (An
    // independently confirmed rate does not depend on the raise, so it is not
    // affected by this.)
    if (raisePercent === undefined) {
      const raiseState = offer.basePayRaisePercent.state as ValueState<Money>;
      if (raiseState.kind === 'missing' || raiseState.kind === 'unknown') {
        absent.push('Base-pay raise percentage (needed to apply the derived overtime rate change)');
      }
      return {
        currentYear: raiseState,
        annualized: raiseState,
        absent,
        steps,
        warnings,
        assumptions,
      };
    }

    const multiplier = valueOf(offerModel.rate.multiplier);
    const meanHourly = baseline.meanOvertimeEligibleHourlyCents;
    if (multiplier !== undefined && meanHourly.kind === 'known') {
      const raisedHourly = meanHourly.value.times(new Decimal(raisePercent).div(100).plus(1));
      postRate = fromCents(roundHalfUpToBigInt(raisedHourly.times(multiplier)));
    }
    assumptions.push(
      'The overtime rate is derived from hourly base pay, so it rises with the raise from the ' +
        'raise effective date onward, for the applicable part of the year only.',
    );
  } else {
    assumptions.push(
      'The overtime rate was entered as an independently confirmed rate, so it is held flat. ' +
        'It is not escalated by the base-pay raise without a confirmed contractual rule.',
    );
  }

  // Cost under the offer, current year: the pre-raise rate for the whole year,
  // plus the rate uplift for the applicable portion only.
  const preRateAnnualCost = multiplyByRate(preRate.value, annualHours);
  const rateUplift = subtract(postRate, preRate.value);

  // The annualized figure is a full year at the post-raise rate, so it does not
  // depend on the effective date and is available even when that date is absent.
  const offerAnnualizedCost = multiplyByRate(postRate, annualHours);
  const annualizedAmount = subtract(offerAnnualizedCost, baselineAnnualCost);
  const annualized = knownState(annualizedAmount);

  // The current-year figure does need the date, because the uplift only applies
  // from the effective date onward.
  let currentYear: ValueState<Money>;
  let offerCurrentYearCost: Money | undefined;

  if (rateUplift.cents === 0n) {
    offerCurrentYearCost = preRateAnnualCost;
    currentYear = knownState(subtract(preRateAnnualCost, baselineAnnualCost));
  } else if (factor.kind !== 'known') {
    absent.push('Raise effective date (needed to apply the derived overtime rate change)');
    currentYear = MISSING_STATE;
  } else {
    const upliftFull = multiplyByRate(rateUplift, annualHours);
    offerCurrentYearCost = add(preRateAnnualCost, multiplyByRate(upliftFull, factor.value));
    currentYear = knownState(subtract(offerCurrentYearCost, baselineAnnualCost));
  }

  steps.push({
    label: 'Overtime cost under this offer (full year at the new rate)',
    formula: `${formatUSD(postRate)}/hour × ${hours} hours/month × 12`,
    result: formatUSD(offerAnnualizedCost),
    provenance: offerModel.monthlyHours.provenance,
    sourceLabel: offerModel.monthlyHours.sourceLabel,
    originalSource: offerModel.monthlyHours.originalSource,
  });

  if (offerCurrentYearCost !== undefined && currentYear.kind === 'known') {
    steps.push({
      label: 'Overtime cost under this offer (current fiscal year)',
      formula:
        `${formatUSD(preRate.value)}/hour × ${hours} hours/month × 12` +
        (rateUplift.cents !== 0n && factor.kind === 'known'
          ? ` + rate uplift ${formatUSD(rateUplift)}/hour × ${annualHours.toString()} hours × ` +
            `proration ${factor.value.toFixed(6)}`
          : ''),
      result: formatUSD(offerCurrentYearCost),
    });
    steps.push({
      label: 'Overtime increase over baseline (current fiscal year)',
      formula: `${formatUSD(offerCurrentYearCost)} − baseline ${formatUSD(baselineAnnualCost)}`,
      result: formatUSD(currentYear.value),
    });
  }

  return { currentYear, annualized, absent, steps, warnings, assumptions };
}

// ---------------------------------------------------------------------------
// Component access, used by the stated-cost reconciliation
// ---------------------------------------------------------------------------

/** Current fiscal-year amount for one claimable component. */
export function currentYearComponentAmount(
  result: OfferResult,
  component: ComponentId,
): ValueState<Money> | undefined {
  switch (component) {
    case 'base-pay-increment':
      return result.currentYearBasePayIncrement;
    case 'one-time-bonus':
      return result.oneTimeCost;
    case 'overtime-increment':
      return result.currentYearOvertimeIncrement;
    default:
      return undefined;
  }
}

export type BudgetPosition = {
  readonly budget: Money;
  readonly totalRequired: Money;
  /** Positive is remaining, negative is a shortfall. */
  readonly remaining: Money;
  readonly isShortfall: boolean;
};

/**
 * Workforce budget position. Returns undefined when no budget was supplied —
 * the figure is omitted rather than a budget being assumed.
 */
export function computeBudgetPosition(
  dataset: Dataset,
  result: OfferResult,
): BudgetPosition | undefined {
  const budgetInput = dataset.workforceBudget;
  if (!budgetInput) return undefined;
  const budget = valueOf(budgetInput);
  if (budget === undefined) return undefined;
  if (result.totalProposedExpenditure.kind !== 'known') return undefined;

  const totalRequired = result.totalProposedExpenditure.value;
  const remaining = subtract(budget, totalRequired);
  return {
    budget,
    totalRequired,
    remaining,
    isShortfall: remaining.cents < 0n,
  };
}

/** Stress test over modeled overtime hours. Varies one stated assumption. */
export type StressRow = {
  readonly monthlyHours: number;
  readonly label: string;
  readonly overtimeIncrement: ValueState<Money>;
  readonly totalIncremental: ValueState<Money>;
};

export function overtimeStressTest(
  dataset: Dataset,
  offerId: OfferId,
  multipliers: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5],
): { readonly baseHours: number | undefined; readonly rows: readonly StressRow[] } {
  const offer = dataset.offers[offerId];
  const overtimeModel = offer.overtime;
  if (overtimeModel.kind === 'excluded') return { baseHours: undefined, rows: [] };
  const baseHours = valueOf(overtimeModel.monthlyHours);
  if (baseHours === undefined) return { baseHours: undefined, rows: [] };

  const rows: StressRow[] = multipliers.map((m) => {
    const monthlyHours = Math.round(baseHours * m * 100) / 100;
    const variant: Dataset = {
      ...dataset,
      offers: {
        ...dataset.offers,
        [offerId]: {
          ...offer,
          overtime: {
            ...overtimeModel,
            monthlyHours: {
              ...overtimeModel.monthlyHours,
              state: { kind: 'known', value: monthlyHours },
            },
          },
        },
      } as Dataset['offers'],
    };
    const r = computeOffer(variant, offerId);
    return {
      monthlyHours,
      label: `${Math.round(m * 100)}% of modeled hours`,
      overtimeIncrement: r.currentYearOvertimeIncrement,
      totalIncremental: r.currentYearTotalIncremental,
    };
  });

  return { baseHours, rows };
}

export type { IsoDate };
