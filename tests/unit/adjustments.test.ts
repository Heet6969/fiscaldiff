/**
 * Offer B's repeatable increase/decrease rows.
 *
 * Basis under test: signed percentages are summed first, then applied once to
 * each employee's original salary. They are not compounded.
 */
import { describe, expect, it } from 'vitest';
import { buildAcceptanceDataset } from './helpers/acceptanceCase';
import { buildDemoDataset } from '../../src/data/generate/demoDataset';
import {
  computeBudgetPosition,
  computeOffer,
  describeBasePayChange,
  initialStatedInputs,
  netBasePayChange,
  resolveStatedCheck,
  type OfferResult,
} from '../../src/engine';
import type { AdjustmentDirection, BasePayAdjustment, Dataset, Offer, OvertimeModel } from '../../src/domain/dataset';
import { known, missing, unknownInput, type ValueState } from '../../src/domain/types';
import { fromDollars, toDecimalString, type Money } from '../../src/money/money';

function row(id: string, direction: AdjustmentDirection, percent: number | null): BasePayAdjustment {
  return {
    id,
    direction,
    percent: percent === null ? missing('user-assumption') : known(percent, 'user-assumption'),
  };
}

function withB(dataset: Dataset, patch: Partial<Offer>): Dataset {
  return { ...dataset, offers: { ...dataset.offers, B: { ...dataset.offers.B, ...patch } } };
}

/** The acceptance case, with Offer B given rows. Offer B shares A's date. */
function acceptanceWithRows(rows: readonly BasePayAdjustment[], extra: Partial<Offer> = {}): Dataset {
  const base = buildAcceptanceDataset();
  return withB(base, {
    adjustments: rows,
    raiseEffectiveDate: known('2027-01-01', 'user-assumption'),
    oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
    bonusPaymentDate: known('2026-12-18', 'user-assumption'),
    ...extra,
  });
}

const amount = (state: ValueState<Money>): string => {
  if (state.kind !== 'known') throw new Error(`expected a known amount, got "${state.kind}"`);
  return toDecimalString(state.value);
};

const modeled = (hours: number): OvertimeModel => ({
  kind: 'modeled',
  monthlyHours: known(hours, 'user-assumption'),
  rate: { kind: 'derived', multiplier: known(1.5, 'user-assumption') },
});

function figures(r: OfferResult) {
  return {
    basePayCurrent: r.currentYearBasePayIncrement,
    basePayAnnual: r.annualizedBasePayIncrease,
    overtimeCurrent: r.currentYearOvertimeIncrement,
    overtimeAnnual: r.annualizedOvertimeIncrease,
    total: r.currentYearTotalIncremental,
    recurring: r.annualizedRecurringIncrease,
    expenditure: r.totalProposedExpenditure,
  };
}

describe('existing totals are unchanged', () => {
  it('Offer B in the demonstration, now built from one Increase row, gives the same figures', () => {
    const dataset = buildDemoDataset();
    expect(dataset.offers.B.adjustments).toHaveLength(1);
    const b = computeOffer(dataset, 'B');
    expect(amount(b.currentYearBasePayIncrement)).toBe('62500.00');
    expect(amount(b.annualizedBasePayIncrease)).toBe('75000.00');
    expect(amount(b.oneTimeCost)).toBe('10000.00');
    expect(amount(b.currentYearOvertimeIncrement)).toBe('4536.00');
    expect(amount(b.currentYearTotalIncremental)).toBe('77036.00');
    expect(amount(b.annualizedRecurringIncrease)).toBe('80443.20');
    expect(amount(b.totalProposedExpenditure)).toBe('3295116.80');
  });

  it('a single Increase row equals the old single percentage, to the cent', () => {
    const dataset = buildDemoDataset();
    const asRow = computeOffer(dataset, 'B');
    // The same offer expressed the old way: no rows, one percentage.
    const { adjustments: _rows, ...oldStyle } = dataset.offers.B;
    const asSingle = computeOffer({ ...dataset, offers: { ...dataset.offers, B: oldStyle } }, 'B');
    expect(figures(asRow)).toEqual(figures(asSingle));
  });

  it('Offer A and the acceptance case are untouched', () => {
    const a = computeOffer(buildAcceptanceDataset(), 'A');
    expect(amount(a.currentYearBasePayIncrement)).toBe('45000.00');
    expect(amount(a.oneTimeCost)).toBe('25000.00');
    expect(amount(a.currentYearTotalIncremental)).toBe('70000.00');
    expect(amount(a.annualizedRecurringIncrease)).toBe('90000.00');
  });
});

