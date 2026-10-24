/**
 * Validate-then-commit CSV import.
 *
 * Nothing is applied until the whole file passes. The importer builds a
 * complete candidate value and the caller swaps it in atomically, so a failed
 * import leaves the existing data exactly as it was.
 */
import Papa from 'papaparse';
import {
  SENTINEL_EXCLUDED,
  SENTINEL_UNKNOWN,
  type ColumnSpec,
  type TableSchema,
} from './schema';
import { MoneyParseError, fromDecimalString, type Money } from '../../money/money';
import { stripBom } from './format';
import { isValidIsoDate, isValidYearMonth } from '../../engine/dates';
import type { Input, Provenance, ValueState } from '../../domain/types';

export type ImportProblem = {
  /** 1-based data row number as the user sees it in a spreadsheet, or null. */
  readonly row: number | null;
  readonly column: string | null;
  readonly message: string;
};

export type ParsedCell =
  | { readonly kind: 'state'; readonly state: ValueState<never> }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'money'; readonly value: Money }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean };

export type ValidatedRow = {
  readonly rowNumber: number;
  readonly cells: Readonly<Record<string, ParsedCell>>;
  readonly raw: Readonly<Record<string, string>>;
};

export type ValidationOutcome =
  | { readonly ok: true; readonly rows: readonly ValidatedRow[] }
  | { readonly ok: false; readonly problems: readonly ImportProblem[] };

const PROVENANCE_VALUES: readonly string[] = [
  'source-supported',
  'user-assumption',
  'synthetic-sample',
];

export function validateCsv(rawText: string, schema: TableSchema): ValidationOutcome {
  const problems: ImportProblem[] = [];

  // Files saved by Excel or exported by this application start with a UTF-8
  // byte-order mark. Left in place it would glue itself onto the first column
  // name and make a valid file look like it has an unrecognised header.
  const text = stripBom(rawText);

  if (text.trim() === '') {
    return { ok: false, problems: [{ row: null, column: null, message: 'The file is empty.' }] };
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  for (const error of parsed.errors) {
    problems.push({
      row: typeof error.row === 'number' ? error.row + 1 : null,
      column: null,
      message: `Could not read the file: ${error.message}`,
    });
  }
  if (problems.length > 0) return { ok: false, problems };

  // ---- Structural check: headers ----
  const headers = parsed.meta.fields ?? [];
  const missingColumns = schema.columns
    .filter((c) => c.required)
    .map((c) => c.name)
    .filter((name) => !headers.includes(name));

  if (missingColumns.length > 0) {
    problems.push({
      row: 1,
      column: null,
      message: `The file is missing required column(s): ${missingColumns.join(', ')}. Expected columns: ${schema.columns.map((c) => c.name).join(', ')}.`,
    });
  }

  const unexpected = headers.filter((h) => !schema.columns.some((c) => c.name === h));
  if (unexpected.length > 0) {
    problems.push({
      row: 1,
      column: unexpected[0] ?? null,
      message: `Unrecognised column(s): ${unexpected.join(', ')}. Download the template to see the expected format.`,
    });
  }
  if (problems.length > 0) return { ok: false, problems };

  if (parsed.data.length === 0) {
    return {
      ok: false,
      problems: [{ row: null, column: null, message: 'The file has a header row but no data rows.' }],
    };
  }

  // ---- Per-row typing ----
  const rows: ValidatedRow[] = [];

  parsed.data.forEach((raw, index) => {
    const rowNumber = index + 1;
    const cells: Record<string, ParsedCell> = {};

    for (const column of schema.columns) {
      const rawValue = (raw[column.name] ?? '').trim();
      const result = parseCell(rawValue, column);
      if ('error' in result) {
        problems.push({ row: rowNumber, column: column.name, message: result.error });
      } else {
        cells[column.name] = result.cell;
      }
    }

    rows.push({ rowNumber, cells, raw });
  });

  // ---- Cross-row checks ----
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = schema.identifierColumns
      .map((name) => {
        const cell = row.cells[name];
        return cell && cell.kind === 'text' ? cell.value.toLowerCase() : (row.raw[name] ?? '').trim().toLowerCase();
      })
      .join(' | ');

    if (key.trim() === '' || key.split('|').every((p) => p.trim() === '')) continue;

    const previous = seen.get(key);
    if (previous !== undefined) {
      problems.push({
        row: row.rowNumber,
        column: schema.identifierColumns.join(', '),
        message: `Duplicate identifier "${key}" — already used on row ${previous}. Each row must be unique.`,
      });
    } else {
      seen.set(key, row.rowNumber);
    }
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, rows };
}

