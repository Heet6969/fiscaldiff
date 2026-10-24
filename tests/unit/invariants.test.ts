/**
 * Property-based tests for the arithmetic invariants.
 *
 * These generate inputs rather than asserting single examples, so they catch
 * the combinations a hand-written case would miss.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildAcceptanceEmployees, ACCEPTANCE_FISCAL_YEAR } from './helpers/acceptanceCase';
import { computeEngineView, computeOffer, DEFAULT_REVIEW_THRESHOLDS } from '../../src/engine';
import type { Dataset, OvertimeModel } from '../../src/domain/dataset';
import { known } from '../../src/domain/types';
import { add, fromCents, subtract, type Money } from '../../src/money/money';

const excludedOvertime: OvertimeModel = {
  kind: 'excluded',
  reason: 'Excluded for this generated case.',
};

function buildDataset(options: {
  headcount: number;
  salaryCents: number;
  raisePercent: number;
  effectiveDate: string;
  bonusCents: number;
  overtime?: OvertimeModel;
  baselineOvertime?: OvertimeModel;
}): Dataset {
  const employees = buildAcceptanceEmployees(options.headcount).map((e) => ({
    ...e,
    annualBaseSalary: known(fromCents(BigInt(options.salaryCents)), 'synthetic-sample'),
  }));

  const overtime = options.overtime ?? excludedOvertime;

  return {
    meta: { isSynthetic: true, label: 'Generated', generatedFrom: 'property test' },
    fiscalYear: ACCEPTANCE_FISCAL_YEAR,
    department: { id: 'GEN', name: 'Generated cohort (synthetic)' },
    employees,
    baselineOvertime: options.baselineOvertime ?? excludedOvertime,
    overtimeRecords: [],
    offers: {
      A: {
        id: 'A',
        label: 'Generated offer',
        basePayRaisePercent: known(options.raisePercent, 'user-assumption'),
        raiseEffectiveDate: known(options.effectiveDate, 'user-assumption'),
        oneTimeBonusPerEmployee: known(fromCents(BigInt(options.bonusCents)), 'user-assumption'),
        bonusPaymentDate: known('2026-12-18', 'user-assumption'),
        overtime,
      },
      B: {
        id: 'B',
        label: 'Unused',
        basePayRaisePercent: known(0, 'user-assumption'),
        raiseEffectiveDate: known('2026-07-01', 'user-assumption'),
        oneTimeBonusPerEmployee: known(fromCents(0n), 'user-assumption'),
        bonusPaymentDate: known('2026-07-01', 'user-assumption'),
        overtime: excludedOvertime,
      },
    },
    comparators: [],
    statedCosts: [],
  };
}

const headcount = fc.integer({ min: 1, max: 200 });
const salaryCents = fc.integer({ min: 100, max: 50_000_000 });
const raisePercent = fc.double({ min: 0, max: 25, noNaN: true, noDefaultInfinity: true });
const bonusCents = fc.integer({ min: 0, max: 1_000_000 });
const effectiveDate = fc.constantFrom(
  '2026-07-01',
  '2026-08-15',
  '2026-11-01',
  '2027-01-01',
  '2027-02-14',
  '2027-06-30',
  '2027-09-01',
);

function known1(state: { kind: string } & Record<string, unknown>): Money {
  if (state.kind !== 'known') throw new Error(`expected known, got ${state.kind}`);
  return state.value as Money;
}

describe('arithmetic invariants', () => {
  it('incremental cost equals total proposed expenditure minus baseline', () => {
    fc.assert(
      fc.property(headcount, salaryCents, raisePercent, effectiveDate, bonusCents, (hc, sal, pct, date, bonus) => {
        const r = computeOffer(
          buildDataset({
            headcount: hc,
            salaryCents: sal,
            raisePercent: pct,
            effectiveDate: date,
            bonusCents: bonus,
          }),
          'A',
        );
        const derived = subtract(known1(r.totalProposedExpenditure), known1(r.baselineTotalCost));
        expect(derived.cents).toBe(known1(r.currentYearTotalIncremental).cents);
      }),
      { numRuns: 300 },
    );
  });

  it('the components always sum exactly to the reported total', () => {
    fc.assert(
      fc.property(headcount, salaryCents, raisePercent, effectiveDate, bonusCents, (hc, sal, pct, date, bonus) => {
        const r = computeOffer(
          buildDataset({
            headcount: hc,
            salaryCents: sal,
            raisePercent: pct,
            effectiveDate: date,
            bonusCents: bonus,
          }),
          'A',
        );
        const sum = add(known1(r.currentYearBasePayIncrement), known1(r.oneTimeCost));
        expect(sum.cents).toBe(known1(r.currentYearTotalIncremental).cents);
      }),
      { numRuns: 300 },
    );
  });

  it('a zero raise and zero bonus always give exactly zero incremental cost', () => {
    fc.assert(
      fc.property(headcount, salaryCents, effectiveDate, (hc, sal, date) => {
        const r = computeOffer(
          buildDataset({
            headcount: hc,
            salaryCents: sal,
            raisePercent: 0,
            effectiveDate: date,
            bonusCents: 0,
          }),
          'A',
        );
        expect(known1(r.currentYearTotalIncremental).cents).toBe(0n);
        expect(known1(r.annualizedRecurringIncrease).cents).toBe(0n);
      }),
      { numRuns: 200 },
    );
  });

  it('never charges more in the current year than the annualized recurring increase plus one-time cost', () => {
    fc.assert(
      fc.property(headcount, salaryCents, raisePercent, effectiveDate, bonusCents, (hc, sal, pct, date, bonus) => {
        const r = computeOffer(
          buildDataset({
            headcount: hc,
            salaryCents: sal,
            raisePercent: pct,
            effectiveDate: date,
            bonusCents: bonus,
          }),
          'A',
        );
        const ceiling = add(known1(r.annualizedRecurringIncrease), known1(r.oneTimeCost));
        expect(known1(r.currentYearTotalIncremental).cents <= ceiling.cents).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  // Covered with overtime both excluded and modeled. With a derived overtime
  // rate the annualized figure is a full year at the post-raise rate, so it
  // still must not move with the effective date.
  for (const overtimeMode of ['excluded', 'modeled'] as const) {
    it(`the annualized recurring increase never depends on the effective date (overtime ${overtimeMode})`, () => {
      const overtime: OvertimeModel =
        overtimeMode === 'excluded'
          ? excludedOvertime
          : {
              kind: 'modeled',
              monthlyHours: known(420, 'user-assumption'),
              rate: { kind: 'derived', multiplier: known(1.5, 'user-assumption') },
            };

      fc.assert(
        fc.property(headcount, salaryCents, raisePercent, (hc, sal, pct) => {
          const amounts = [
            '2026-07-01',
            '2026-10-09',
            '2027-01-01',
            '2027-06-30',
            '2027-12-01',
          ].map((date) =>
            known1(
              computeOffer(
                buildDataset({
                  headcount: hc,
                  salaryCents: sal,
                  raisePercent: pct,
                  effectiveDate: date,
                  bonusCents: 0,
                  overtime,
                  baselineOvertime: overtime,
                }),
                'A',
              ).annualizedRecurringIncrease,
            ).cents,
          );
          expect(new Set(amounts.map(String)).size).toBe(1);
        }),
        { numRuns: 100 },
      );
    });
  }

  it('is deterministic: the same dataset always gives the same figures', () => {
    fc.assert(
      fc.property(headcount, salaryCents, raisePercent, effectiveDate, bonusCents, (hc, sal, pct, date, bonus) => {
        const make = () =>
          buildDataset({
            headcount: hc,
            salaryCents: sal,
            raisePercent: pct,
            effectiveDate: date,
            bonusCents: bonus,
          });
        const first = computeOffer(make(), 'A');
        const second = computeOffer(make(), 'A');
        expect(known1(second.currentYearTotalIncremental).cents).toBe(
          known1(first.currentYearTotalIncremental).cents,
        );
      }),
      { numRuns: 150 },
    );
  });
});

describe('cross-view agreement', () => {
  it('gives the same offer figures through the combined view as through the offer function', () => {
    fc.assert(
      fc.property(headcount, salaryCents, raisePercent, effectiveDate, bonusCents, (hc, sal, pct, date, bonus) => {
        const dataset = buildDataset({
          headcount: hc,
          salaryCents: sal,
          raisePercent: pct,
          effectiveDate: date,
          bonusCents: bonus,
        });
        const direct = computeOffer(dataset, 'A');
        const combined = computeEngineView(dataset, DEFAULT_REVIEW_THRESHOLDS).offers.A;
        expect(known1(combined.currentYearTotalIncremental).cents).toBe(
          known1(direct.currentYearTotalIncremental).cents,
        );
        expect(known1(combined.annualizedRecurringIncrease).cents).toBe(
          known1(direct.annualizedRecurringIncrease).cents,
        );
      }),
      { numRuns: 150 },
    );
  });
});
