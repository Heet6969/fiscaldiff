/**
 * The single dataset all three views read from.
 *
 * There is exactly one of these in the application at a time. Every figure in
 * every view is derived from it through the engine, which is what stops the
 * three views from disagreeing with each other.
 */
import type { Money } from '../money/money';
import type { FiscalYear } from '../engine/fiscalCalendar';
import type { ComponentId, Input, IsoDate, YearMonth } from './types';

export type Employee = {
  readonly id: string;
  readonly role: string;
  readonly gradeStep: string;
  readonly annualBaseSalary: Input<Money>;
  readonly scheduledHoursPerWeek: Input<number>;
  readonly weeksPerYear: Input<number>;
  readonly overtimeEligible: boolean;
  /** Explicit eligibility. Never inferred from anything else. */
  readonly bonusEligible: boolean;
};

/**
 * How an overtime rate is established.
 *
 * `derived` rises with a base-pay raise, because it is computed from hourly
 * base pay. `independent` is a separately confirmed rate and is held flat: it
 * is not escalated without a confirmed contractual rule.
 */
export type OvertimeRateBasis =
  | { readonly kind: 'derived'; readonly multiplier: Input<number> }
  | { readonly kind: 'independent'; readonly confirmedRate: Input<Money> };

export type OvertimeModel =
  | { readonly kind: 'excluded'; readonly reason: string }
  | {
      readonly kind: 'modeled';
      /** Modeled hours per month, department-wide. Not a forecast. */
      readonly monthlyHours: Input<number>;
      readonly rate: OvertimeRateBasis;
    };

export type AdjustmentDirection = 'increase' | 'decrease';

/**
 * One row of a counterproposal's base-pay changes. The percentage is entered as
 * a nonnegative number and the direction carries the sign.
 */
export type BasePayAdjustment = {
  readonly id: string;
  readonly direction: AdjustmentDirection;
  /** Nonnegative percent, e.g. 3 for 3%. Missing or invalid blocks results. */
  readonly percent: Input<number>;
};

export type Offer = {
  readonly id: 'A' | 'B';
  readonly label: string;
  /**
   * Percent, e.g. 3 for a 3% raise. Used when `adjustments` is absent (Offer A).
   * Ignored when `adjustments` is present: the net of those rows is used instead.
   */
  readonly basePayRaisePercent: Input<number>;
  /**
   * Repeatable increase/decrease rows (Offer B). Their signed percentages are
   * summed once, then applied to each employee's original salary; they are not
   * compounded. An empty list is an explicit 0% change.
   */
  readonly adjustments?: readonly BasePayAdjustment[];
  readonly raiseEffectiveDate: Input<IsoDate>;
  readonly oneTimeBonusPerEmployee: Input<Money>;
  readonly bonusPaymentDate: Input<IsoDate>;
  readonly overtime: OvertimeModel;
};

export type OvertimeRecord = {
  readonly month: YearMonth;
  readonly hours: Input<number>;
  readonly dollars: Input<Money>;
  readonly budgetDollars?: Input<Money>;
};

export type Comparator = {
  readonly id: string;
  readonly municipality: string;
  readonly role: string;
  readonly gradeStep: string;
  readonly effectiveDate: Input<IsoDate>;
  readonly scheduledHoursPerWeek: Input<number>;
  readonly payBasis: 'annual' | 'hourly';
  readonly statedPay: Input<Money>;
};

export type Tolerance =
  | { readonly kind: 'absolute'; readonly amount: Money }
  | { readonly kind: 'percent'; readonly percent: number };

export type StatedCostClaim = {
  readonly id: string;
  readonly label: string;
  readonly statedAmount: Input<Money>;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly claimedComponents: readonly ComponentId[];
  readonly tolerance: Tolerance;
  readonly documentLabel?: string;
  readonly documentText?: string;
};

export type Department = {
  readonly id: string;
  readonly name: string;
};

export type Dataset = {
  readonly meta: {
    readonly isSynthetic: true;
    readonly label: string;
    readonly generatedFrom: string;
  };
  readonly fiscalYear: FiscalYear;
  readonly department: Department;
  readonly employees: readonly Employee[];
  /** The overtime position the offers are measured against. */
  readonly baselineOvertime: OvertimeModel;
  /** 24 complete months of history. Used for review, never extrapolated. */
  readonly overtimeRecords: readonly OvertimeRecord[];
  readonly overtimeMonthlyBudget?: Input<Money>;
  readonly workforceBudget?: Input<Money>;
  readonly offers: { readonly A: Offer; readonly B: Offer };
  readonly comparators: readonly Comparator[];
  readonly statedCosts: readonly StatedCostClaim[];
};

export type OfferId = 'A' | 'B';
