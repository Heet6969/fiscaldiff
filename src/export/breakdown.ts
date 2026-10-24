/**
 * Export of the calculation breakdown.
 *
 * Produced from the same engine results as the screen, so the file and the
 * display cannot disagree. Every export carries the synthetic-data label, the
 * fiscal period, the assumptions, the exclusions and a generation date.
 *
 * This is a report for reading in a spreadsheet. It mixes several small tables
 * under section headings, so it is NOT an import file: only the per-table
 * "current data" downloads round-trip through the importer.
 *
 * All CSV text is produced by `data/csv/format.ts`, which handles the UTF-8 BOM
 * Excel needs, CRLF row endings, quoting and spreadsheet-formula protection.
 */
import type { Dataset, OfferId } from '../domain/dataset';
import { COMPONENT_LABEL, stateLabel, type ValueState } from '../domain/types';
import { formatUSD, toDecimalString, type Money } from '../money/money';
import type { BudgetPosition, OfferResult } from '../engine/offer';
import type { StatedCheckOutcome } from '../engine/statedCheck';
import type { MonthlyOvertimeRow } from '../engine/overtime';
import type { Flag } from '../engine/flags';
import { CSV_MIME_TYPE, csvBytes, csvDocument } from '../data/csv/format';
import { describeBasePayChange } from '../engine/adjustments';

export type ExportContext = {
  readonly dataset: Dataset;
  readonly offerId: OfferId;
  readonly offer: OfferResult;
  readonly budget: BudgetPosition | undefined;
  readonly overtimeRows: readonly MonthlyOvertimeRow[];
  readonly flags: readonly Flag[];
  /** The stated-cost check as currently set up, shared with the screen and print. */
  readonly statedCheck: StatedCheckOutcome | undefined;
  /** Supplied by the caller so the engine stays clock-free. */
  readonly generatedOn: string;
};

function amountCells(state: ValueState<Money>): [string, string] {
  if (state.kind === 'known') return [toDecimalString(state.value), stateLabel(state)];
  if (state.kind === 'excluded') return ['', `Excluded — ${state.reason}`];
  return ['', stateLabel(state)];
}

const BLANK: readonly string[] = [];