describe('the rows are summed, not compounded', () => {
  it('+3% and −1% equals a single +2% under identical assumptions', () => {
    const rows = acceptanceWithRows([row('a', 'increase', 3), row('b', 'decrease', 1)]);
    const single = acceptanceWithRows([row('a', 'increase', 2)]);
    const direct = withB(buildAcceptanceDataset(), {
      adjustments: undefined,
      basePayRaisePercent: known(2, 'user-assumption'),
      raiseEffectiveDate: known('2027-01-01', 'user-assumption'),
      oneTimeBonusPerEmployee: known(fromDollars('0'), 'user-assumption'),
    });

    const net = computeOffer(rows, 'B');
    expect(figures(net)).toEqual(figures(computeOffer(single, 'B')));
    expect(figures(net)).toEqual(figures(computeOffer(direct, 'B')));
    // $60,000 × 2% = $1,200 each; 50 staff, half the year.
    expect(amount(net.annualizedBasePayIncrease)).toBe('60000.00');
    expect(amount(net.currentYearBasePayIncrement)).toBe('30000.00');
  });

  it('does not compound: 1.03 × 0.99 would give +1.97%, not +2%', () => {
    const net = computeOffer(acceptanceWithRows([row('a', 'increase', 3), row('b', 'decrease', 1)]), 'B');
    // Compounded, each salary would be $59,... 60,000 × 1.03 × 0.99 = 61,182, an increase of 1,182.
    expect(amount(net.annualizedBasePayIncrease)).not.toBe('59100.00');
    expect(amount(net.annualizedBasePayIncrease)).toBe('60000.00');
  });

  it('order does not matter', () => {
    const one = computeOffer(acceptanceWithRows([row('a', 'increase', 3), row('b', 'decrease', 1)]), 'B');
    const two = computeOffer(acceptanceWithRows([row('b', 'decrease', 1), row('a', 'increase', 3)]), 'B');
    expect(figures(one)).toEqual(figures(two));
  });

  it('adds fractional percentages exactly', () => {
    const change = netBasePayChange(
      acceptanceWithRows([row('a', 'increase', 0.1), row('b', 'increase', 0.2)]).offers.B,
    );
    expect(change.input.state).toEqual({ kind: 'known', value: 0.3 });
  });

  it('opposite equal rows give exactly zero', () => {
    const r = computeOffer(acceptanceWithRows([row('a', 'increase', 2.5), row('b', 'decrease', 2.5)]), 'B');
    expect(amount(r.currentYearBasePayIncrement)).toBe('0.00');
    expect(amount(r.annualizedBasePayIncrease)).toBe('0.00');
  });

  it('no rows is an explicit 0%, not a missing value', () => {
    const r = computeOffer(acceptanceWithRows([]), 'B');
    expect(amount(r.currentYearBasePayIncrement)).toBe('0.00');
    expect(amount(r.currentYearTotalIncremental)).toBe('0.00');
    expect(r.completeness.kind).toBe('complete');
    expect(netBasePayChange(acceptanceWithRows([]).offers.B).summary).toContain('net 0%');
  });

  it('records the net as a user assumption, whatever the rows came from', () => {
    const change = netBasePayChange(acceptanceWithRows([row('a', 'increase', 3)]).offers.B);
    expect(change.input.provenance).toBe('user-assumption');
    const step = computeOffer(acceptanceWithRows([row('a', 'increase', 3)]), 'B').steps.find(
      (s) => s.label === 'Net base-pay change',
    );
    expect(step?.provenance).toBe('user-assumption');
    expect(step?.formula).toContain('not compounded');
    expect(step?.result).toBe('+3%');
  });
});

