/**
 * Serialises the current dataset back out to the import schema.
 *
 * This makes export and import a genuine round trip: a file produced here is
 * accepted by the validator unchanged. The sentinel mapping is applied in
 * reverse, so "missing", "unknown" and "excluded" survive the trip rather than
 * collapsing into blanks that later read as zero.
 *
 * Text is written by `format.ts`, which adds the formula protection the
 * importer undoes, so a round trip returns the original text.
 */
import type { Dataset } from '../../domain/dataset';
import type { Input, ValueState } from '../../domain/types';
import { toDecimalString, type Money } from '../../money/money';
import { csvDocument } from './format';
import {
  COMPARATORS_SCHEMA,
  EMPLOYEES_SCHEMA,
  OVERTIME_SCHEMA,
  SENTINEL_EXCLUDED,
  SENTINEL_UNKNOWN,
  type TableId,
  type TableSchema,
} from './schema';

function stateCell(state: ValueState<unknown>, render: (value: unknown) => string): string {
  switch (state.kind) {
    case 'known':
      return render(state.value);
    case 'missing':
      return '';
    case 'unknown':
      return SENTINEL_UNKNOWN;
    case 'excluded':
      return SENTINEL_EXCLUDED;
  }
}

const money = (input: Input<Money>): string =>
  stateCell(input.state, (v) => toDecimalString(v as Money));

const num = (input: Input<number>): string => stateCell(input.state, (v) => String(v));

const text = (input: Input<string>): string => stateCell(input.state, (v) => String(v));

function build(schema: TableSchema, rows: readonly string[][]): string {
  return csvDocument([schema.columns.map((c) => c.name), ...rows]);
}

export function datasetTableToCsv(dataset: Dataset, table: TableId): string {
  switch (table) {
    case 'employees':
      return build(
        EMPLOYEES_SCHEMA,
        dataset.employees.map((e) => [
          e.id,
          e.role,
          e.gradeStep,
          money(e.annualBaseSalary),
          num(e.scheduledHoursPerWeek),
          num(e.weeksPerYear),
          String(e.overtimeEligible),
          String(e.bonusEligible),
          e.annualBaseSalary.provenance,
          e.annualBaseSalary.sourceLabel ?? '',
        ]),
      );

    case 'overtime_records':
      return build(
        OVERTIME_SCHEMA,
        dataset.overtimeRecords.map((r) => [
          r.month,
          num(r.hours),
          money(r.dollars),
          r.budgetDollars ? money(r.budgetDollars) : '',
          r.dollars.provenance,
          r.dollars.sourceLabel ?? '',
        ]),
      );

    case 'comparators':
      return build(
        COMPARATORS_SCHEMA,
        dataset.comparators.map((c) => [
          c.municipality,
          c.role,
          c.gradeStep,
          text(c.effectiveDate),
          num(c.scheduledHoursPerWeek),
          c.payBasis,
          money(c.statedPay),
          c.statedPay.provenance,
        ]),
      );
  }
}
