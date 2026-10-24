import { describe, expect, it } from 'vitest';
import { buildAcceptanceDataset } from './helpers/acceptanceCase';
import { computeBudgetPosition, computeOffer } from '../../src/engine';
import type { Dataset, OvertimeModel } from '../../src/domain/dataset';
import { known, missing, unknownInput, type ValueState } from '../../src/domain/types';
import { Decimal, fromDollars, toDecimalString, centsAsDecimal, roundHalfUpToBigInt } from '../../src/money/money';

function withOffer(dataset: Dataset, id: 'A' | 'B', patch: Partial<Dataset['offers']['A']>): Dataset {
  return {
    ...dataset,
    offers: { ...dataset.offers, [id]: { ...dataset.offers[id], ...patch } },
  } as Dataset;
}

const modeledOvertime = (monthlyHours: number, multiplier = 1.5): OvertimeModel => ({
  kind: 'modeled',
  monthlyHours: known(monthlyHours, 'user-assumption'),
  rate: { kind: 'derived', multiplier: known(multiplier, 'user-assumption') },
});

describe('zero change produces zero incremental cost', () => {
  it('reports exact zeroes, not small residuals', () => {
    const base = buildAcceptanceDataset();
    const dataset = withOffer(base, 'A', {
      basePayRaisePercent: known(0, 'user-assumption'),
      oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
    });
    const r = computeOffer(dataset, 'A');

    expect(toDecimalString(assertKnown(r.currentYearBasePayIncrement))).toBe('0.00');
    expect(toDecimalString(assertKnown(r.annualizedBasePayIncrease))).toBe('0.00');
    expect(toDecimalString(assertKnown(r.oneTimeCost))).toBe('0.00');
    expect(toDecimalString(assertKnown(r.currentYearTotalIncremental))).toBe('0.00');
    expect(toDecimalString(assertKnown(r.annualizedRecurringIncrease))).toBe('0.00');
  });
});

describe('one-time payments', () => {
  it('stay out of the annualized recurring figure', () => {
    const r = computeOffer(buildAcceptanceDataset(), 'A');
    expect(toDecimalString(assertKnown(r.oneTimeCost))).toBe('25000.00');
    expect(toDecimalString(assertKnown(r.annualizedRecurringIncrease))).toBe('90000.00');
    // The recurring figure must not contain the bonus.
    expect(assertKnown(r.annualizedRecurringIncrease).cents).not.toBe(
      assertKnown(r.currentYearTotalIncremental).cents,
    );
  });

  it('are not charged to a year the payment date falls outside', () => {
    const dataset = withOffer(buildAcceptanceDataset(), 'A', {
      bonusPaymentDate: known('2027-08-01', 'user-assumption'),
    });
    const r = computeOffer(dataset, 'A');
    expect(toDecimalString(assertKnown(r.oneTimeCost))).toBe('0.00');
    expect(r.warnings.join(' ')).toContain('outside fiscal year');
  });

  it('refuse to be attributed without a payment date', () => {
    const dataset = withOffer(buildAcceptanceDataset(), 'A', {
      bonusPaymentDate: missing('user-assumption'),
    });
    const r = computeOffer(dataset, 'A');
    expect(r.oneTimeCost.kind).toBe('missing');
    expect(r.currentYearTotalIncremental.kind).not.toBe('known');
    expect(r.completeness.kind).toBe('partial');
    expect(r.completeness.kind === 'partial' && r.completeness.absentInputs).toContain(
      'Bonus payment date',
    );
  });

  it('are not paid to employees who are not explicitly eligible', () => {
    const base = buildAcceptanceDataset();
    const dataset: Dataset = {
      ...base,
      employees: base.employees.map((e, i) => ({ ...e, bonusEligible: i < 10 })),
    };
    const r = computeOffer(dataset, 'A');
    // 10 eligible employees at $500, not 50.
    expect(toDecimalString(assertKnown(r.oneTimeCost))).toBe('5000.00');
  });
});

