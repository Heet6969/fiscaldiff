import { describe, expect, it } from 'vitest';
import type { Dataset, OvertimeRecord } from '../../src/domain/dataset';
import { known, missing, unknownInput } from '../../src/domain/types';
import { fromDollars, toDecimalString } from '../../src/money/money';
import {
  DEFAULT_REVIEW_THRESHOLDS,
  effectiveHourlyCost,
  evaluateFlags,
  monthlyOvertimeRows,
  overtimeTotals,
  percentChange,
} from '../../src/engine';
import { buildAcceptanceDataset } from './helpers/acceptanceCase';

function datasetWithRecords(records: OvertimeRecord[], monthlyBudget?: string): Dataset {
  const base = buildAcceptanceDataset();
  return {
    ...base,
    overtimeRecords: records,
    ...(monthlyBudget
      ? { overtimeMonthlyBudget: known(fromDollars(monthlyBudget), 'user-assumption') }
      : {}),
  };
}

function record(month: string, hours: number | null, dollars: string | null): OvertimeRecord {
  return {
    month,
    hours: hours === null ? missing('synthetic-sample') : known(hours, 'synthetic-sample'),
    dollars: dollars === null ? missing('synthetic-sample') : known(fromDollars(dollars), 'synthetic-sample'),
  };
}

describe('effective hourly cost', () => {
  it('divides dollars by hours when both are known', () => {
    const result = effectiveHourlyCost(known(100, 'synthetic-sample').state, known(fromDollars('4000'), 'synthetic-sample').state);
    expect(result.kind).toBe('computed');
    if (result.kind !== 'computed') return;
    expect(toDecimalString(result.amount)).toBe('40.00');
  });

  it('refuses to divide by zero hours', () => {
    const result = effectiveHourlyCost(
      known(0, 'synthetic-sample').state,
      known(fromDollars('500'), 'synthetic-sample').state,
    );
    expect(result.kind).toBe('not-enough-data');
    if (result.kind !== 'not-enough-data') return;
    expect(result.reason).toContain('zero');
  });

  it('refuses when a value is missing or unknown', () => {
    expect(
      effectiveHourlyCost(missing<number>('synthetic-sample').state, known(fromDollars('500'), 'synthetic-sample').state).kind,
    ).toBe('not-enough-data');
    expect(
      effectiveHourlyCost(known(10, 'synthetic-sample').state, unknownInput<ReturnType<typeof fromDollars>>('synthetic-sample').state).kind,
    ).toBe('not-enough-data');
  });
});

describe('percentage change guards', () => {
  it('computes an ordinary change', () => {
    const result = percentChange(400, 500);
    expect(result.kind).toBe('computed');
    if (result.kind !== 'computed') return;
    expect(result.percent.toFixed(2)).toBe('25.00');
  });

  it('never produces Infinity or NaN from a zero baseline', () => {
    const result = percentChange(0, 500);
    expect(result.kind).toBe('not-enough-data');
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('Infinity');
    expect(serialised).not.toContain('null');
  });

  it('refuses when a comparison value is absent', () => {
    expect(percentChange(undefined, 500).kind).toBe('not-enough-data');
    expect(percentChange(400, undefined).kind).toBe('not-enough-data');
  });
});

describe('monthly rows', () => {
  it('marks a missing value as missing rather than zero', () => {
    const rows = monthlyOvertimeRows(datasetWithRecords([record('2026-01', null, '5000')]));
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.hours.kind).toBe('missing');
    expect(row.isComplete).toBe(false);
    expect(row.effectiveHourlyCost.kind).toBe('not-enough-data');
  });

  it('orders rows chronologically regardless of input order', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([
        record('2026-03', 100, '4000'),
        record('2025-12', 100, '4000'),
        record('2026-01', 100, '4000'),
      ]),
    );
    expect(rows.map((r) => r.month)).toEqual(['2025-12', '2026-01', '2026-03']);
  });

  it('blocks totals when any month is incomplete, instead of totalling a subset', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 100, '4000'), record('2026-02', null, '4000')]),
    );
    const totals = overtimeTotals(rows);
    expect(totals.totalHours.kind).toBe('missing');
    expect(totals.monthsIncomplete).toBe(1);
    expect(totals.overallEffectiveHourlyCost.kind).toBe('not-enough-data');
  });

  it('reports no budget variance when no budget exists', () => {
    const rows = monthlyOvertimeRows(datasetWithRecords([record('2026-01', 100, '4000')]));
    expect(rows[0]?.budgetVariance.kind).toBe('no-budget');
  });
});