describe('a net decrease', () => {
  const decrease = (extra: Partial<Offer> = {}) =>
    acceptanceWithRows([row('a', 'decrease', 2)], extra);

  it('reduces base pay, with a negative annualized and current-year change', () => {
    const r = computeOffer(decrease(), 'B');
    expect(amount(r.annualizedBasePayIncrease)).toBe('-60000.00');
    expect(amount(r.currentYearBasePayIncrement)).toBe('-30000.00');
    expect(amount(r.currentYearTotalIncremental)).toBe('-30000.00');
    expect(amount(r.annualizedRecurringIncrease)).toBe('-60000.00');
  });

  it('keeps the one-time bonus separate and out of the recurring figure', () => {
    const r = computeOffer(
      decrease({ oneTimeBonusPerEmployee: known(fromDollars('500'), 'user-assumption') }),
      'B',
    );
    expect(amount(r.oneTimeCost)).toBe('25000.00');
    expect(amount(r.currentYearTotalIncremental)).toBe('-5000.00');
    expect(amount(r.annualizedRecurringIncrease)).toBe('-60000.00');
  });

  it('lowers total proposed expenditure below the baseline', () => {
    const r = computeOffer(decrease(), 'B');
    expect(amount(r.totalProposedExpenditure)).toBe('2970000.00');
  });

  it('improves the workforce budget position', () => {
    const base = decrease();
    const dataset: Dataset = { ...base, workforceBudget: known(fromDollars('3000000'), 'user-assumption') };
    const position = computeBudgetPosition(dataset, computeOffer(dataset, 'B'));
    expect(position && toDecimalString(position.remaining)).toBe('30000.00');
    expect(position?.isShortfall).toBe(false);

    // The same budget is a shortfall under a net increase.
    const increase = { ...acceptanceWithRows([row('a', 'increase', 2)]), workforceBudget: dataset.workforceBudget };
    const worse = computeBudgetPosition(increase, computeOffer(increase, 'B'));
    expect(worse && toDecimalString(worse.remaining)).toBe('-30000.00');
    expect(worse?.isShortfall).toBe(true);
  });

  it('lowers a derived overtime rate from the effective date, for the applicable months only', () => {
    const base = acceptanceWithRows([row('a', 'decrease', 2)], { overtime: modeled(400) });
    const dataset: Dataset = { ...base, baselineOvertime: modeled(400) };
    const r = computeOffer(dataset, 'B');

    const annual = r.annualizedOvertimeIncrease;
    const current = r.currentYearOvertimeIncrement;
    expect(annual.kind).toBe('known');
    expect(current.kind).toBe('known');
    if (annual.kind !== 'known' || current.kind !== 'known') return;
    expect(annual.value.cents).toBeLessThan(0n);
    // Half the year carries the lower rate (raise effective 2027-01-01).
    expect(current.value.cents).toBe(annual.value.cents / 2n);
    expect(r.currentYearTotalIncremental.kind).toBe('known');
  });

  it('leaves an independently confirmed overtime rate flat', () => {
    const independent: OvertimeModel = {
      kind: 'modeled',
      monthlyHours: known(400, 'user-assumption'),
      rate: { kind: 'independent', confirmedRate: known(fromDollars('43.27'), 'source-supported') },
    };
    const dataset: Dataset = {
      ...acceptanceWithRows([row('a', 'decrease', 2)], { overtime: independent }),
      baselineOvertime: independent,
    };
    expect(amount(computeOffer(dataset, 'B').currentYearOvertimeIncrement)).toBe('0.00');
  });

  it('never produces a negative salary at exactly −100%', () => {
    const r = computeOffer(acceptanceWithRows([row('a', 'decrease', 100)]), 'B');
    expect(amount(r.annualizedBasePayIncrease)).toBe('-3000000.00');
    // Revised pay is $0, not below it.
    expect(amount(r.totalProposedExpenditure)).toBe('1500000.00');
  });
});