export function calculationBreakdownCsv(context: ExportContext): string {
  const { dataset, offer, budget, generatedOn } = context;
  const rows: (readonly string[])[] = [];

  rows.push(['CivicVariance — calculation breakdown']);
  rows.push(['Tagline', 'Understand workforce costs. Explain every difference.']);
  rows.push(['Data', dataset.meta.label]);
  rows.push(['Caution', 'All figures are synthetic. Not a statement about any real municipality.']);
  rows.push([
    'File type',
    'A report for reading in a spreadsheet. It is not an import file; use the per-table downloads to re-import data.',
  ]);
  rows.push(['Department', dataset.department.name]);
  rows.push(['Fiscal year', dataset.fiscalYear.label]);
  rows.push(['Offer (calculation breakdown)', offer.label]);
  // The counterproposal's rows and net, so a reader can see what Offer B assumes.
  rows.push(['Offer B base-pay changes', describeBasePayChange(dataset.offers.B)]);
  rows.push(['Generated on', generatedOn]);
  rows.push([
    'Result completeness',
    offer.completeness.kind === 'complete'
      ? 'Complete'
      : `${offer.completeness.kind === 'partial' ? 'Partial estimate' : 'Not produced'}: ${offer.completeness.absentInputs.join('; ')}`,
  ]);
  rows.push(BLANK);

  rows.push(['Figure', 'Amount (USD)', 'Value state', 'Basis']);
  const figures: readonly [string, ValueState<Money>, string][] = [
    ['Baseline annual cost', offer.baselineTotalCost, 'Current cost before any offer'],
    [
      'Current fiscal-year incremental base pay',
      offer.currentYearBasePayIncrement,
      'Per-employee annual increase, prorated',
    ],
    [
      'Current fiscal-year incremental overtime',
      offer.currentYearOvertimeIncrement,
      'Offer overtime cost minus baseline',
    ],
    [
      'One-time cost (not recurring)',
      offer.oneTimeCost,
      'Explicitly eligible employees, paid in this period',
    ],
    [
      'Current fiscal-year incremental cost',
      offer.currentYearTotalIncremental,
      'Change from baseline; a negative amount is a decrease (a saving)',
    ],
    [
      'Annualized recurring increase',
      offer.annualizedRecurringIncrease,
      'Full 12 months, one-time amounts excluded',
    ],
    ['Total proposed expenditure', offer.totalProposedExpenditure, 'Baseline plus incremental'],
  ];
  for (const [label, state, basis] of figures) {
    const [amount, stateText] = amountCells(state);
    rows.push([label, amount, stateText, basis]);
  }

  if (budget) {
    rows.push([
      budget.isShortfall ? 'Workforce budget shortfall' : 'Workforce budget remaining',
      toDecimalString(budget.remaining),
      'Known',
      `Workforce budget ${formatUSD(budget.budget)} minus total proposed expenditure`,
    ]);
  } else {
    rows.push([
      'Workforce budget remaining or shortfall',
      '',
      'Not applicable',
      'No workforce budget was supplied',
    ]);
  }
  rows.push(BLANK);

  rows.push([
    'Calculation step',
    'Formula',
    'Result',
    'Provenance',
    'Source',
    'Replaced original source (not support for the edited value)',
  ]);
  for (const step of offer.steps) {
    const original = step.originalSource;
    rows.push([
      step.label,
      step.formula,
      step.result,
      step.provenance ?? '',
      step.sourceLabel ?? '',
      original
        ? [original.provenance, original.sourceLabel, original.agreementPassage]
            .filter((part): part is string => part !== undefined && part !== '')
            .join(' — ')
        : '',
    ]);
  }
  rows.push(BLANK);

  rows.push(['Assumption']);
  for (const assumption of offer.assumptions) rows.push([assumption]);
  rows.push(BLANK);

  rows.push(['Excluded from all figures', 'Reason']);
  for (const exclusion of offer.exclusions) rows.push([exclusion.category, exclusion.reason]);

  if (offer.warnings.length > 0) {
    rows.push(BLANK);
    rows.push(['Warning']);
    for (const warning of offer.warnings) rows.push([warning]);
  }

  const check = context.statedCheck;
  if (check) {
    rows.push(BLANK);
    rows.push(['Stated-cost check']);
    // The offer is named first and on every variant, so the section is never
    // read as a check against whichever offer the breakdown above describes.
    rows.push(['Offer compared against', check.offerLabel]);

    if (check.kind === 'needs-correction') {
      rows.push(['Claim', check.claimLabel]);
      rows.push(['Status', 'Cannot compare yet — an entry needs correcting. Nothing was compared.']);
      for (const problem of check.problems) rows.push(['Needs correction', problem]);
      if (check.draft.documentLabel) rows.push(['Source document', check.draft.documentLabel]);
      if (check.draft.documentText) rows.push(['Supporting passage', check.draft.documentText]);
    } else {
      const r = check.reconciliation;
      rows.push(['Claim', r.claimLabel]);
      rows.push(['Verdict', r.verdictLabel]);
      if (r.refusalReason) rows.push(['Reason', r.refusalReason]);
      rows.push(['Period claimed', r.periodDescription]);
      rows.push(['Components claimed', r.claimedComponents.map((c) => COMPONENT_LABEL[c]).join('; ')]);
      rows.push(['Tolerance applied', r.toleranceDescription]);
      const [stated] = amountCells(r.statedAmount);
      const [calculated] = amountCells(r.calculatedAmount);
      const [difference] = amountCells(r.difference);
      rows.push(['Stated amount (USD)', stated]);
      rows.push(['Calculated amount (USD)', calculated]);
      rows.push(['Difference, stated minus calculated (USD)', difference]);
      if (r.documentLabel) rows.push(['Source document', r.documentLabel]);
      if (r.documentText) rows.push(['Supporting passage', r.documentText]);
    }
  }
  if (context.overtimeRows.length > 0) {
    rows.push(BLANK);
    rows.push([
      'Overtime month',
      'Hours',
      'Dollars (USD)',
      'Effective hourly cost (USD)',
      'Budget variance (USD)',
      'State',
    ]);
    for (const r of context.overtimeRows) {
      const hours = r.hours.kind === 'known' ? String(r.hours.value) : '';
      const [dollars, dollarState] = amountCells(r.dollars);
      const hourly =
        r.effectiveHourlyCost.kind === 'computed' ? toDecimalString(r.effectiveHourlyCost.amount) : '';
      const variance =
        r.budgetVariance.kind === 'computed' ? toDecimalString(r.budgetVariance.variance) : '';
      rows.push([r.month, hours, dollars, hourly, variance, r.isComplete ? 'Complete' : dollarState]);
    }
  }

  if (context.flags.length > 0) {
    rows.push(BLANK);
    rows.push(['Review flag', 'Status', 'Months', 'Comparison', 'Threshold']);
    for (const flag of context.flags) {
      rows.push([flag.title, flag.label, flag.months.join(' / '), flag.comparison, flag.threshold]);
    }
  }

  return csvDocument(rows);
}

/**
 * Triggers a browser download of CSV text. The file is UTF-8 with a BOM so
 * Windows Excel reads the real characters. No network request is made.
 */
export function downloadCsvFile(fileName: string, text: string): void {
  const blob = new Blob([csvBytes(text) as BlobPart], { type: CSV_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
