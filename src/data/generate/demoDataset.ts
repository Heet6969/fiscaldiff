/**
 * The fictional demonstration dataset.
 *
 * Everything here is invented. The municipality, the department, the employees
 * and the comparison towns do not exist. No real municipal record, spreadsheet
 * or prior project data is used.
 *
 * The cohort is deliberately uniform — 50 employees at $60,000 — so that the
 * headline figures can be checked by hand against the documented acceptance
 * case. The figures are still computed by the engine from these records; none
 * of them is written down as a result anywhere.
 */
import { fromDollars, fromCents, Decimal, centsAsDecimal, roundHalfUpToBigInt } from '../../money/money';
import type {
  Comparator,
  Dataset,
  Employee,
  Offer,
  OvertimeRecord,
  StatedCostClaim,
} from '../../domain/dataset';
import { known } from '../../domain/types';
import { formatYearMonth, fromMonthIndex, monthIndex } from '../../engine/dates';
import { DEFAULT_TOLERANCE_AMOUNT } from '../../engine/config';
import { mulberry32, numberBetween } from './prng';

export const DEMO_SEED = 20260701;

export const SYNTHETIC_LABEL = 'Synthetic demo data';

const DEPARTMENT_NAME = 'Public Works — Township of Meadowbrook (fictional)';

const ROLES: readonly { role: string; gradeStep: string }[] = [
  { role: 'Equipment Operator', gradeStep: 'PW-4 / Step 3' },
  { role: 'Maintenance Technician', gradeStep: 'PW-5 / Step 2' },
  { role: 'Sanitation Worker', gradeStep: 'PW-3 / Step 4' },
  { role: 'Highway Maintainer', gradeStep: 'PW-4 / Step 1' },
  { role: 'Water Systems Technician', gradeStep: 'PW-6 / Step 2' },
];

const HEADCOUNT = 50;
const ANNUAL_SALARY = '60000';
const SCHEDULED_HOURS_PER_WEEK = 40;
const WEEKS_PER_YEAR = 52;

/** 2026-07-01 .. 2027-06-30. */
export const DEMO_FISCAL_YEAR = {
  start: '2026-07-01',
  end: '2027-06-30',
  label: 'FY2027 (July 1, 2026 – June 30, 2027)',
} as const;

/** 24 complete months ending the month before the fiscal year starts. */
const HISTORY_END = { y: 2026, m: 6 };
const HISTORY_MONTHS = 24;

function buildEmployees(): Employee[] {
  const employees: Employee[] = [];
  for (let i = 0; i < HEADCOUNT; i += 1) {
    const roleEntry = ROLES[i % ROLES.length] ?? ROLES[0];
    if (!roleEntry) throw new Error('Role table is empty');
    employees.push({
      id: `MDW-${String(i + 1).padStart(3, '0')}`,
      role: roleEntry.role,
      gradeStep: roleEntry.gradeStep,
      annualBaseSalary: known(fromDollars(ANNUAL_SALARY), 'synthetic-sample', {
        sourceLabel: 'Fictional cohort schedule, synthetic dataset',
      }),
      scheduledHoursPerWeek: known(SCHEDULED_HOURS_PER_WEEK, 'user-assumption', {
        sourceLabel: 'Dataset assumption: 40 scheduled hours per week',
      }),
      weeksPerYear: known(WEEKS_PER_YEAR, 'user-assumption', {
        sourceLabel: 'Dataset assumption: 52 weeks per year',
      }),
      overtimeEligible: true,
      // Eligibility is stated explicitly for every employee. It is never
      // inferred from role, grade or anything else.
      bonusEligible: true,
    });
  }
  return employees;
}

/**
 * 24 months of overtime history.
 *
 * Shaped to contain a plausible winter spike, which exists as a review example.
 * A spike is something a person should look at. It is not evidence of
 * wrongdoing, and nothing here suggests a cause.
 */
function buildOvertimeRecords(): OvertimeRecord[] {
  const rand = mulberry32(DEMO_SEED);
  const records: OvertimeRecord[] = [];

  const hourlyBase = centsAsDecimal(fromDollars(ANNUAL_SALARY)).div(
    SCHEDULED_HOURS_PER_WEEK * WEEKS_PER_YEAR,
  );
  const baseOtRateCents = hourlyBase.times(1.5);

  const endIndex = monthIndex(HISTORY_END.y, HISTORY_END.m);
  const startIndex = endIndex - (HISTORY_MONTHS - 1);

  for (let index = startIndex; index <= endIndex; index += 1) {
    const { y, m } = fromMonthIndex(index);
    const month = formatYearMonth(y, m);

    // Seasonal shape: winter months run higher.
    const winter = m === 12 || m === 1 || m === 2 || m === 3;
    const baseHours = winter ? 470 : 390;
    let hours = numberBetween(rand, baseHours - 35, baseHours + 35, 1);

    // One pronounced spike, as a review example.
    if (month === '2026-02') hours = 663.5;
    if (month === '2026-03') hours = 548.0;

    // Effective hourly cost drifts a little, and steps up once, so the
    // effective-hourly-cost flag has something real to find.
    const premium = month === '2026-02' || month === '2026-03' ? 1.19 : numberBetween(rand, 0.985, 1.03, 4);
    const dollarsCents = roundHalfUpToBigInt(baseOtRateCents.times(hours).times(premium));

    records.push({
      month,
      hours: known(hours, 'synthetic-sample', {
        sourceLabel: `Fictional overtime ledger, ${month}`,
      }),
      dollars: known(fromCents(dollarsCents), 'synthetic-sample', {
        sourceLabel: `Fictional overtime ledger, ${month}`,
      }),
    });
  }

  return records;
}