describe('invalid or unfinished rows block dependent results', () => {
  function blockedFor(rows: readonly BasePayAdjustment[], extra: Partial<Offer> = {}): OfferResult {
    return computeOffer(acceptanceWithRows(rows, extra), 'B');
  }

  it('an empty percentage blocks everything that depends on it', () => {
    const r = blockedFor([row('a', 'increase', 3), row('b', 'decrease', null)]);
    expect(r.currentYearBasePayIncrement.kind).toBe('missing');
    expect(r.annualizedBasePayIncrease.kind).toBe('missing');
    expect(r.currentYearTotalIncremental.kind).not.toBe('known');
    expect(r.annualizedRecurringIncrease.kind).not.toBe('known');
    expect(r.totalProposedExpenditure.kind).not.toBe('known');
    expect(r.completeness.kind).not.toBe('complete');
  });

  it('is never quietly skipped, which would have given +3% instead', () => {
    const r = blockedFor([row('a', 'increase', 3), row('b', 'decrease', null)]);
    expect(r.currentYearBasePayIncrement.kind).not.toBe('known');
    if (r.completeness.kind === 'complete') throw new Error('should be incomplete');
    const absent = r.completeness.absentInputs.join(' ');
    expect(absent).toContain('Adjustment 2 is unfinished or invalid');
    expect(absent).not.toContain('Adjustment 1');
  });

  it('an unknown percentage blocks too', () => {
    const r = blockedFor([{ id: 'a', direction: 'increase', percent: unknownInput('user-assumption') }]);
    expect(r.currentYearTotalIncremental.kind).not.toBe('known');
  });

  it('a negative, non-finite or NaN percentage is invalid', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = blockedFor([row('a', 'increase', bad)]);
      expect(r.currentYearBasePayIncrement.kind, String(bad)).toBe('missing');
    }
  });

  it('an unfinished row also blocks a derived overtime rate', () => {
    const base = acceptanceWithRows([row('a', 'increase', null)], { overtime: modeled(400) });
    const r = computeOffer({ ...base, baselineOvertime: modeled(400) }, 'B');
    expect(r.currentYearOvertimeIncrement.kind).toBe('missing');
    expect(r.annualizedOvertimeIncrease.kind).toBe('missing');
  });

  it('but not an independently confirmed rate', () => {
    const independent: OvertimeModel = {
      kind: 'modeled',
      monthlyHours: known(400, 'user-assumption'),
      rate: { kind: 'independent', confirmedRate: known(fromDollars('43.27'), 'source-supported') },
    };
    const base = acceptanceWithRows([row('a', 'increase', null)], { overtime: independent });
    const r = computeOffer({ ...base, baselineOvertime: independent }, 'B');
    expect(r.currentYearOvertimeIncrement.kind).toBe('known');
    expect(r.currentYearBasePayIncrement.kind).toBe('missing');
  });

  it('a combined change below −100% is refused, with a reason, and never goes negative', () => {
    const rows = [row('a', 'decrease', 60), row('b', 'decrease', 50)];
    const change = netBasePayChange(acceptanceWithRows(rows).offers.B);
    expect(change.input.state.kind).toBe('missing');
    expect(change.problems.join(' ')).toContain('below −100%');
    expect(change.problems.join(' ')).toContain('−110%');

    const r = blockedFor(rows);
    expect(r.currentYearBasePayIncrement.kind).toBe('missing');
    expect(r.totalProposedExpenditure.kind).not.toBe('known');
  });

  it('is judged on the combined net, not row by row', () => {
    // −60% and −50% is refused, but +30% with them brings it back above −100%.
    const ok = netBasePayChange(
      acceptanceWithRows([row('a', 'decrease', 60), row('b', 'decrease', 50), row('c', 'increase', 30)]).offers.B,
    );
    expect(ok.input.state).toEqual({ kind: 'known', value: -80 });
    expect(ok.problems).toEqual([]);
  });

  it('recovers as soon as the row is completed', () => {
    expect(blockedFor([row('a', 'increase', null)]).currentYearTotalIncremental.kind).not.toBe('known');
    expect(blockedFor([row('a', 'increase', 3)]).currentYearTotalIncremental.kind).toBe('known');
  });
});