describe('raise timing and fiscal-year boundaries', () => {
  const cases: readonly [string, string, string][] = [
    // effective date, current-year base increment, annualized
    ['2026-07-01', '90000.00', '90000.00'],
    ['2027-01-01', '45000.00', '90000.00'],
    ['2027-06-01', '7500.00', '90000.00'],
    ['2027-07-01', '0.00', '90000.00'],
  ];

  for (const [date, currentYear, annualized] of cases) {
    it(`effective ${date} gives ${currentYear} current-year and ${annualized} annualized`, () => {
      const dataset = withOffer(buildAcceptanceDataset(), 'A', {
        raiseEffectiveDate: known(date, 'user-assumption'),
        oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
      });
      const r = computeOffer(dataset, 'A');
      expect(toDecimalString(assertKnown(r.currentYearBasePayIncrement))).toBe(currentYear);
      expect(toDecimalString(assertKnown(r.annualizedBasePayIncrease))).toBe(annualized);
    });
  }

  it('keeps the annualized figure independent of the effective date', () => {
    const dates = ['2026-07-01', '2026-11-13', '2027-01-01', '2027-06-30', '2027-09-01'];
    const annualized = dates.map((d) => {
      const dataset = withOffer(buildAcceptanceDataset(), 'A', {
        raiseEffectiveDate: known(d, 'user-assumption'),
      });
      return toDecimalString(assertKnown(computeOffer(dataset, 'A').annualizedBasePayIncrease));
    });
    expect(new Set(annualized).size).toBe(1);
  });

  it('refuses a current-year figure when a non-zero raise has no effective date', () => {
    const dataset = withOffer(buildAcceptanceDataset(), 'A', {
      raiseEffectiveDate: missing('user-assumption'),
    });
    const r = computeOffer(dataset, 'A');
    expect(r.currentYearBasePayIncrement.kind).toBe('missing');
    expect(r.completeness.kind).toBe('partial');
  });
});

describe('overtime interaction with a raise', () => {
  function datasetWithOvertime(baseHours: number, offerHours: number, raisePercent: number): Dataset {
    const base = buildAcceptanceDataset();
    return withOffer(
      { ...base, baselineOvertime: modeledOvertime(baseHours) },
      'A',
      {
        basePayRaisePercent: known(raisePercent, 'user-assumption'),
        oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
        overtime: modeledOvertime(offerHours),
      },
    );
  }

  it('is zero when nothing about overtime or pay changes', () => {
    const r = computeOffer(datasetWithOvertime(400, 400, 0), 'A');
    expect(toDecimalString(assertKnown(r.currentYearOvertimeIncrement))).toBe('0.00');
    expect(toDecimalString(assertKnown(r.annualizedOvertimeIncrease))).toBe('0.00');
  });

  it('reflects an hours change alone at the unchanged rate', () => {
    const r = computeOffer(datasetWithOvertime(400, 500, 0), 'A');
    // hourly base 60000/2080, overtime at 1.5x, 100 extra hours a month for 12 months.
    const hourly = centsAsDecimal(fromDollars('60000')).div(2080);
    const rateCents = roundHalfUpToBigInt(hourly.times(1.5));
    const expected = roundHalfUpToBigInt(new Decimal(rateCents.toString()).times(1200));
    expect(assertKnown(r.annualizedOvertimeIncrease).cents).toBe(expected);
  });

  it('applies a derived rate increase only for the applicable part of the year', () => {
    const r = computeOffer(datasetWithOvertime(400, 400, 3), 'A');
    const annualized = assertKnown(r.annualizedOvertimeIncrease).cents;
    const currentYear = assertKnown(r.currentYearOvertimeIncrement).cents;
    // Raise is effective 2027-01-01, so half the year carries the uplift.
    expect(currentYear).toBe(annualized / 2n);
    expect(annualized).toBeGreaterThan(0n);
  });

  it('does not double count a simultaneous rate and hours change', () => {
    const both = computeOffer(datasetWithOvertime(400, 500, 3), 'A');
    const annualizedBoth = assertKnown(both.annualizedOvertimeIncrease).cents;

    // The increase must equal (new rate x new hours) - (base rate x base hours),
    // computed directly, rather than the sum of the two separate increments.
    const hourly = centsAsDecimal(fromDollars('60000')).div(2080);
    const baseRate = new Decimal(roundHalfUpToBigInt(hourly.times(1.5)).toString());
    const raisedRate = new Decimal(
      roundHalfUpToBigInt(hourly.times(new Decimal(1.03)).times(1.5)).toString(),
    );
    const expected =
      roundHalfUpToBigInt(raisedRate.times(500 * 12)) - roundHalfUpToBigInt(baseRate.times(400 * 12));
    expect(annualizedBoth).toBe(expected);

    const hoursOnly = assertKnown(
      computeOffer(datasetWithOvertime(400, 500, 0), 'A').annualizedOvertimeIncrease,
    ).cents;
    const rateOnly = assertKnown(
      computeOffer(datasetWithOvertime(400, 400, 3), 'A').annualizedOvertimeIncrease,
    ).cents;
    // Naively adding the two separate effects misses the cross term, which is
    // exactly the mistake this assertion is here to catch.
    expect(annualizedBoth).not.toBe(hoursOnly + rateOnly);
  });

  it('holds an independently confirmed rate flat across a raise', () => {
    const base = buildAcceptanceDataset();
    const independent: OvertimeModel = {
      kind: 'modeled',
      monthlyHours: known(400, 'user-assumption'),
      rate: { kind: 'independent', confirmedRate: known(fromDollars('43.27'), 'source-supported') },
    };
    const dataset = withOffer(
      { ...base, baselineOvertime: independent },
      'A',
      {
        basePayRaisePercent: known(3, 'user-assumption'),
        oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
        overtime: independent,
      },
    );
    const r = computeOffer(dataset, 'A');
    expect(toDecimalString(assertKnown(r.currentYearOvertimeIncrement))).toBe('0.00');
    expect(r.assumptions.join(' ')).toContain('held flat');
  });

  it('keeps the annualized overtime increase when the effective date is absent', () => {
    // The full-year figure at the new rate does not need the date; only the
    // current-year portion does.
    const base = buildAcceptanceDataset();
    const dataset = withOffer(
      { ...base, baselineOvertime: modeledOvertime(400) },
      'A',
      {
        basePayRaisePercent: known(3, 'user-assumption'),
        raiseEffectiveDate: missing('user-assumption'),
        oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
        overtime: modeledOvertime(400),
      },
    );
    const r = computeOffer(dataset, 'A');

    expect(r.currentYearOvertimeIncrement.kind).toBe('missing');
    expect(r.annualizedOvertimeIncrease.kind).toBe('known');
    expect(r.annualizedBasePayIncrease.kind).toBe('known');
    expect(toDecimalString(assertKnown(r.annualizedBasePayIncrease))).toBe('90000.00');
    // So the recurring figure survives a missing effective date.
    expect(r.annualizedRecurringIncrease.kind).toBe('known');
  });

  it('refuses a total when modeled overtime hours are missing', () => {
    const base = buildAcceptanceDataset();
    const dataset = withOffer(
      { ...base, baselineOvertime: modeledOvertime(400) },
      'A',
      {
        overtime: {
          kind: 'modeled',
          monthlyHours: missing('user-assumption'),
          rate: { kind: 'derived', multiplier: known(1.5, 'user-assumption') },
        },
      },
    );
    const r = computeOffer(dataset, 'A');
    expect(r.currentYearOvertimeIncrement.kind).toBe('missing');
    expect(r.currentYearTotalIncremental.kind).not.toBe('known');
    expect(r.completeness.kind).toBe('partial');
  });
});

