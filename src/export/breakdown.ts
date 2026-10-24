/**
 * Export of the calculation breakdown.
 *
 * Produced from the same engine results as the screen, so the file and the
 * display cannot disagree. Every export carries the synthetic-data label, the
 * fiscal period, the assumptions, the exclusions and a generation date.
 */
import type { Dataset, OfferId } from '../domain/dataset';
import { COMPONENT_LABEL, stateLabel, type ValueState } from '../domain/types';
import { formatUSD, toDecimalString, type Money } from '../money/money';
import type { BudgetPosition, OfferResult } from '../engine/offer';
import type { Reconciliation } from '../engine/reconcile';
import type { MonthlyOvertimeRow } from '../engine/overtime';
import type { Flag } from '../engine/flags';

export type ExportContext = {
  readonly dataset: Dataset;
  readonly offerId: OfferId;
  readonly offer: OfferResult;
  readonly budget: BudgetPosition | undefined;
  readonly overtimeRows: readonly MonthlyOvertimeRow[];
  readonly flags: readonly Flag[];
  readonly reconciliation: Reconciliation | undefined;
  /** Supplied by the caller so the engine stays clock-free. */
  readonly generatedOn: string;
};

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(cells: readonly string[]): string {
  return cells.map((c) => csvEscape(c)).join(',');
}

function amountCells(state: ValueState<Money>): [string, string] {
  if (state.kind === 'known') return [toDecimalString(state.value), stateLabel(state)];
  if (state.kind === 'excluded') return ['', `Excluded — ${state.reason}`];
  return ['', stateLabel(state)];
}

export function calculationBreakdownCsv(context: ExportContext): string {
  const { dataset, offer, budget, generatedOn } = context;
  const lines: string[] = [];

  lines.push(row(['CivicVariance — calculation breakdown']));
  lines.push(row(['Tagline', 'Understand workforce costs. Explain every difference.']));
  lines.push(row(['Data', dataset.meta.label]));
  lines.push(row(['Caution', 'All figures are synthetic. Not a statement about any real municipality.']));
  lines.push(row(['Department', dataset.department.name]));
  lines.push(row(['Fiscal year', dataset.fiscalYear.label]));
  lines.push(row(['Offer', `${context.offerId} — ${offer.label}`]));
  lines.push(row(['Generated on', generatedOn]));
  lines.push(
    row([
      'Result completeness',
      offer.completeness.kind === 'complete'
        ? 'Complete'
        : `${offer.completeness.kind === 'partial' ? 'Partial estimate' : 'Not produced'}: ${offer.completeness.absentInputs.join('; ')}`,
    ]),
  );
  lines.push('');

  lines.push(row(['Figure', 'Amount (USD)', 'Value state', 'Basis']));
  const figures: readonly [string, ValueState<Money>, string][] = [
    ['Baseline annual cost', offer.baselineTotalCost, 'Current cost before any offer'],
    [
      'Current fiscal-year incremental base pay',
      offer.currentYearBasePayIncrement,
      'Per-employee annual increase, prorated',
    ],
    ['Current fiscal-year incremental overtime', offer.currentYearOvertimeIncrement, 'Offer overtime cost minus baseline'],
    ['One-time cost (not recurring)', offer.oneTimeCost, 'Explicitly eligible employees, paid in this period'],
    ['Current fiscal-year incremental cost', offer.currentYearTotalIncremental, 'Increase over baseline'],
    ['Annualized recurring increase', offer.annualizedRecurringIncrease, 'Full 12 months, one-time amounts excluded'],
    ['Total proposed expenditure', offer.totalProposedExpenditure, 'Baseline plus incremental'],
  ];

  for (const [label, state, basis] of figures) {
    const [amount, stateText] = amountCells(state);
    lines.push(row([label, amount, stateText, basis]));
  }

  if (budget) {
    lines.push(
      row([
        budget.isShortfall ? 'Workforce budget shortfall' : 'Workforce budget remaining',
        toDecimalString(budget.remaining),
        'Known',
        `Workforce budget ${formatUSD(budget.budget)} minus total proposed expenditure`,
      ]),
    );
  } else {
    lines.push(row(['Workforce budget remaining or shortfall', '', 'Not applicable', 'No workforce budget was supplied']));
  }

  lines.push('');
  lines.push(row(['Calculation step', 'Formula', 'Result', 'Provenance', 'Source']));
  for (const step of offer.steps) {
    lines.push(
      row([step.label, step.formula, step.result, step.provenance ?? '', step.sourceLabel ?? '']),
    );
  }

  lines.push('');
  lines.push(row(['Assumption']));
  for (const assumption of offer.assumptions) lines.push(row([assumption]));

  lines.push('');
  lines.push(row(['Excluded from all figures', 'Reason']));
  for (const exclusion of offer.exclusions) lines.push(row([exclusion.category, exclusion.reason]));

  if (offer.warnings.length > 0) {
    lines.push('');
    lines.push(row(['Warning']));
    for (const warning of offer.warnings) lines.push(row([warning]));
  }

  if (context.reconciliation) {
    const r = context.reconciliation;
    lines.push('');
    lines.push(row(['Stated-cost check']));
    lines.push(row(['Claim', r.claimLabel]));
    lines.push(row(['Verdict', r.verdictLabel]));
    if (r.refusalReason) lines.push(row(['Reason', r.refusalReason]));
    lines.push(row(['Period claimed', r.periodDescription]));
    lines.push(row(['Components claimed', r.claimedComponents.map((c) => COMPONENT_LABEL[c]).join('; ')]));
    lines.push(row(['Tolerance applied', r.toleranceDescription]));
    const [stated] = amountCells(r.statedAmount);
    const [calculated] = amountCells(r.calculatedAmount);
    const [difference] = amountCells(r.difference);
    lines.push(row(['Stated amount (USD)', stated]));
    lines.push(row(['Calculated amount (USD)', calculated]));
    lines.push(row(['Difference, stated minus calculated (USD)', difference]));
    if (r.documentLabel) lines.push(row(['Source document', r.documentLabel]));
  }

  if (context.overtimeRows.length > 0) {
    lines.push('');
    lines.push(row(['Overtime month', 'Hours', 'Dollars (USD)', 'Effective hourly cost (USD)', 'Budget variance (USD)', 'State']));
    for (const r of context.overtimeRows) {
      const hours = r.hours.kind === 'known' ? String(r.hours.value) : '';
      const [dollars, dollarState] = amountCells(r.dollars);
      const hourly = r.effectiveHourlyCost.kind === 'computed' ? toDecimalString(r.effectiveHourlyCost.amount) : '';
      const variance = r.budgetVariance.kind === 'computed' ? toDecimalString(r.budgetVariance.variance) : '';
      lines.push(row([r.month, hours, dollars, hourly, variance, r.isComplete ? 'Complete' : dollarState]));
    }
  }

  if (context.flags.length > 0) {
    lines.push('');
    lines.push(row(['Review flag', 'Status', 'Months', 'Comparison', 'Threshold']));
    for (const flag of context.flags) {
      lines.push(row([flag.title, flag.label, flag.months.join(' / '), flag.comparison, flag.threshold]));
    }
  }

  return `${lines.join('\n')}\n`;
}

/** Triggers a browser download. No network request; the file is built in-page. */
export function downloadTextFile(fileName: string, contents: string, mimeType = 'text/csv'): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
