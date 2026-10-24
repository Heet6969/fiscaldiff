import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../../src/data/generate/demoDataset';
import { importTable } from '../../src/data/csv/importers';
import { datasetTableToCsv } from '../../src/data/csv/serialize';
import { ALL_SCHEMAS, templateCsv } from '../../src/data/csv/schema';
import { validateCsv, type ImportProblem } from '../../src/data/csv/validate';
import { computeOffer } from '../../src/engine';
import { toDecimalString } from '../../src/money/money';

const FIXTURES = join(process.cwd(), 'public', 'fixtures');

function fixture(...parts: string[]): string {
  return readFileSync(join(FIXTURES, ...parts), 'utf8');
}

function messages(problems: readonly ImportProblem[]): string {
  return problems.map((p) => `${p.row}:${p.column}:${p.message}`).join('\n');
}

describe('templates', () => {
  it('generates a template for every schema that its own validator accepts', () => {
    for (const schema of ALL_SCHEMAS) {
      const outcome = validateCsv(templateCsv(schema), schema);
      expect(outcome.ok, `${schema.id}: ${outcome.ok ? '' : messages(outcome.problems)}`).toBe(true);
    }
  });
});

describe('valid import', () => {
  it('replaces the cohort and recomputes totals from the new records', () => {
    const before = buildDemoDataset();
    const outcome = importTable('employees', fixture('valid-baseline', 'employees.csv'), before);

    expect(outcome.ok, outcome.ok ? '' : messages(outcome.problems)).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.dataset.employees).toHaveLength(6);
    expect(outcome.summary).toContain('6 imported rows');

    // The baseline is recomputed, not carried over.
    const sumOfFile = 61500 + 57200 + 64800 + 52300 + 70100 + 56900;
    const result = computeOffer(outcome.dataset, 'A');
    expect(result.baseline.annualBasePay.kind).toBe('known');
    if (result.baseline.annualBasePay.kind !== 'known') return;
    expect(toDecimalString(result.baseline.annualBasePay.value)).toBe(`${sumOfFile}.00`);

    // Only 5 of the 6 are bonus-eligible, and eligibility is explicit.
    expect(result.baseline.bonusEligibleCount).toBe(5);
    expect(result.baseline.overtimeEligibleCount).toBe(5);
  });

  it('round-trips an export back through the importer unchanged', () => {
    const dataset = buildDemoDataset();
    for (const table of ['employees', 'overtime_records', 'comparators'] as const) {
      const csv = datasetTableToCsv(dataset, table);
      const outcome = importTable(table, csv, dataset);
      expect(outcome.ok, `${table}: ${outcome.ok ? '' : messages(outcome.problems)}`).toBe(true);
      if (!outcome.ok) continue;
      expect(datasetTableToCsv(outcome.dataset, table)).toBe(csv);
    }
  });

  it('preserves the overtime history length and figures through a round trip', () => {
    const dataset = buildDemoDataset();
    const outcome = importTable('overtime_records', datasetTableToCsv(dataset, 'overtime_records'), dataset);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.overtimeRecords).toHaveLength(24);
  });
});

