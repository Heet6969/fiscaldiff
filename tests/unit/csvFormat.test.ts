/**
 * Regression tests for CSV export readability.
 *
 * The reported fault: the calculation report contained characters such as "—"
 * and was written as UTF-8 with no byte-order mark, so Windows Excel read it as
 * Windows-1252 and showed "â€”". These tests pin the encoding, the quoting, the
 * numeric values, BOM-aware import and spreadsheet-formula safety.
 */
import Papa from 'papaparse';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../../src/data/generate/demoDataset';
import { importTable } from '../../src/data/csv/importers';
import { datasetTableToCsv } from '../../src/data/csv/serialize';
import { ALL_SCHEMAS, templateCsv } from '../../src/data/csv/schema';
import { validateCsv } from '../../src/data/csv/validate';
import {
  CSV_BOM,
  CSV_MIME_TYPE,
  csvBytes,
  csvDocument,
  csvField,
  protectFormula,
  stripBom,
} from '../../src/data/csv/format';
import { calculationBreakdownCsv } from '../../src/export/breakdown';
import { checkStatedCost, computeEngineView, DEFAULT_REVIEW_THRESHOLDS } from '../../src/engine';
import type { Dataset } from '../../src/domain/dataset';
import { known } from '../../src/domain/types';
import { fromDollars, toDecimalString } from '../../src/money/money';

function buildReport(dataset: Dataset): string {
  const view = computeEngineView(dataset, DEFAULT_REVIEW_THRESHOLDS);
  const claim = dataset.statedCosts[0];
  return calculationBreakdownCsv({
    dataset,
    offerId: 'A',
    offer: view.offers.A,
    budget: view.budgets.A,
    overtimeRows: view.overtimeRows,
    flags: view.flags.flags,
    reconciliation: claim ? checkStatedCost(dataset, claim, 'A') : undefined,
    generatedOn: '2026-10-24',
  });
}

function parse(text: string): string[][] {
  return Papa.parse<string[]>(stripBom(text), { delimiter: ',', newline: '\r\n' }).data;
}

