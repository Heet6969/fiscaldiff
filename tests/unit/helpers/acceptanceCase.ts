/**
 * Builds the exact synthetic case required by the specification, as records.
 * Expected figures live in the tests, not here.
 */
import { fromDollars } from '../../../src/money/money';
import type { Dataset, Employee, StatedCostClaim } from '../../../src/domain/dataset';
import { known } from '../../../src/domain/types';
import { DEFAULT_TOLERANCE_AMOUNT } from '../../../src/engine/config';

export const ACCEPTANCE_FISCAL_YEAR = {
  start: '2026-07-01',
  end: '2027-06-30',
  label: 'FY2027 (July 1, 2026 – June 30, 2027)',
} as const;

export function buildAcceptanceEmployees(count = 50, salary = '60000'): Employee[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ACC-${String(i + 1).padStart(3, '0')}`,
    role: 'Test Cohort Member',
    gradeStep: 'N/A',
    annualBaseSalary: known(fromDollars(salary), 'synthetic-sample'),
    scheduledHoursPerWeek: known(40, 'user-assumption'),
    weeksPerYear: known(52, 'user-assumption'),
    overtimeEligible: true,
    bonusEligible: true,
  }));
}

export function buildAcceptanceDataset(): Dataset {
  const excludedOvertime = {
    kind: 'excluded' as const,
    reason: 'Overtime is explicitly excluded from this test case.',
  };

  return {
    meta: {
      isSynthetic: true,
      label: 'Synthetic acceptance case',
      generatedFrom: 'Specification requirement 2.10',
    },
    fiscalYear: ACCEPTANCE_FISCAL_YEAR,
    department: { id: 'ACC', name: 'Acceptance test cohort (synthetic)' },
    employees: buildAcceptanceEmployees(),
    baselineOvertime: excludedOvertime,
    overtimeRecords: [],
    offers: {
      A: {
        id: 'A',
        label: 'Acceptance offer',
        basePayRaisePercent: known(3, 'synthetic-sample'),
        raiseEffectiveDate: known('2027-01-01', 'synthetic-sample'),
        oneTimeBonusPerEmployee: known(fromDollars('500'), 'synthetic-sample'),
        bonusPaymentDate: known('2026-12-18', 'synthetic-sample'),
        overtime: excludedOvertime,
      },
      B: {
        id: 'B',
        label: 'Unused in this case',
        basePayRaisePercent: known(0, 'synthetic-sample'),
        raiseEffectiveDate: known('2026-07-01', 'synthetic-sample'),
        oneTimeBonusPerEmployee: known(fromDollars('0'), 'synthetic-sample'),
        bonusPaymentDate: known('2026-07-01', 'synthetic-sample'),
        overtime: excludedOvertime,
      },
    },
    comparators: [],
    statedCosts: [ACCEPTANCE_CLAIM],
  };
}

export const ACCEPTANCE_CLAIM: StatedCostClaim = {
  id: 'ACC-CLAIM-1',
  label: 'Synthetic fiscal note claiming $45,000 for the raise and the bonus',
  statedAmount: known(fromDollars('45000'), 'synthetic-sample'),
  periodStart: ACCEPTANCE_FISCAL_YEAR.start,
  periodEnd: ACCEPTANCE_FISCAL_YEAR.end,
  claimedComponents: ['base-pay-increment', 'one-time-bonus'],
  tolerance: { kind: 'absolute', amount: DEFAULT_TOLERANCE_AMOUNT },
};