describe('invalid imports are rejected with actionable detail', () => {
  const cases: readonly [string, string, (text: string) => boolean][] = [
    ['employees-duplicate-id.csv', 'duplicate identifier', (m) => m.toLowerCase().includes('duplicate identifier')],
    ['employees-invalid-number.csv', 'not a valid amount', (m) => m.includes('not a valid amount')],
    ['employees-missing-required.csv', 'required', (m) => m.toLowerCase().includes('required')],
    ['employees-unknown-column.csv', 'unrecognised column', (m) => m.toLowerCase().includes('unrecognised column')],
  ];

  for (const [file, label, matcher] of cases) {
    it(`rejects ${file} reporting ${label}`, () => {
      const dataset = buildDemoDataset();
      const outcome = importTable('employees', fixture('invalid-imports', file), dataset);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      const text = messages(outcome.problems);
      expect(matcher(text), text).toBe(true);
      // Every problem must be locatable by the person fixing the file.
      expect(outcome.problems.every((p) => p.row !== null || p.column !== null)).toBe(true);
    });
  }

  it('rejects an invalid month and names the offending rows', () => {
    const dataset = buildDemoDataset();
    const outcome = importTable('overtime_records', fixture('invalid-imports', 'overtime-invalid-date.csv'), dataset);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    const rows = outcome.problems.map((p) => p.row);
    expect(rows).toContain(2);
    expect(rows).toContain(3);
    expect(messages(outcome.problems)).toContain('YYYY-MM');
  });

  it('rejects dollars recorded against zero hours as inconsistent', () => {
    const dataset = buildDemoDataset();
    const outcome = importTable(
      'overtime_records',
      fixture('invalid-imports', 'overtime-inconsistent-total.csv'),
      dataset,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(messages(outcome.problems)).toContain('Inconsistent row');
  });

  it('rejects an empty file and a header-only file', () => {
    const dataset = buildDemoDataset();
    expect(importTable('employees', '', dataset).ok).toBe(false);
    expect(importTable('employees', 'employee_id,role\n', dataset).ok).toBe(false);
  });
});

describe('a failed import changes nothing', () => {
  it('leaves the previous dataset byte-identical', () => {
    const before = buildDemoDataset();
    const snapshot = datasetTableToCsv(before, 'employees');

    for (const file of [
      'employees-duplicate-id.csv',
      'employees-invalid-number.csv',
      'employees-missing-required.csv',
      'employees-unknown-column.csv',
    ]) {
      const outcome = importTable('employees', fixture('invalid-imports', file), before);
      expect(outcome.ok).toBe(false);
      // The importer returns problems and no dataset, so the caller has
      // nothing to swap in. The original is untouched.
      expect('dataset' in outcome).toBe(false);
    }

    expect(datasetTableToCsv(before, 'employees')).toBe(snapshot);
    expect(before.employees).toHaveLength(50);
  });
});

describe('value states survive a file round trip', () => {
  it('maps empty to missing, UNKNOWN to unknown and EXCLUDED to excluded', () => {
    const csv = [
      'month,overtime_hours,overtime_dollars,overtime_budget_dollars,provenance,source_label',
      '2026-01,,17750.00,18000.00,source-supported,Ledger',
      '2026-02,400,UNKNOWN,18000.00,source-supported,Ledger',
      '2026-03,400,17000.00,EXCLUDED,source-supported,Ledger',
      '2026-04,0,0.00,18000.00,source-supported,Ledger',
    ].join('\n');

    const outcome = importTable('overtime_records', csv, buildDemoDataset());
    expect(outcome.ok, outcome.ok ? '' : messages(outcome.problems)).toBe(true);
    if (!outcome.ok) return;

    const [jan, feb, mar, apr] = outcome.dataset.overtimeRecords;
    expect(jan?.hours.state.kind).toBe('missing');
    expect(feb?.dollars.state.kind).toBe('unknown');
    expect(mar?.budgetDollars?.state.kind).toBe('excluded');

    // A recorded zero stays a known zero, distinct from all three above.
    expect(apr?.hours.state.kind).toBe('known');
    expect(apr?.hours.state.kind === 'known' && apr.hours.state.value).toBe(0);
  });

  it('honours the declared provenance instead of relabelling imports', () => {
    const csv = [
      'employee_id,role,grade_step,annual_base_salary,scheduled_hours_per_week,weeks_per_year,overtime_eligible,bonus_eligible,provenance,source_label',
      'X-1,Operator,PW-4,60000.00,40,52,true,true,source-supported,Position schedule',
    ].join('\n');

    const outcome = importTable('employees', csv, buildDemoDataset());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.employees[0]?.annualBaseSalary.provenance).toBe('source-supported');
  });
});

describe('deterministic demo data', () => {
  it('produces identical records on every build', () => {
    expect(datasetTableToCsv(buildDemoDataset(), 'overtime_records')).toBe(
      datasetTableToCsv(buildDemoDataset(), 'overtime_records'),
    );
  });

  it('contains 24 complete months and 50 employees', () => {
    const dataset = buildDemoDataset();
    expect(dataset.overtimeRecords).toHaveLength(24);
    expect(dataset.employees).toHaveLength(50);
    expect(dataset.overtimeRecords.every((r) => r.hours.state.kind === 'known')).toBe(true);
    expect(dataset.overtimeRecords.every((r) => r.dollars.state.kind === 'known')).toBe(true);
  });

  it('derives every demo total from records rather than storing a result', () => {
    const dataset = buildDemoDataset();
    const result = computeOffer(dataset, 'A');
    // 50 employees at $60,000 is $3,000,000, summed from the employee rows.
    if (result.baseline.annualBasePay.kind !== 'known') throw new Error('expected known');
    expect(toDecimalString(result.baseline.annualBasePay.value)).toBe('3000000.00');
  });
});
