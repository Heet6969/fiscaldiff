/**
 * The required financial acceptance case.
 *
 * This is the test the whole engine exists to pass. The inputs are built here
 * as records; every expected figure below is computed by the engine from those
 * records. Nothing is read from a stored result.
 *
 * The case is synthetic. It is not a statement about any real municipality.
 */
import { describe, expect, it } from 'vitest';
import { buildAcceptanceDataset, ACCEPTANCE_CLAIM } from './helpers/acceptanceCase';
import { checkStatedCost, computeBaseline, computeOffer } from '../../src/engine';
import { formatUSD, toDecimalString } from '../../src/money/money';

describe('required financial acceptance case (synthetic)', () => {
  const dataset = buildAcceptanceDataset();
  const baseline = computeBaseline(dataset);
  const result = computeOffer(dataset, 'A');

  it('baseline annual base pay is $3,000,000', () => {
    expect(baseline.annualBasePay.kind).toBe('known');
    if (baseline.annualBasePay.kind !== 'known') return;
    expect(toDecimalString(baseline.annualBasePay.value)).toBe('3000000.00');
    expect(formatUSD(baseline.annualBasePay.value)).toBe('$3,000,000.00');
  });

  it('current-year incremental base pay is $45,000', () => {
    expect(result.currentYearBasePayIncrement.kind).toBe('known');
    if (result.currentYearBasePayIncrement.kind !== 'known') return;
    expect(toDecimalString(result.currentYearBasePayIncrement.value)).toBe('45000.00');
  });

  it('one-time bonuses are $25,000', () => {
    expect(result.oneTimeCost.kind).toBe('known');
    if (result.oneTimeCost.kind !== 'known') return;
    expect(toDecimalString(result.oneTimeCost.value)).toBe('25000.00');
  });

  it('current-year total incremental cost is $70,000', () => {
    expect(result.currentYearTotalIncremental.kind).toBe('known');
    if (result.currentYearTotalIncremental.kind !== 'known') return;
    expect(toDecimalString(result.currentYearTotalIncremental.value)).toBe('70000.00');
  });

  it('annualized recurring base-pay increase is $90,000', () => {
    expect(result.annualizedRecurringIncrease.kind).toBe('known');
    if (result.annualizedRecurringIncrease.kind !== 'known') return;
    expect(toDecimalString(result.annualizedRecurringIncrease.value)).toBe('90000.00');
  });

  it('proration is exactly six of twelve months', () => {
    expect(result.prorationFactor.kind).toBe('known');
    if (result.prorationFactor.kind !== 'known') return;
    expect(result.prorationFactor.value.toFixed(10)).toBe('0.5000000000');
    expect(result.prorationNote).toContain('6 full months of 12');
  });

  it('overtime and employer add-ons are reported as excluded, not as zero', () => {
    expect(result.currentYearOvertimeIncrement.kind).toBe('excluded');
    const categories = result.exclusions.map((e) => e.category);
    expect(categories).toContain('Overtime');
    expect(categories).toContain('Employer payroll taxes');
    expect(categories).toContain('Pension and retirement contributions');
    expect(categories).toContain('Health and other benefits');
  });

  it('the result is complete, since every excluded item is disclosed', () => {
    expect(result.completeness.kind).toBe('complete');
  });

  it('one-time cost is excluded from the annualized recurring figure', () => {
    // $90,000 recurring, not $115,000.
    if (result.annualizedRecurringIncrease.kind !== 'known') throw new Error('expected known');
    expect(toDecimalString(result.annualizedRecurringIncrease.value)).toBe('90000.00');
  });

  it('components sum exactly to the current-year total', () => {
    const { currentYearBasePayIncrement: base, oneTimeCost: bonus, currentYearTotalIncremental: total } = result;
    if (base.kind !== 'known' || bonus.kind !== 'known' || total.kind !== 'known') {
      throw new Error('expected known components');
    }
    expect(base.value.cents + bonus.value.cents).toBe(total.value.cents);
  });

  describe('a $45,000 claim covering both the raise and the bonus', () => {
    const reconciliation = checkStatedCost(dataset, ACCEPTANCE_CLAIM, 'A');

    it('differs by $25,000 and requires review', () => {
      expect(reconciliation.verdict).toBe('difference-requires-review');
      expect(reconciliation.verdictLabel).toBe('Difference requiring review');

      if (reconciliation.calculatedAmount.kind !== 'known') throw new Error('expected known');
      expect(toDecimalString(reconciliation.calculatedAmount.value)).toBe('70000.00');

      if (reconciliation.difference.kind !== 'known') throw new Error('expected known');
      // Signed: stated minus calculated. The claim understates by $25,000.
      expect(toDecimalString(reconciliation.difference.value)).toBe('-25000.00');
      const magnitude =
        reconciliation.difference.value.cents < 0n
          ? -reconciliation.difference.value.cents
          : reconciliation.difference.value.cents;
      expect(magnitude).toBe(2500000n);
    });

    it('does not call the difference an error', () => {
      const text = JSON.stringify(reconciliation, (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      ).toLowerCase();
      for (const forbidden of ['incorrect', 'erroneous', 'fraud', 'misconduct', 'overpayment']) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('reports the tolerance it applied', () => {
      expect(reconciliation.toleranceDescription).toBe('$1.00 absolute difference');
    });
  });
});