function buildOffers(): { A: Offer; B: Offer } {
  return {
    A: {
      id: 'A',
      label: 'Offer A — union request',
      basePayRaisePercent: known(3, 'source-supported', {
        sourceLabel: 'Fictional union proposal, Article 12 (synthetic)',
        agreementPassage:
          'Article 12.1 (fictional): "Effective January 1, 2027, base annual salary for all ' +
          'bargaining unit positions shall be increased by three percent (3%)."',
      }),
      raiseEffectiveDate: known('2027-01-01', 'source-supported', {
        sourceLabel: 'Fictional union proposal, Article 12 (synthetic)',
      }),
      oneTimeBonusPerEmployee: known(fromDollars('500'), 'source-supported', {
        sourceLabel: 'Fictional union proposal, Article 14 (synthetic)',
        agreementPassage:
          'Article 14.2 (fictional): "Each eligible employee shall receive a one-time ' +
          'ratification payment of five hundred dollars ($500), payable in December 2026."',
      }),
      bonusPaymentDate: known('2026-12-18', 'source-supported', {
        sourceLabel: 'Fictional union proposal, Article 14 (synthetic)',
      }),
      // Same hours and multiplier as the baseline. Because the rate is derived
      // from hourly base pay, it still rises with the raise from the effective
      // date, which is the behaviour worth seeing on the opening screen.
      overtime: {
        kind: 'modeled',
        monthlyHours: known(420, 'user-assumption', {
          sourceLabel: 'Entered assumption: 420 overtime hours per month, department-wide',
        }),
        rate: {
          kind: 'derived',
          multiplier: known(1.5, 'user-assumption', {
            sourceLabel: 'Entered assumption: overtime paid at 1.5 × hourly base pay',
          }),
        },
      },
    },
    B: {
      id: 'B',
      label: 'Offer B — alternative',
      basePayRaisePercent: known(2.5, 'user-assumption', {
        sourceLabel: 'Entered as a negotiating alternative',
      }),
      raiseEffectiveDate: known('2026-09-01', 'user-assumption', {
        sourceLabel: 'Entered as a negotiating alternative',
      }),
      oneTimeBonusPerEmployee: known(fromDollars('200'), 'user-assumption', {
        sourceLabel: 'Entered as a negotiating alternative',
      }),
      bonusPaymentDate: known('2026-10-30', 'user-assumption'),
      overtime: {
        kind: 'modeled',
        monthlyHours: known(420, 'user-assumption', {
          sourceLabel: 'Entered assumption: 420 overtime hours per month, department-wide',
        }),
        rate: {
          kind: 'derived',
          multiplier: known(1.5, 'user-assumption', {
            sourceLabel: 'Entered assumption: overtime paid at 1.5 × hourly base pay',
          }),
        },
      },
    },
  };
}

/**
 * Fictional comparison towns. Deliberately mixed: some rows do not share the
 * subject role, grade or pay basis, so the "not directly comparable" handling
 * has something real to mark.
 */
function buildComparators(): Comparator[] {
  return [
    {
      id: 'CMP-1',
      municipality: 'Ashford (fictional)',
      role: 'Equipment Operator',
      gradeStep: 'PW-4 / Step 3',
      effectiveDate: known('2026-07-01', 'synthetic-sample'),
      scheduledHoursPerWeek: known(40, 'synthetic-sample'),
      payBasis: 'annual',
      statedPay: known(fromDollars('61200'), 'synthetic-sample'),
    },
    {
      id: 'CMP-2',
      municipality: 'Brookline Falls (fictional)',
      role: 'Equipment Operator',
      gradeStep: 'PW-4 / Step 3',
      effectiveDate: known('2025-07-01', 'synthetic-sample'),
      scheduledHoursPerWeek: known(40, 'synthetic-sample'),
      payBasis: 'annual',
      statedPay: known(fromDollars('58900'), 'synthetic-sample'),
    },
    {
      id: 'CMP-3',
      municipality: 'Carrow (fictional)',
      role: 'Equipment Operator',
      gradeStep: 'PW-4 / Step 3',
      effectiveDate: known('2026-01-01', 'synthetic-sample'),
      scheduledHoursPerWeek: known(37.5, 'synthetic-sample'),
      payBasis: 'hourly',
      statedPay: known(fromDollars('30.75'), 'synthetic-sample'),
    },
    {
      id: 'CMP-4',
      municipality: 'Deerfield Commons (fictional)',
      role: 'Senior Equipment Operator',
      gradeStep: 'PW-6 / Step 1',
      effectiveDate: known('2026-07-01', 'synthetic-sample'),
      scheduledHoursPerWeek: known(40, 'synthetic-sample'),
      payBasis: 'annual',
      statedPay: known(fromDollars('67400'), 'synthetic-sample'),
    },
    {
      id: 'CMP-5',
      municipality: 'Eastvale (fictional)',
      role: 'Equipment Operator',
      gradeStep: 'PW-4 / Step 3',
      effectiveDate: known('2026-07-01', 'synthetic-sample'),
      scheduledHoursPerWeek: known(40, 'synthetic-sample'),
      payBasis: 'annual',
      statedPay: known(fromDollars('60500'), 'synthetic-sample'),
    },
  ];
}