describe('a missing raise blocks a derived overtime rate but not an independent one', () => {
  function build(raise: ReturnType<typeof missing<number>> | ReturnType<typeof known<number>>, independent: boolean): Dataset {
    const base = buildAcceptanceDataset();
    const overtime: OvertimeModel = independent
      ? {
          kind: 'modeled',
          monthlyHours: known(400, 'user-assumption'),
          rate: { kind: 'independent', confirmedRate: known(fromDollars('43.27'), 'source-supported') },
        }
      : modeledOvertime(400);
    return withOffer({ ...base, baselineOvertime: overtime }, 'A', {
      basePayRaisePercent: raise,
      oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
      overtime,
    });
  }

  it('does not assume an unchanged rate when the raise is missing', () => {
    const r = computeOffer(build(missing('user-assumption'), false), 'A');
    expect(r.currentYearOvertimeIncrement.kind).toBe('missing');
    expect(r.annualizedOvertimeIncrease.kind).toBe('missing');
    // Everything that depends on it is blocked, not reported as a smaller total.
    expect(r.currentYearTotalIncremental.kind).not.toBe('known');
    expect(r.annualizedRecurringIncrease.kind).not.toBe('known');
    expect(r.totalProposedExpenditure.kind).not.toBe('known');
    expect(r.completeness.kind).not.toBe('complete');
    const absent = r.completeness.kind === 'complete' ? [] : r.completeness.absentInputs;
    expect(absent.join(' ')).toContain('Base-pay raise percentage');
  });

  it('treats an unknown raise the same way', () => {
    const r = computeOffer(build(unknownInput('user-assumption'), false), 'A');
    expect(r.currentYearOvertimeIncrement.kind).toBe('unknown');
    expect(r.annualizedOvertimeIncrease.kind).toBe('unknown');
    expect(r.currentYearTotalIncremental.kind).not.toBe('known');
  });

  it('does not treat a stated zero raise as missing', () => {
    const r = computeOffer(build(known(0, 'user-assumption'), false), 'A');
    expect(toDecimalString(assertKnown(r.currentYearOvertimeIncrement))).toBe('0.00');
    expect(r.currentYearTotalIncremental.kind).toBe('known');
  });

  it('leaves an independently confirmed rate independent of the missing raise', () => {
    const r = computeOffer(build(missing('user-assumption'), true), 'A');
    // The confirmed rate and hours do not depend on the raise, so overtime stands.
    expect(r.currentYearOvertimeIncrement.kind).toBe('known');
    expect(toDecimalString(assertKnown(r.currentYearOvertimeIncrement))).toBe('0.00');
    expect(toDecimalString(assertKnown(r.annualizedOvertimeIncrease))).toBe('0.00');
    // The base-pay part still needs the raise, so the total is still withheld.
    expect(r.currentYearBasePayIncrement.kind).toBe('missing');
    expect(r.currentYearTotalIncremental.kind).not.toBe('known');
  });

  it('still raises a derived rate normally when the raise is present', () => {
    const r = computeOffer(build(known(3, 'user-assumption'), false), 'A');
    expect(assertKnown(r.annualizedOvertimeIncrease).cents).toBeGreaterThan(0n);
  });
});
describe('A and B isolation', () => {
  it('computes B independently of A', () => {
    const base = buildAcceptanceDataset();
    const dataset = withOffer(base, 'B', {
      basePayRaisePercent: known(10, 'user-assumption'),
      raiseEffectiveDate: known('2026-07-01', 'user-assumption'),
      oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
    });

    const a = computeOffer(dataset, 'A');
    const b = computeOffer(dataset, 'B');

    expect(toDecimalString(assertKnown(a.currentYearTotalIncremental))).toBe('70000.00');
    expect(toDecimalString(assertKnown(b.currentYearTotalIncremental))).toBe('300000.00');
  });

  it('leaves A unchanged when B changes', () => {
    const base = buildAcceptanceDataset();
    const before = toDecimalString(assertKnown(computeOffer(base, 'A').currentYearTotalIncremental));

    const mutated = withOffer(base, 'B', {
      basePayRaisePercent: known(25, 'user-assumption'),
      oneTimeBonusPerEmployee: known(fromDollars('9999'), 'user-assumption'),
    });
    const after = toDecimalString(assertKnown(computeOffer(mutated, 'A').currentYearTotalIncremental));

    expect(after).toBe(before);
  });
});

