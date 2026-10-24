/**
 * Guards the figures the demonstration opens with.
 *
 * These are worked by hand from the fictional records, so if the engine or the
 * dataset drifts, this test says so. Every expected value here is reproducible
 * with a calculator from the dataset described in the comments.
 */
import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../../src/data/generate/demoDataset';
import { computeBudgetPosition, computeEngineView, computeOffer, DEFAULT_REVIEW_THRESHOLDS } from '../../src/engine';
import { toDecimalString, type Money } from '../../src/money/money';
import type { ValueState } from '../../src/domain/types';

function amount(state: ValueState<Money>): string {
  if (state.kind !== 'known') throw new Error(`expected a known amount, got "${state.kind}"`);
  return toDecimalString(state.value);
}

const dataset = buildDemoDataset();

describe('demonstration baseline', () => {
  const a = computeOffer(dataset, 'A');

  it('sums 50 fictional employees at $60,000 to $3,000,000', () => {
    expect(amount(a.baseline.annualBasePay)).toBe('3000000.00');
    expect(a.baseline.headcount).toBe(50);
  });

  it('prices baseline overtime from the stated assumption', () => {
    // hourly base 60000 / (40 x 52) = 2884.615... cents; x1.5 = 4327 cents.
    // 420 hours x 12 months = 5040 hours. 5040 x 4327 = $218,080.80.
    expect(amount(a.baseline.overtimeHourlyRate)).toBe('43.27');
    expect(amount(a.baseline.annualOvertimeCost)).toBe('218080.80');
    expect(amount(a.baselineTotalCost)).toBe('3218080.80');
  });
});

describe('demonstration Offer A — 3% effective 2027-01-01, $500 bonus', () => {
  const a = computeOffer(dataset, 'A');

  it('prorates the base-pay increase to six of twelve months', () => {
    expect(amount(a.currentYearBasePayIncrement)).toBe('45000.00');
    expect(amount(a.annualizedBasePayIncrease)).toBe('90000.00');
  });

  it('charges the one-time bonus once', () => {
    expect(amount(a.oneTimeCost)).toBe('25000.00');
  });

  it('raises the derived overtime rate only from the effective date', () => {
    // Raised hourly 2971.153... x 1.5 = 4457 cents, a 130-cent uplift.
    // 130 x 5040 = $6,552 a year; half the year applies, so $3,276.
    expect(amount(a.currentYearOvertimeIncrement)).toBe('3276.00');
    expect(amount(a.annualizedOvertimeIncrease)).toBe('6552.00');
  });

  it('totals the three components exactly', () => {
    expect(amount(a.currentYearTotalIncremental)).toBe('73276.00');
    expect(amount(a.annualizedRecurringIncrease)).toBe('96552.00');
    expect(amount(a.totalProposedExpenditure)).toBe('3291356.80');
  });

  it('leaves budget remaining against the fictional adopted budget', () => {
    const position = computeBudgetPosition(dataset, a);
    expect(position).toBeDefined();
    if (!position) return;
    expect(toDecimalString(position.remaining)).toBe('1643.20');
    expect(position.isShortfall).toBe(false);
  });

  it('does not claim overtime is excluded when it is modeled', () => {
    expect(a.exclusions.map((e) => e.category)).not.toContain('Overtime increase');
    expect(a.exclusions.map((e) => e.category)).toContain('Pension and retirement contributions');
  });
});

describe('demonstration Offer B — 2.5% effective 2026-09-01, $200 bonus', () => {
  const b = computeOffer(dataset, 'B');

  it('prorates to ten of twelve months', () => {
    expect(amount(b.currentYearBasePayIncrement)).toBe('62500.00');
    expect(amount(b.annualizedBasePayIncrease)).toBe('75000.00');
  });

  it('totals its own components', () => {
    expect(amount(b.oneTimeCost)).toBe('10000.00');
    expect(amount(b.currentYearOvertimeIncrement)).toBe('4536.00');
    expect(amount(b.currentYearTotalIncremental)).toBe('77036.00');
    expect(amount(b.annualizedRecurringIncrease)).toBe('80443.20');
    expect(amount(b.totalProposedExpenditure)).toBe('3295116.80');
  });

  it('runs into a workforce budget shortfall', () => {
    const position = computeBudgetPosition(dataset, b);
    expect(position).toBeDefined();
    if (!position) return;
    expect(toDecimalString(position.remaining)).toBe('-2116.80');
    expect(position.isShortfall).toBe(true);
  });
});

describe('the demonstration shows the trade-off worth seeing', () => {
  it('costs less now under A but more every year after', () => {
    const a = computeOffer(dataset, 'A');
    const b = computeOffer(dataset, 'B');

    // B is cheaper this year, A is cheaper in perpetuity. That contrast is the
    // point of having two offers side by side.
    expect(
      Number(amount(a.currentYearTotalIncremental)) < Number(amount(b.currentYearTotalIncremental)),
    ).toBe(true);
    expect(
      Number(amount(a.annualizedRecurringIncrease)) > Number(amount(b.annualizedRecurringIncrease)),
    ).toBe(true);
  });
});

describe('demonstration overtime history', () => {
  const view = computeEngineView(dataset, DEFAULT_REVIEW_THRESHOLDS);

  it('holds 24 complete months', () => {
    expect(view.overtimeRows).toHaveLength(24);
    expect(view.overtimeRows.every((r) => r.isComplete)).toBe(true);
    expect(view.overtimeTotals.monthsIncomplete).toBe(0);
  });

  it('flags the February 2026 spike against the preceding month', () => {
    const flag = view.flags.flags.find((f) => f.kind === 'hours-increase' && f.months.includes('2026-02'));
    expect(flag).toBeDefined();
    expect(flag?.label).toBe('Needs review');
    expect(flag?.months).toEqual(['2026-01', '2026-02']);
    expect(flag?.threshold).toContain('25%');
  });

  it('raises at least one flag of each configured kind', () => {
    const kinds = new Set(view.flags.flags.map((f) => f.kind));
    expect(kinds.has('hours-increase')).toBe(true);
    expect(kinds.has('effective-hourly-cost-change')).toBe(true);
    expect(kinds.has('budget-overage')).toBe(true);
  });
});