/**
 * Three fiscal-note claims, chosen so all three verdicts are reachable from the
 * demonstration without any of them being hardcoded.
 */
function buildStatedCosts(): StatedCostClaim[] {
  return [
    {
      id: 'CLAIM-1',
      label: 'Fiscal note: "$45,000 for the raise and the ratification payment"',
      statedAmount: known(fromDollars('45000'), 'source-supported', {
        sourceLabel: 'Fictional fiscal note FN-2026-14 (synthetic)',
        agreementPassage:
          'FN-2026-14 (fictional): "The total incremental cost to the FY2027 budget of the ' +
          'proposed three percent increase and the one-time ratification payment is $45,000."',
      }),
      periodStart: DEMO_FISCAL_YEAR.start,
      periodEnd: DEMO_FISCAL_YEAR.end,
      claimedComponents: ['base-pay-increment', 'one-time-bonus'],
      tolerance: { kind: 'absolute', amount: DEFAULT_TOLERANCE_AMOUNT },
      documentLabel: 'Fictional fiscal note FN-2026-14',
      documentText:
        'The total incremental cost to the FY2027 budget of the proposed three percent ' +
        'increase and the one-time ratification payment is $45,000.',
    },
    {
      id: 'CLAIM-2',
      label: 'Fiscal note: "$45,000 for the raise only"',
      statedAmount: known(fromDollars('45000'), 'source-supported', {
        sourceLabel: 'Fictional fiscal note FN-2026-15 (synthetic)',
      }),
      periodStart: DEMO_FISCAL_YEAR.start,
      periodEnd: DEMO_FISCAL_YEAR.end,
      claimedComponents: ['base-pay-increment'],
      tolerance: { kind: 'absolute', amount: DEFAULT_TOLERANCE_AMOUNT },
      documentLabel: 'Fictional fiscal note FN-2026-15',
      documentText:
        'The FY2027 incremental base-pay cost of the proposed three percent increase, ' +
        'effective January 1, 2027, is $45,000.',
    },
    {
      id: 'CLAIM-3',
      label: 'Memo: "$3,070,000 total payroll"',
      statedAmount: known(fromDollars('3070000'), 'source-supported', {
        sourceLabel: 'Fictional budget memo BM-2026-03 (synthetic)',
      }),
      periodStart: DEMO_FISCAL_YEAR.start,
      periodEnd: DEMO_FISCAL_YEAR.end,
      claimedComponents: ['total-payroll'],
      tolerance: { kind: 'absolute', amount: DEFAULT_TOLERANCE_AMOUNT },
      documentLabel: 'Fictional budget memo BM-2026-03',
      documentText: 'Total departmental payroll for FY2027 is projected at $3,070,000.',
    },
  ];
}

export function buildDemoDataset(): Dataset {
  return {
    meta: {
      isSynthetic: true,
      label: SYNTHETIC_LABEL,
      generatedFrom: `Deterministic generator, seed ${DEMO_SEED}`,
    },
    fiscalYear: DEMO_FISCAL_YEAR,
    department: { id: 'MDW-PW', name: DEPARTMENT_NAME },
    employees: buildEmployees(),
    baselineOvertime: {
      kind: 'modeled',
      monthlyHours: known(420, 'user-assumption', {
        sourceLabel: 'Baseline assumption: 420 overtime hours per month, department-wide',
      }),
      rate: {
        kind: 'derived',
        multiplier: known(1.5, 'user-assumption', {
          sourceLabel: 'Baseline assumption: overtime paid at 1.5 × hourly base pay',
        }),
      },
    },
    overtimeRecords: buildOvertimeRecords(),
    // Set above typical monthly spend so the budget flag marks genuinely
    // unusual months rather than firing most of the year, which would bury the
    // patterns actually worth a look.
    overtimeMonthlyBudget: known(fromDollars('22000'), 'user-assumption', {
      sourceLabel: 'Fictional adopted monthly overtime budget (synthetic)',
    }),
    workforceBudget: known(fromDollars('3293000'), 'user-assumption', {
      sourceLabel: 'Fictional adopted workforce budget for FY2027 (synthetic)',
    }),
    offers: buildOffers(),
    comparators: buildComparators(),
    statedCosts: buildStatedCosts(),
  };
}

export { Decimal };