function parseCell(
  raw: string,
  column: ColumnSpec,
): { cell: ParsedCell } | { error: string } {
  if (raw === '') {
    if (column.required && column.type === 'text') {
      return { error: `${column.name} is required and must not be empty.` };
    }
    if (column.required && !column.allowSentinels) {
      return { error: `${column.name} is required and must not be empty.` };
    }
    // Empty means missing, which is a legitimate recorded state.
    return { cell: { kind: 'state', state: { kind: 'missing' } } };
  }

  if (column.allowSentinels) {
    if (raw === SENTINEL_UNKNOWN) {
      return { cell: { kind: 'state', state: { kind: 'unknown' } } };
    }
    if (raw === SENTINEL_EXCLUDED) {
      return {
        cell: {
          kind: 'state',
          state: { kind: 'excluded', reason: 'Marked EXCLUDED in the imported file.' } as ValueState<never>,
        },
      };
    }
  }

  switch (column.type) {
    case 'text':
      return { cell: { kind: 'text', value: raw } };

    case 'money': {
      try {
        const value = fromDecimalString(raw);
        if (value.cents < 0n && !column.allowNegative) {
          return { error: `${column.name} must not be negative: "${raw}".` };
        }
        return { cell: { kind: 'money', value } };
      } catch (error) {
        if (error instanceof MoneyParseError) {
          return {
            error: `${column.name} is not a valid amount: "${raw}". Use digits with at most two decimal places, for example 18200.44.`,
          };
        }
        throw error;
      }
    }

    case 'number': {
      if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        return { error: `${column.name} is not a valid number: "${raw}".` };
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return { error: `${column.name} is not a finite number: "${raw}".` };
      }
      if (value < 0 && !column.allowNegative) {
        return { error: `${column.name} must not be negative: "${raw}".` };
      }
      return { cell: { kind: 'number', value } };
    }

    case 'date':
      if (!isValidIsoDate(raw)) {
        return {
          error: `${column.name} is not a valid date: "${raw}". Use YYYY-MM-DD, for example 2026-07-01.`,
        };
      }
      return { cell: { kind: 'text', value: raw } };

    case 'month':
      if (!isValidYearMonth(raw)) {
        return {
          error: `${column.name} is not a valid month: "${raw}". Use YYYY-MM, for example 2026-02.`,
        };
      }
      return { cell: { kind: 'text', value: raw } };

    case 'boolean': {
      const lowered = raw.toLowerCase();
      if (lowered === 'true') return { cell: { kind: 'boolean', value: true } };
      if (lowered === 'false') return { cell: { kind: 'boolean', value: false } };
      return { error: `${column.name} must be true or false, not "${raw}".` };
    }

    case 'provenance':
      if (!PROVENANCE_VALUES.includes(raw)) {
        return {
          error: `${column.name} must be one of ${PROVENANCE_VALUES.join(', ')}, not "${raw}".`,
        };
      }
      return { cell: { kind: 'text', value: raw } };

    case 'payBasis':
      if (raw !== 'annual' && raw !== 'hourly') {
        return { error: `${column.name} must be annual or hourly, not "${raw}".` };
      }
      return { cell: { kind: 'text', value: raw } };
  }
}

// ---------------------------------------------------------------------------
// Cell readers
// ---------------------------------------------------------------------------

export function cellText(row: ValidatedRow, name: string): string | undefined {
  const cell = row.cells[name];
  return cell && cell.kind === 'text' ? cell.value : undefined;
}

export function cellBoolean(row: ValidatedRow, name: string): boolean {
  const cell = row.cells[name];
  return cell && cell.kind === 'boolean' ? cell.value : false;
}

export function cellProvenance(row: ValidatedRow, name: string): Provenance {
  const value = cellText(row, name);
  return (value as Provenance) ?? 'user-assumption';
}

/** Turns a parsed cell into an Input, preserving the recorded value state. */
export function cellInput<T>(
  row: ValidatedRow,
  name: string,
  provenance: Provenance,
  sourceLabel?: string,
): Input<T> {
  const cell = row.cells[name];
  if (!cell) return { state: { kind: 'missing' }, provenance, sourceLabel };

  if (cell.kind === 'state') {
    return { state: cell.state as ValueState<T>, provenance, sourceLabel };
  }
  if (cell.kind === 'money' || cell.kind === 'number' || cell.kind === 'boolean' || cell.kind === 'text') {
    return {
      state: { kind: 'known', value: cell.value as unknown as T },
      provenance,
      sourceLabel,
    };
  }
  return { state: { kind: 'missing' }, provenance, sourceLabel };
}
