/**
 * Prototype defaults, recorded explicitly.
 *
 * Every value here is a demonstration default for a prototype. None of them is
 * an industry standard, an audit standard, a statistical anomaly test, or a
 * legally verified rule. They are all user-editable in the interface and are
 * stated wherever they affect a result.
 */
import { fromDollars, type Money } from '../money/money';

export type ReviewThresholds = {
  /**
   * Percent increase in monthly overtime hours against the immediately
   * preceding complete month that raises a "Needs review" flag.
   */
  readonly hoursIncreasePercent: number;
  /**
   * Percent change in effective overtime hourly cost against the immediately
   * preceding complete month that raises a flag.
   */
  readonly effectiveHourlyCostChangePercent: number;
  /** Whether to flag months whose spending exceeds the entered budget. */
  readonly flagBudgetOverage: boolean;
};

export const DEFAULT_REVIEW_THRESHOLDS: ReviewThresholds = {
  hoursIncreasePercent: 25,
  effectiveHourlyCostChangePercent: 15,
  flagBudgetOverage: true,
};

export const REVIEW_THRESHOLD_DISCLAIMER =
  'Demonstration threshold for a prototype. Not an industry standard and not a ' +
  'statistical anomaly detector. Flags indicate a pattern a person should look ' +
  'at; they do not indicate a cause, a finding, or any conclusion about conduct.';

export const HOURS_COMPARISON_BASIS = 'the immediately preceding complete month';

/** Default reconciliation tolerance for the stated-cost check. */
export const DEFAULT_TOLERANCE_AMOUNT: Money = fromDollars('1.00');

export const TOLERANCE_DISCLAIMER =
  'Prototype reconciliation tolerance, editable above. Not an audit standard. ' +
  'The signed difference is always shown in full, whatever the tolerance.';

/** Cost categories this prototype does not calculate, and will not guess. */
export const STANDARD_EXCLUSIONS: readonly { category: string; reason: string }[] = [
  {
    category: 'Employer payroll taxes',
    reason: 'Outside this demo’s scope. The synthetic dataset covers salary, bonuses and overtime; employer taxes would require additional employee information and calculation rules.',
  },
  {
    category: 'Pension and retirement contributions',
    reason: 'Outside this demo’s scope. Pension costs would require employee retirement-plan information and contribution rules beyond this synthetic pay dataset.',
  },
  {
    category: 'Health and other benefits',
    reason: 'Outside this demo’s scope. Benefit costs would require employee coverage information and employer cost rules beyond this synthetic pay dataset.',
  },
  {
    category: 'Headcount and staffing changes',
    reason: 'The cohort is held constant. Staffing changes are not modeled.',
  },
  {
    category: 'Step and grade progression',
    reason: 'Within-grade progression is not modeled in this prototype.',
  },
];

export const OVERTIME_BASIS_DISCLAIMER =
  'Modeled overtime hours are an explicit assumption you enter, not a forecast ' +
  'derived from the history below. Overtime eligibility and rate rules are not ' +
  'legally verified by this tool.';