describe('Offer B is independent of Offer A', () => {
  it('changing Offer B’s rows never changes Offer A', () => {
    const dataset = buildDemoDataset();
    const before = figures(computeOffer(dataset, 'A'));
    const changed = withB(dataset, {
      adjustments: [row('a', 'decrease', 40), row('b', 'increase', 5), row('c', 'decrease', null)],
    });
    expect(figures(computeOffer(changed, 'A'))).toEqual(before);
  });

  it('changing Offer A never changes Offer B', () => {
    const dataset = buildDemoDataset();
    const before = figures(computeOffer(dataset, 'B'));
    const changed: Dataset = {
      ...dataset,
      offers: {
        ...dataset.offers,
        A: { ...dataset.offers.A, basePayRaisePercent: known(9, 'user-assumption') },
      },
    };
    expect(figures(computeOffer(changed, 'B'))).toEqual(before);
  });

  it('Offer A keeps its single percentage and has no rows', () => {
    const a = buildDemoDataset().offers.A;
    expect(a.adjustments).toBeUndefined();
    expect(netBasePayChange(a).usesRows).toBe(false);
    expect(netBasePayChange(a).input).toBe(a.basePayRaisePercent);
  });
});

describe('signed values in the stated-cost check', () => {
  const decrease = acceptanceWithRows([row('a', 'decrease', 2)]);

  function check(stated: string, offerId: 'A' | 'B' = 'B') {
    const inputs = initialStatedInputs(decrease);
    return resolveStatedCheck(decrease, {
      offerId,
      claim: {
        ...inputs.claim,
        claimedComponents: ['base-pay-increment'],
        statedAmount: known(fromDollars(stated), 'user-assumption'),
      },
    });
  }

  it('compares a stated saving against a calculated saving', () => {
    const outcome = check('-30000');
    expect(outcome.kind).toBe('checked');
    if (outcome.kind !== 'checked') return;
    expect(outcome.reconciliation.verdict).toBe('matches');
    expect(outcome.reconciliation.calculatedAmount).toEqual({ kind: 'known', value: { cents: -3000000n } });
  });

  it('reports a signed difference when the saving is overstated', () => {
    const outcome = check('-40000');
    if (outcome.kind !== 'checked') throw new Error('expected a check');
    expect(outcome.reconciliation.verdict).toBe('difference-requires-review');
    expect(outcome.reconciliation.difference).toEqual({ kind: 'known', value: { cents: -1000000n } });
  });

  it('does not match a stated cost against a calculated saving', () => {
    const outcome = check('30000');
    if (outcome.kind !== 'checked') throw new Error('expected a check');
    expect(outcome.reconciliation.verdict).toBe('difference-requires-review');
    expect(outcome.reconciliation.difference).toEqual({ kind: 'known', value: { cents: 6000000n } });
  });

  it('refuses to compare while Offer B’s rows are unfinished', () => {
    const blocked = acceptanceWithRows([row('a', 'increase', null)]);
    const outcome = resolveStatedCheck(blocked, {
      offerId: 'B',
      claim: { ...initialStatedInputs(blocked).claim, claimedComponents: ['base-pay-increment'] },
    });
    if (outcome.kind !== 'checked') throw new Error('expected a check result');
    expect(outcome.reconciliation.verdict).toBe('cannot-verify');
    expect(outcome.reconciliation.refusalReason).toContain('missing or unknown');
  });

  it('describes Offer B’s rows for exports', () => {
    expect(describeBasePayChange(acceptanceWithRows([row('a', 'increase', 3), row('b', 'decrease', 1)]).offers.B)).toBe(
      'Increase 3%, Decrease 1% → net +2%; effective 2027-01-01; applied once to original salaries, not compounded',
    );
    expect(describeBasePayChange(acceptanceWithRows([row('a', 'increase', null)]).offers.B)).toContain(
      'Not available — Adjustment 1 is unfinished or invalid',
    );
  });
});
