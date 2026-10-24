import { describe, expect, it } from 'vitest';
import { buildAcceptanceDataset, ACCEPTANCE_FISCAL_YEAR } from './helpers/acceptanceCase';
import { checkStatedCost } from '../../src/engine';
import type { Dataset, StatedCostClaim } from '../../src/domain/dataset';
import { known, missing } from '../../src/domain/types';
import { fromDollars, toDecimalString } from '../../src/money/money';

function claim(patch: Partial<StatedCostClaim>): StatedCostClaim {
  return {
    id: 'C1',
    label: 'Test claim',
    statedAmount: known(fromDollars('70000'), 'synthetic-sample'),
    periodStart: ACCEPTANCE_FISCAL_YEAR.start,
    periodEnd: ACCEPTANCE_FISCAL_YEAR.end,
    claimedComponents: ['base-pay-increment', 'one-time-bonus'],
    tolerance: { kind: 'absolute', amount: fromDollars('1.00') },
    ...patch,
  };
}

const dataset = buildAcceptanceDataset();

describe('matches within tolerance', () => {
  it('accepts an exact figure', () => {
    const r = checkStatedCost(dataset, claim({}), 'A');
    expect(r.verdict).toBe('matches');
    expect(r.verdictLabel).toBe('Matches within the stated tolerance');
    expect(toDecimalString(r.difference.kind === 'known' ? r.difference.value : fromDollars('0'))).toBe('0.00');
  });

  it('accepts a figure inside the tolerance but still shows the real difference', () => {
    const r = checkStatedCost(dataset, claim({ statedAmount: known(fromDollars('70000.75'), 'synthetic-sample') }), 'A');
    expect(r.verdict).toBe('matches');
    if (r.difference.kind !== 'known') throw new Error('expected a difference');
    // The tolerance decides the verdict; it never hides the figure.
    expect(toDecimalString(r.difference.value)).toBe('0.75');
  });

  it('rejects a figure one cent outside the tolerance', () => {
    const r = checkStatedCost(dataset, claim({ statedAmount: known(fromDollars('70001.01'), 'synthetic-sample') }), 'A');
    expect(r.verdict).toBe('difference-requires-review');
  });

  it('supports a percentage tolerance', () => {
    const r = checkStatedCost(
      dataset,
      claim({
        statedAmount: known(fromDollars('70500'), 'synthetic-sample'),
        tolerance: { kind: 'percent', percent: 1 },
      }),
      'A',
    );
    expect(r.verdict).toBe('matches');
    expect(r.toleranceDescription).toBe('1% of the calculated amount');
  });
});

describe('difference requiring review', () => {
  it('reports a signed difference and neutral wording', () => {
    const r = checkStatedCost(dataset, claim({ statedAmount: known(fromDollars('45000'), 'synthetic-sample') }), 'A');
    expect(r.verdict).toBe('difference-requires-review');
    if (r.difference.kind !== 'known') throw new Error('expected a difference');
    expect(toDecimalString(r.difference.value)).toBe('-25000.00');
  });

  it('reports an overstatement with the opposite sign', () => {
    const r = checkStatedCost(dataset, claim({ statedAmount: known(fromDollars('90000'), 'synthetic-sample') }), 'A');
    if (r.difference.kind !== 'known') throw new Error('expected a difference');
    expect(toDecimalString(r.difference.value)).toBe('20000.00');
  });
});

describe('cannot verify', () => {
  it('refuses a total-payroll claim rather than comparing unlike figures', () => {
    const r = checkStatedCost(dataset, claim({ claimedComponents: ['total-payroll'] }), 'A');
    expect(r.verdict).toBe('cannot-verify');
    expect(r.refusalReason).toContain('not an incremental-cost scope');
    expect(r.calculatedAmount.kind).not.toBe('known');
    expect(r.difference.kind).not.toBe('known');
  });

  it('refuses a mismatched fiscal period', () => {
    const r = checkStatedCost(dataset, claim({ periodStart: '2027-07-01', periodEnd: '2028-06-30' }), 'A');
    expect(r.verdict).toBe('cannot-verify');
    expect(r.refusalReason).toContain('periods differ');
  });

  it('refuses components the prototype does not calculate', () => {
    for (const component of ['employer-taxes', 'pension', 'benefits'] as const) {
      const r = checkStatedCost(
        dataset,
        claim({ claimedComponents: ['base-pay-increment', component] }),
        'A',
      );
      expect(r.verdict, component).toBe('cannot-verify');
      expect(r.refusalReason).toContain('does not calculate');
    }
  });

  it('refuses a claim with no stated scope', () => {
    const r = checkStatedCost(dataset, claim({ claimedComponents: [] }), 'A');
    expect(r.verdict).toBe('cannot-verify');
    expect(r.refusalReason).toContain('does not say which components');
  });

  it('refuses when no amount was entered', () => {
    const r = checkStatedCost(dataset, claim({ statedAmount: missing('user-assumption') }), 'A');
    expect(r.verdict).toBe('cannot-verify');
    expect(r.refusalReason).toContain('No stated amount');
  });

  it('refuses rather than producing a figure from a missing input', () => {
    const broken: Dataset = {
      ...dataset,
      offers: {
        ...dataset.offers,
        A: { ...dataset.offers.A, bonusPaymentDate: missing('user-assumption') },
      },
    };
    const r = checkStatedCost(broken, claim({}), 'A');
    expect(r.verdict).toBe('cannot-verify');
    expect(r.refusalReason).toContain('missing or unknown');
    expect(r.calculatedAmount.kind).not.toBe('known');
  });
});

describe('reconciliation detail', () => {
  const r = checkStatedCost(dataset, claim({ statedAmount: known(fromDollars('45000'), 'synthetic-sample') }), 'A');

  it('itemises the claimed components', () => {
    expect(r.componentLines.map((l) => l.label)).toEqual(['Base-pay increase', 'One-time bonus']);
  });

  it('shows stated, calculated, difference and tolerance in the trail', () => {
    const labels = r.steps.map((s) => s.label);
    expect(labels).toContain('Stated amount');
    expect(labels).toContain('Calculated amount for the claimed scope');
    expect(labels).toContain('Difference (stated − calculated)');
    expect(labels).toContain('Tolerance applied');
  });

  it('carries the assumptions and exclusions alongside the verdict', () => {
    expect(r.assumptions.join(' ')).toContain('Monthly proration');
    expect(r.exclusions.map((e) => e.category)).toContain('Pension and retirement contributions');
  });

  it('states that the tolerance is a prototype value, not an audit standard', () => {
    expect(r.toleranceDisclaimer).toContain('Not an audit standard');
  });
});
