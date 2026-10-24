/**
 * Importers that build a complete candidate dataset.
 *
 * Each returns either a whole new dataset or a list of problems. The caller
 * replaces its state only on success, which is what keeps existing data intact
 * when an import fails.
 */
import type { Comparator, Dataset, Employee, OvertimeRecord } from '../../domain/dataset';
import type { Input, IsoDate, YearMonth } from '../../domain/types';
import type { Money } from '../../money/money';
import {
  COMPARATORS_SCHEMA,
  EMPLOYEES_SCHEMA,
  OVERTIME_SCHEMA,
  type TableId,
} from './schema';
import {
  cellBoolean,
  cellInput,
  cellProvenance,
  cellText,
  validateCsv,
  type ImportProblem,
  type ValidatedRow,
} from './validate';
import { monthSortKey } from '../../engine/overtime';

export type ImportOutcome =
  | { readonly ok: true; readonly dataset: Dataset; readonly summary: string }
  | { readonly ok: false; readonly problems: readonly ImportProblem[] };

export function importTable(id: TableId, text: string, current: Dataset): ImportOutcome {
  switch (id) {
    case 'employees':
      return importEmployees(text, current);
    case 'overtime_records':
      return importOvertimeRecords(text, current);
    case 'comparators':
      return importComparators(text, current);
  }
}

function importEmployees(text: string, current: Dataset): ImportOutcome {
  const outcome = validateCsv(text, EMPLOYEES_SCHEMA);
  if (!outcome.ok) return { ok: false, problems: outcome.problems };

  const problems: ImportProblem[] = [];
  const employees: Employee[] = [];

  for (const row of outcome.rows) {
    const id = cellText(row, 'employee_id');
    const role = cellText(row, 'role');
    const gradeStep = cellText(row, 'grade_step');
    if (!id || !role || !gradeStep) {
      problems.push({
        row: row.rowNumber,
        column: 'employee_id, role, grade_step',
        message: 'Identifier, role and grade/step are all required.',
      });
      continue;
    }

    const provenance = cellProvenance(row, 'provenance');
    const sourceLabel = cellText(row, 'source_label');

    employees.push({
      id,
      role,
      gradeStep,
      annualBaseSalary: cellInput<Money>(row, 'annual_base_salary', provenance, sourceLabel),
      scheduledHoursPerWeek: cellInput<number>(row, 'scheduled_hours_per_week', provenance, sourceLabel),
      weeksPerYear: cellInput<number>(row, 'weeks_per_year', provenance, sourceLabel),
      overtimeEligible: cellBoolean(row, 'overtime_eligible'),
      bonusEligible: cellBoolean(row, 'bonus_eligible'),
    });
  }

  if (employees.length === 0 && problems.length === 0) {
    problems.push({ row: null, column: null, message: 'No employee rows could be read.' });
  }
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    dataset: { ...current, employees },
    summary: `Replaced the employee cohort with ${employees.length} imported row${employees.length === 1 ? '' : 's'}.`,
  };
}

function importOvertimeRecords(text: string, current: Dataset): ImportOutcome {
  const outcome = validateCsv(text, OVERTIME_SCHEMA);
  if (!outcome.ok) return { ok: false, problems: outcome.problems };

  const problems: ImportProblem[] = [];
  const records: OvertimeRecord[] = [];

  for (const row of outcome.rows) {
    const month = cellText(row, 'month');
    if (!month) {
      problems.push({ row: row.rowNumber, column: 'month', message: 'Month is required.' });
      continue;
    }

    const provenance = cellProvenance(row, 'provenance');
    const sourceLabel = cellText(row, 'source_label');

    const hours = cellInput<number>(row, 'overtime_hours', provenance, sourceLabel);
    const dollars = cellInput<Money>(row, 'overtime_dollars', provenance, sourceLabel);
    const budget = cellInput<Money>(row, 'overtime_budget_dollars', provenance, sourceLabel);

    // Cross-field consistency: dollars without hours cannot be reconciled into
    // an effective hourly cost, and is a sign the row is wrong rather than a
    // legitimate zero.
    if (
      hours.state.kind === 'known' &&
      hours.state.value === 0 &&
      dollars.state.kind === 'known' &&
      dollars.state.value.cents > 0n
    ) {
      problems.push({
        row: row.rowNumber,
        column: 'overtime_hours, overtime_dollars',
        message:
          'Inconsistent row: overtime dollars are greater than zero but overtime hours are zero. ' +
          'Leave hours empty if they are unknown rather than entering zero.',
      });
    }

    records.push({
      month,
      hours,
      dollars,
      ...(budget.state.kind === 'missing' ? {} : { budgetDollars: budget }),
    });
  }

  if (records.length === 0 && problems.length === 0) {
    problems.push({ row: null, column: null, message: 'No overtime rows could be read.' });
  }
  if (problems.length > 0) return { ok: false, problems };

  records.sort((a, b) => monthSortKey(a.month) - monthSortKey(b.month));

  return {
    ok: true,
    dataset: { ...current, overtimeRecords: records },
    summary: `Replaced the overtime history with ${records.length} month${records.length === 1 ? '' : 's'} of imported records.`,
  };
}

function importComparators(text: string, current: Dataset): ImportOutcome {
  const outcome = validateCsv(text, COMPARATORS_SCHEMA);
  if (!outcome.ok) return { ok: false, problems: outcome.problems };

  const problems: ImportProblem[] = [];
  const comparators: Comparator[] = [];

  outcome.rows.forEach((row, index) => {
    const municipality = cellText(row, 'municipality');
    const role = cellText(row, 'role');
    const gradeStep = cellText(row, 'grade_step');
    const payBasis = cellText(row, 'pay_basis');

    if (!municipality || !role || !gradeStep || (payBasis !== 'annual' && payBasis !== 'hourly')) {
      problems.push({
        row: row.rowNumber,
        column: 'municipality, role, grade_step, pay_basis',
        message: 'Municipality, role, grade/step and pay basis are all required.',
      });
      return;
    }

    const provenance = cellProvenance(row, 'provenance');

    comparators.push({
      id: `IMP-${index + 1}`,
      municipality,
      role,
      gradeStep,
      effectiveDate: cellInput<IsoDate>(row, 'effective_date', provenance),
      scheduledHoursPerWeek: cellInput<number>(row, 'scheduled_hours_per_week', provenance),
      payBasis,
      statedPay: cellInput<Money>(row, 'stated_pay', provenance),
    });
  });

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    dataset: { ...current, comparators },
    summary: `Replaced the comparison table with ${comparators.length} imported row${comparators.length === 1 ? '' : 's'}.`,
  };
}

export type { ImportProblem, ValidatedRow, Input, YearMonth };
