/**
 * CSV schemas, defined as data.
 *
 * The same objects drive validation, the downloadable templates and the
 * on-screen documentation, so a template cannot drift out of step with the
 * validator that will reject it.
 *
 * Sentinel mapping, which is how the four value states survive a file
 * round-trip: an empty cell means "missing", the literal UNKNOWN means
 * "unknown", and the literal EXCLUDED means "excluded". A cell containing 0
 * means a known zero, which is a different thing from all three.
 */
export const SENTINEL_UNKNOWN = 'UNKNOWN';
export const SENTINEL_EXCLUDED = 'EXCLUDED';

export type ColumnType =
  | 'text'
  | 'money'
  | 'number'
  | 'date'
  | 'month'
  | 'boolean'
  | 'provenance'
  | 'payBasis';

export type ColumnSpec = {
  readonly name: string;
  readonly type: ColumnType;
  readonly required: boolean;
  readonly description: string;
  readonly example: string;
  /** Whether UNKNOWN / EXCLUDED are accepted in this column. */
  readonly allowSentinels?: boolean;
  readonly allowNegative?: boolean;
};

export type TableSchema = {
  readonly id: TableId;
  readonly label: string;
  readonly fileName: string;
  readonly description: string;
  readonly identifierColumns: readonly string[];
  readonly columns: readonly ColumnSpec[];
};

export type TableId = 'employees' | 'overtime_records' | 'comparators';

export const EMPLOYEES_SCHEMA: TableSchema = {
  id: 'employees',
  label: 'Employees',
  fileName: 'employees.csv',
  description:
    'One row per employee in the department. Scheduled hours are required because hourly ' +
    'pay is never assumed from a convention.',
  identifierColumns: ['employee_id'],
  columns: [
    { name: 'employee_id', type: 'text', required: true, description: 'Unique identifier.', example: 'MDW-001' },
    { name: 'role', type: 'text', required: true, description: 'Position title.', example: 'Equipment Operator' },
    { name: 'grade_step', type: 'text', required: true, description: 'Grade and step.', example: 'PW-4 / Step 3' },
    {
      name: 'annual_base_salary',
      type: 'money',
      required: true,
      description: 'Annual base salary in dollars.',
      example: '60000.00',
      allowSentinels: true,
    },
    {
      name: 'scheduled_hours_per_week',
      type: 'number',
      required: true,
      description: 'Scheduled hours per week.',
      example: '40',
      allowSentinels: true,
    },
    {
      name: 'weeks_per_year',
      type: 'number',
      required: true,
      description: 'Scheduled weeks per year.',
      example: '52',
      allowSentinels: true,
    },
    {
      name: 'overtime_eligible',
      type: 'boolean',
      required: true,
      description: 'true or false.',
      example: 'true',
    },
    {
      name: 'bonus_eligible',
      type: 'boolean',
      required: true,
      description: 'true or false. Stated explicitly; never inferred.',
      example: 'true',
    },
    {
      name: 'provenance',
      type: 'provenance',
      required: true,
      description: 'source-supported, user-assumption or synthetic-sample.',
      example: 'source-supported',
    },
    {
      name: 'source_label',
      type: 'text',
      required: false,
      description: 'Where the figure came from.',
      example: 'FY2027 position schedule',
    },
  ],
};

export const OVERTIME_SCHEMA: TableSchema = {
  id: 'overtime_records',
  label: 'Overtime records',
  fileName: 'overtime_records.csv',
  description:
    'One row per calendar month. Leave a cell empty to record it as missing — it will not ' +
    'be read as zero.',
  identifierColumns: ['month'],
  columns: [
    { name: 'month', type: 'month', required: true, description: 'Calendar month, YYYY-MM.', example: '2026-02' },
    {
      name: 'overtime_hours',
      type: 'number',
      required: false,
      description: 'Hours recorded in the month.',
      example: '420.5',
      allowSentinels: true,
    },
    {
      name: 'overtime_dollars',
      type: 'money',
      required: false,
      description: 'Dollars recorded in the month.',
      example: '18200.44',
      allowSentinels: true,
    },
    {
      name: 'overtime_budget_dollars',
      type: 'money',
      required: false,
      description: 'Monthly overtime budget, if one applies to this month.',
      example: '18000.00',
      allowSentinels: true,
    },
    {
      name: 'provenance',
      type: 'provenance',
      required: true,
      description: 'source-supported, user-assumption or synthetic-sample.',
      example: 'source-supported',
    },
    {
      name: 'source_label',
      type: 'text',
      required: false,
      description: 'Where the figures came from.',
      example: 'Overtime ledger export',
    },
  ],
};

export const COMPARATORS_SCHEMA: TableSchema = {
  id: 'comparators',
  label: 'Comparison municipalities',
  fileName: 'comparators.csv',
  description:
    'Context for negotiation only. Rows that do not share the subject role, grade and pay ' +
    'basis are marked not directly comparable and are never averaged.',
  identifierColumns: ['municipality', 'role', 'grade_step'],
  columns: [
    { name: 'municipality', type: 'text', required: true, description: 'Municipality name.', example: 'Ashford' },
    { name: 'role', type: 'text', required: true, description: 'Position title.', example: 'Equipment Operator' },
    { name: 'grade_step', type: 'text', required: true, description: 'Grade and step.', example: 'PW-4 / Step 3' },
    {
      name: 'effective_date',
      type: 'date',
      required: true,
      description: 'Effective date of the stated pay, YYYY-MM-DD.',
      example: '2026-07-01',
      allowSentinels: true,
    },
    {
      name: 'scheduled_hours_per_week',
      type: 'number',
      required: true,
      description: 'Scheduled hours per week.',
      example: '40',
      allowSentinels: true,
    },
    {
      name: 'pay_basis',
      type: 'payBasis',
      required: true,
      description: 'annual or hourly.',
      example: 'annual',
    },
    {
      name: 'stated_pay',
      type: 'money',
      required: true,
      description: 'Pay on the stated basis.',
      example: '61200.00',
      allowSentinels: true,
    },
    {
      name: 'provenance',
      type: 'provenance',
      required: true,
      description: 'source-supported, user-assumption or synthetic-sample.',
      example: 'source-supported',
    },
  ],
};

export const ALL_SCHEMAS: readonly TableSchema[] = [
  EMPLOYEES_SCHEMA,
  OVERTIME_SCHEMA,
  COMPARATORS_SCHEMA,
];

export function schemaFor(id: TableId): TableSchema {
  const found = ALL_SCHEMAS.find((s) => s.id === id);
  if (!found) throw new Error(`No schema for table "${id}"`);
  return found;
}

/** Header row plus one example row, generated from the schema itself. */
export function templateCsv(schema: TableSchema): string {
  const header = schema.columns.map((c) => c.name).join(',');
  const example = schema.columns.map((c) => quoteIfNeeded(c.example)).join(',');
  return `${header}\n${example}\n`;
}

function quoteIfNeeded(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