describe('encoding and byte-order mark', () => {
  const dataset = buildDemoDataset();
  const report = buildReport(dataset);

  it('writes the report as UTF-8 with exactly one BOM', () => {
    const bytes = csvBytes(report);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // The BOM is not doubled when the text already has one.
    expect([...csvBytes(CSV_BOM + report).slice(0, 6)]).toEqual(
      [...csvBytes(report).slice(0, 6)],
    );
    expect([...bytes.slice(3, 6)]).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it('keeps the real characters instead of replacing them', () => {
    const decoded = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvBytes(report));
    expect(decoded.startsWith(`${CSV_BOM}CivicVariance — calculation breakdown`)).toBe(true);
    for (const ch of ['—', '–', '÷', '×', '−']) expect(decoded).toContain(ch);
    expect(decoded).not.toContain('\uFFFD');
    // No mojibake: this is what the unfixed file looked like in Excel.
    expect(decoded).not.toMatch(/â€|Ã—|Ã·|â\u0088/);
  });

  it('would have been unreadable without the BOM: the original fault', () => {
    // Excel without a BOM reads the bytes as Windows-1252.
    const withoutBom = new TextEncoder().encode(report);
    const asExcelWouldRead = new TextDecoder('windows-1252').decode(withoutBom);
    expect(asExcelWouldRead).toContain('â€”');
  });

  it('declares UTF-8 in the MIME type', () => {
    expect(CSV_MIME_TYPE).toBe('text/csv;charset=utf-8');
  });

  it('applies the same encoding to templates and current-data files', () => {
    for (const schema of ALL_SCHEMAS) {
      expect(templateCsv(schema).includes('\r\n')).toBe(true);
      expect([...csvBytes(templateCsv(schema)).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    }
    for (const table of ['employees', 'overtime_records', 'comparators'] as const) {
      expect([...csvBytes(datasetTableToCsv(dataset, table)).slice(0, 3)]).toEqual([
        0xef, 0xbb, 0xbf,
      ]);
    }
  });
});

describe('row endings and structure', () => {
  const dataset = buildDemoDataset();
  const report = buildReport(dataset);

  it('ends every row with CRLF and never uses a bare LF between rows', () => {
    expect(report.endsWith('\r\n')).toBe(true);
    // Remove quoted fields; what is left are real row boundaries.
    const outsideQuotes = report.replace(/"(?:[^"]|"")*"/g, '""');
    expect(outsideQuotes).not.toMatch(/(?<!\r)\n/);
    expect(outsideQuotes).not.toMatch(/\r(?!\n)/);
  });

  it('is a regular grid: every row has the same number of fields', () => {
    const rows = parse(report).filter((r, i, all) => !(i === all.length - 1 && r.length === 1 && r[0] === ''));
    const widths = new Set(rows.map((r) => r.length));
    expect(widths.size).toBe(1);
  });

  it('parses cleanly as strict comma-separated text', () => {
    const result = Papa.parse(stripBom(report), { delimiter: ',', newline: '\r\n' });
    expect(result.errors).toEqual([]);
  });

  it('keeps branding, the synthetic label, assumptions, exclusions and dates', () => {
    expect(report).toContain('CivicVariance — calculation breakdown');
    expect(report).toContain('Understand workforce costs. Explain every difference.');
    expect(report).toContain('Synthetic demo data');
    expect(report).toContain('Monthly proration');
    expect(report).toContain('Pension and retirement contributions');
    expect(report).toContain('2026-10-24');
    expect(report).toContain('FY2027');
  });

  it('labels the offer once, without a doubled prefix', () => {
    expect(report).toContain('Offer,Offer A — union request');
    expect(report).not.toContain('A — Offer A');
  });

  it('says it is a report rather than an import file', () => {
    expect(report).toContain('It is not an import file');
  });

  it('contains no serialised or technical values', () => {
    for (const token of ['undefined', 'NaN', '[object', 'Infinity', 'null', '{"']) {
      expect(report, token).not.toContain(token);
    }
    // Money is written as plain decimals, never as a BigInt literal like 100n.
    expect(report).not.toMatch(/\d+n[,\r]/);
  });
});

describe('quoting', () => {
  it('quotes commas and doubles embedded quotation marks', () => {
    expect(csvField('Smith, Jane')).toBe('"Smith, Jane"');
    expect(csvField('She said "yes"')).toBe('"She said ""yes"""');
    expect(csvField('plain text')).toBe('plain text');
  });

  it('quotes line breaks and normalises them to a single LF inside the cell', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField('line one\r\nline two')).toBe('"line one\nline two"');
    expect(csvField('line one\rline two')).toBe('"line one\nline two"');
  });

  it('keeps Unicode text intact', () => {
    const text = 'Café — São Paulo × 2 ÷ 3 − 1 · 日本語 · Ελληνικά';
    expect(csvField(text)).toBe(text);
    const rows = parse(csvDocument([[text, 'b'], ['c', 'd']]));
    expect(rows[0]?.[0]).toBe(text);
  });

  it('round-trips awkward text through a real CSV parser', () => {
    const awkward = [
      'a,b',
      'say "hi"',
      'two\nlines',
      '"quoted"',
      ',',
      '""',
      ' leading and trailing ',
      'tab\there',
      '—',
    ];
    const rows = parse(csvDocument([awkward]));
    expect(rows[0]).toEqual(awkward);
  });

  it('writes arbitrary text so a CSV parser reads back exactly what was written (property test)', () => {
    const cell = fc
      .string({ unit: fc.constantFrom(...'abc ,"\n—é日0-+=@\'\t'), maxLength: 12 })
      // Carriage returns are normalised by design, so they are not generated.
      .filter((s) => !s.includes('\r'));
    fc.assert(
      fc.property(fc.array(fc.tuple(cell, cell, cell), { minLength: 1, maxLength: 6 }), (rows) => {
        const grid = rows.map((r) => [...r]);
        const parsed = parse(csvDocument(grid)).slice(0, grid.length);
        // The file holds exactly the protected form of each cell: quoting, commas,
        // quotes and line breaks never change the content, and the only edit is
        // the single documented formula-protection apostrophe.
        expect(parsed).toEqual(grid.map((r) => r.map((v) => protectFormula(v))));
        // Text that does not start with a formula character is untouched.
        grid.forEach((r, i) =>
          r.forEach((v, j) => {
            if (!/^[=+\-@\t]/.test(v)) expect(parsed[i]?.[j]).toBe(v);
          }),
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe('numeric values stay unchanged', () => {
  it('leaves plain and negative numbers untouched, with no quote prefix', () => {
    for (const n of ['3218080.80', '-25000.00', '0.00', '1234567890123.45', '-0.01', '+5', '394', '402.8']) {
      expect(protectFormula(n), n).toBe(n);
      expect(csvField(n), n).toBe(n);
    }
  });

  it('leaves formatted currency amounts untouched', () => {
    for (const n of ['$3,000,000.00', '-$25,000.00', '+$12,163.87', '$0.00', '-$4,665.27']) {
      expect(protectFormula(n), n).toBe(n);
    }
  });

  it('keeps full precision for every money column in the report', () => {
    const dataset = buildDemoDataset();
    const report = buildReport(dataset);
    const view = computeEngineView(dataset, DEFAULT_REVIEW_THRESHOLDS);
    const a = view.offers.A;
    if (a.currentYearTotalIncremental.kind !== 'known') throw new Error('expected known');
    const exact = toDecimalString(a.currentYearTotalIncremental.value);
    expect(exact).toBe('73276.00');
    expect(parse(report).some((r) => r[0] === 'Current fiscal-year incremental cost' && r[1] === exact)).toBe(true);

    // The signed difference keeps its minus sign and is not turned into text.
    const diffRow = parse(report).find((r) => r[0] === 'Difference, stated minus calculated (USD)');
    expect(diffRow?.[1]).toBe('-25000.00');
  });

  it('does not alter amounts during a data round trip', () => {
    const dataset = buildDemoDataset();
    const csv = datasetTableToCsv(dataset, 'overtime_records');
    const outcome = importTable('overtime_records', csv, dataset);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(datasetTableToCsv(outcome.dataset, 'overtime_records')).toBe(csv);
  });

  it('writes a big salary with all its cents', () => {
    const dataset = buildDemoDataset();
    const first = dataset.employees[0];
    if (!first) throw new Error('no employees');
    const custom: Dataset = {
      ...dataset,
      employees: [
        { ...first, annualBaseSalary: known(fromDollars('987654321.09'), 'synthetic-sample') },
      ],
    };
    expect(datasetTableToCsv(custom, 'employees')).toContain(',987654321.09,');
  });
});

describe('BOM-aware import of supported round-trip formats', () => {
  const dataset = buildDemoDataset();

  it('re-imports every per-table download, BOM and CRLF included', () => {
    for (const table of ['employees', 'overtime_records', 'comparators'] as const) {
      const exported = datasetTableToCsv(dataset, table);
      // What the browser actually saves: BOM-prefixed UTF-8.
      const asSaved = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvBytes(exported));
      expect(asSaved.charCodeAt(0)).toBe(0xfeff);

      const outcome = importTable(table, asSaved, dataset);
      expect(outcome.ok, table).toBe(true);
      if (!outcome.ok) continue;
      expect(datasetTableToCsv(outcome.dataset, table)).toBe(exported);
    }
  });

  it('accepts a BOM on the very first column name', () => {
    for (const schema of ALL_SCHEMAS) {
      const outcome = validateCsv(CSV_BOM + templateCsv(schema), schema);
      expect(outcome.ok, schema.id).toBe(true);
    }
  });

  it('accepts the same file with and without a BOM', () => {
    const csv = datasetTableToCsv(dataset, 'employees');
    expect(importTable('employees', csv, dataset).ok).toBe(true);
    expect(importTable('employees', CSV_BOM + csv, dataset).ok).toBe(true);
  });

  it('still rejects a bad file that happens to start with a BOM, with a useful message', () => {
    const outcome = importTable('employees', `${CSV_BOM}employee_id,role\r\nX,Y\r\n`, dataset);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems.map((p) => p.message).join(' ')).toContain('missing required column');
  });

  it('survives text with commas, quotes, line breaks and Unicode through a round trip', () => {
    const first = dataset.employees[0];
    if (!first) throw new Error('no employees');
    const awkwardRole = 'Operator, "Level 2"\nNight shift — Café';
    const custom: Dataset = { ...dataset, employees: [{ ...first, role: awkwardRole }] };

    const csv = datasetTableToCsv(custom, 'employees');
    const outcome = importTable('employees', CSV_BOM + csv, custom);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.employees[0]?.role).toBe(awkwardRole);
  });

  it('does not promise round trip for the report, and the importer refuses it', () => {
    const report = buildReport(dataset);
    for (const table of ['employees', 'overtime_records', 'comparators'] as const) {
      expect(importTable(table, report, dataset).ok, table).toBe(false);
    }
  });
});

describe('spreadsheet-formula safety', () => {
  const triggers = ['=SUM(A1:A9)', '=HYPERLINK("http://x","y")', '+cmd|calc', '-2+3', '@SUM(1)', '\t=1+1'];

  it('prefixes risky text so a spreadsheet will not run it', () => {
    for (const text of triggers) {
      const out = csvField(text).replace(/^"|"$/g, '');
      expect(out.startsWith("'"), text).toBe(true);
    }
  });

  it('does not prefix ordinary text, dates or months', () => {
    for (const text of ['Operator', '2026-10-24', '2026-07', 'FY2027 (July 1, 2026 – June 30, 2027)', "it's fine", '']) {
      expect(protectFormula(text), text).toBe(text);
    }
  });

  it('protects text fields in the data downloads', () => {
    const dataset = buildDemoDataset();
    const first = dataset.employees[0];
    if (!first) throw new Error('no employees');
    const hostile: Dataset = {
      ...dataset,
      employees: [{ ...first, role: '=HYPERLINK("http://example.invalid","click")' }],
    };
    const csv = datasetTableToCsv(hostile, 'employees');
    const rows = parse(csv);
    const role = rows[1]?.[1] ?? '';
    expect(role.startsWith("'=HYPERLINK")).toBe(true);
    // The numeric salary in the same row is not touched.
    expect(rows[1]?.[3]).toBe('60000.00');
  });

  it('protects free text in the report, including the claim label and document label', () => {
    const dataset = buildDemoDataset();
    const claim = dataset.statedCosts[0];
    if (!claim) throw new Error('no claim');
    const hostile: Dataset = {
      ...dataset,
      statedCosts: [{ ...claim, label: '=1+1', documentLabel: '@evil' }],
    };
    const rows = parse(buildReport(hostile));
    expect(rows.find((r) => r[0] === 'Claim')?.[1]).toBe("'=1+1");
    expect(rows.find((r) => r[0] === 'Source document')?.[1]).toBe("'@evil");
  });

  it('adds at most one apostrophe and leaves text that already starts with one alone', () => {
    // An existing leading apostrophe already makes a spreadsheet treat the cell as
    // text, so nothing is added to it.
    for (const text of ["'=already", "'hello", 'plain']) {
      expect(protectFormula(text), text).toBe(text);
    }
    expect(protectFormula('=SUM(A1)')).toBe("'=SUM(A1)");
  });

  // Documented limitation, not a bug being hidden: protection is one-way. The
  // importer never guesses whether a leading apostrophe is protection or the
  // user's own text, so protected text comes back with its apostrophe visible.
  it('keeps the protective apostrophe on re-import rather than guessing', () => {
    const dataset = buildDemoDataset();
    const first = dataset.employees[0];
    if (!first) throw new Error('no employees');
    const custom: Dataset = { ...dataset, employees: [{ ...first, role: '=cmd|calc' }] };

    const outcome = importTable('employees', datasetTableToCsv(custom, 'employees'), custom);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.dataset.employees[0]?.role).toBe("'=cmd|calc");
  });

  it('never strips a leading apostrophe from imported text', () => {
    const header =
      'employee_id,role,grade_step,annual_base_salary,scheduled_hours_per_week,weeks_per_year,overtime_eligible,bonus_eligible,provenance,source_label';
    for (const role of ["'Lead", "'=literal", "''double"]) {
      const csv = `${header}\r\nX-1,${role},PW-4,60000.00,40,52,true,true,source-supported,test\r\n`;
      const outcome = importTable('employees', csv, buildDemoDataset());
      expect(outcome.ok, role).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.dataset.employees[0]?.role, role).toBe(role);
    }
  });
});