describe('review flags', () => {
  it('flags an hours increase against the immediately preceding complete month', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 400, '16000'), record('2026-02', 520, '20800')]),
    );
    const { flags } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);
    const hoursFlag = flags.find((f) => f.kind === 'hours-increase');

    expect(hoursFlag).toBeDefined();
    if (!hoursFlag) return;
    expect(hoursFlag.label).toBe('Needs review');
    expect(hoursFlag.months).toEqual(['2026-01', '2026-02']);
    expect(hoursFlag.comparison).toContain('immediately preceding complete month');
    expect(hoursFlag.comparison).toContain('January 2026');
    expect(hoursFlag.threshold).toContain('25%');
    expect(hoursFlag.disclaimer).toContain('Not an industry standard');
  });

  it('does not flag an increase below the threshold', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 400, '16000'), record('2026-02', 460, '18400')]),
    );
    const { flags } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);
    expect(flags.filter((f) => f.kind === 'hours-increase')).toHaveLength(0);
  });

  it('respects a reconfigured threshold', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 400, '16000'), record('2026-02', 460, '18400')]),
    );
    const { flags } = evaluateFlags(rows, { ...DEFAULT_REVIEW_THRESHOLDS, hoursIncreasePercent: 10 });
    const flag = flags.find((f) => f.kind === 'hours-increase');
    expect(flag).toBeDefined();
    expect(flag?.threshold).toContain('10%');
  });

  it('flags a material change in effective hourly cost', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 400, '16000'), record('2026-02', 400, '20000')]),
    );
    const { flags } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);
    const costFlag = flags.find((f) => f.kind === 'effective-hourly-cost-change');
    expect(costFlag).toBeDefined();
    expect(costFlag?.comparison).toContain('dollars ÷ hours');
    expect(costFlag?.summary).toContain('does not infer why');
  });

  it('flags spending above the entered budget', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 400, '20000')], '18000'),
    );
    const { flags } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);
    const budgetFlag = flags.find((f) => f.kind === 'budget-overage');
    expect(budgetFlag).toBeDefined();
    expect(budgetFlag?.summary).toContain('+$2,000.00');
    expect(budgetFlag?.threshold).toContain('entered monthly overtime budget');
  });

  it('reports a month as not assessed when there is nothing to compare against', () => {
    const rows = monthlyOvertimeRows(datasetWithRecords([record('2026-01', 400, '16000')]));
    const { flags, notAssessed } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);
    expect(flags).toHaveLength(0);
    expect(notAssessed[0]?.reason).toContain('no earlier complete month');
  });

  it('does not compare against an incomplete month, and says so', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([
        record('2026-01', 400, '16000'),
        record('2026-02', null, null),
        record('2026-03', 600, '24000'),
      ]),
    );
    const { flags, notAssessed } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);

    // March is compared against January, the preceding *complete* month.
    const hoursFlag = flags.find((f) => f.kind === 'hours-increase');
    expect(hoursFlag?.months).toEqual(['2026-01', '2026-03']);

    const februaryNote = notAssessed.find((n) => n.month === '2026-02');
    expect(februaryNote?.reason).toContain('not read as zero');
  });

  it('produces no percentage flag from a zero comparison month', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 0, '0'), record('2026-02', 500, '20000')]),
    );
    const { flags, notAssessed } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);
    expect(flags.filter((f) => f.kind === 'hours-increase')).toHaveLength(0);
    expect(notAssessed.some((n) => n.reason.includes('no meaning'))).toBe(true);
  });

  it('never uses accusatory language', () => {
    const rows = monthlyOvertimeRows(
      datasetWithRecords([record('2026-01', 400, '16000'), record('2026-02', 900, '45000')], '18000'),
    );
    const { flags } = evaluateFlags(rows, DEFAULT_REVIEW_THRESHOLDS);
    expect(flags.length).toBeGreaterThan(0);
    const text = JSON.stringify(flags).toLowerCase();
    for (const forbidden of ['fraud', 'misconduct', 'abuse', 'incorrect pay', 'overpayment', 'theft']) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    for (const flag of flags) expect(flag.label).toBe('Needs review');
  });
});