describe('workforce budget position', () => {
  it('is omitted when no budget is supplied', () => {
    const dataset = buildAcceptanceDataset();
    expect(computeBudgetPosition(dataset, computeOffer(dataset, 'A'))).toBeUndefined();
  });

  it('reports remaining budget and a shortfall as the same signed figure', () => {
    const base = buildAcceptanceDataset();
    const generous: Dataset = {
      ...base,
      workforceBudget: known(fromDollars('3100000'), 'user-assumption'),
    };
    const tight: Dataset = {
      ...base,
      workforceBudget: known(fromDollars('3050000'), 'user-assumption'),
    };

    const remaining = computeBudgetPosition(generous, computeOffer(generous, 'A'));
    expect(remaining).toBeDefined();
    expect(remaining && toDecimalString(remaining.remaining)).toBe('30000.00');
    expect(remaining && remaining.isShortfall).toBe(false);

    const shortfall = computeBudgetPosition(tight, computeOffer(tight, 'A'));
    expect(shortfall).toBeDefined();
    expect(shortfall && toDecimalString(shortfall.remaining)).toBe('-20000.00');
    expect(shortfall && shortfall.isShortfall).toBe(true);
  });

  it('distinguishes total proposed expenditure from the increase over baseline', () => {
    const base = buildAcceptanceDataset();
    const dataset: Dataset = {
      ...base,
      workforceBudget: known(fromDollars('3100000'), 'user-assumption'),
    };
    const r = computeOffer(dataset, 'A');
    expect(toDecimalString(assertKnown(r.baselineTotalCost))).toBe('3000000.00');
    expect(toDecimalString(assertKnown(r.currentYearTotalIncremental))).toBe('70000.00');
    expect(toDecimalString(assertKnown(r.totalProposedExpenditure))).toBe('3070000.00');
  });
});

describe('missing salary data', () => {
  it('refuses a baseline total rather than treating a gap as zero', () => {
    const base = buildAcceptanceDataset();
    const dataset: Dataset = {
      ...base,
      employees: base.employees.map((e, i) =>
        i === 0 ? { ...e, annualBaseSalary: missing('synthetic-sample') } : e,
      ),
    };
    const r = computeOffer(dataset, 'A');
    expect(r.baseline.annualBasePay.kind).toBe('missing');
    expect(r.currentYearBasePayIncrement.kind).toBe('missing');
    expect(r.completeness.kind).toBe('partial');
  });
});

function assertKnown<T>(state: ValueState<T>): T {
  if (state.kind !== 'known') {
    throw new Error(`expected a known value, received "${state.kind}"`);
  }
  return state.value;
}
