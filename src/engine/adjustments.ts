/**
 * Base-pay changes as the engine and the interface both see them.
 *
 * Offer A has one union-proposed percentage. Offer B (the counterproposal) can
 * have several increase/decrease rows. This is the single place that turns
 * either shape into the one net percentage the calculation uses, so the screen,
 * the CSV, the printable summary and the stated-cost check cannot disagree.
 *
 * Basis, stated once: the signed percentages are added together first, and the
 * net is applied once to each employee's ORIGINAL salary. They are not
 * compounded. +3% and −1% is exactly a net +2%.
 *
 * Nothing here skips a row. A row that is unfinished or invalid blocks the
 * result and says so; a combined change below −100% is refused, because it
 * would make salaries negative.
 */
import { Decimal } from '../money/money';
import type { BasePayAdjustment, Offer } from '../domain/dataset';
import type { Input } from '../domain/types';

export const ADJUSTMENT_BASIS_NOTE =
  'Percentages are added together, then applied once to each employee’s original salary ' +
  'from the shared effective date. They are not compounded.';

export const ADJUSTMENT_SOURCE_LABEL = 'Counterproposal adjustments entered on screen';

export type NetBasePayChange = {
  /** What the calculation uses. User assumption; missing when blocked. */
  readonly input: Input<number>;
  /** Why the result is blocked, in plain words. Empty when it is not. */
  readonly problems: readonly string[];
  /** One line describing the rows and their net, for display and exports. */
  readonly summary: string;
  /** True for the repeatable-row form, false for a single percentage. */
  readonly usesRows: boolean;
};

/** "+2%", "−1.5%" or "0%". Exact decimal text, never a float artefact. */
export function formatSignedPercent(value: Decimal): string {
  if (value.isZero()) return '0%';
  return `${value.isNegative() ? '−' : '+'}${value.abs().toString()}%`;
}

function directionWord(row: BasePayAdjustment): string {
  return row.direction === 'increase' ? 'Increase' : 'Decrease';
}

function rowPercent(row: BasePayAdjustment): Decimal | undefined {
  if (row.percent.state.kind !== 'known') return undefined;
  const value = row.percent.state.value;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return new Decimal(value);
}

/**
 * One sentence for exports and the printable summary: the rows, their net, and
 * the shared effective date, or the reason the net is not available.
 */
export function describeBasePayChange(offer: Offer): string {
  const change = netBasePayChange(offer);
  const date = offer.raiseEffectiveDate.state;
  const when = date.kind === 'known' ? `effective ${date.value}` : 'effective date not entered';

  if (change.problems.length > 0) {
    return `Not available — ${change.problems.join(' ')}`;
  }
  return change.usesRows
    ? `${change.summary}; ${when}; applied once to original salaries, not compounded`
    : `${change.summary}; ${when}`;
}

export function netBasePayChange(offer: Offer): NetBasePayChange {
  const rows = offer.adjustments;

  if (rows === undefined) {
    const state = offer.basePayRaisePercent.state;
    const text =
      state.kind === 'known'
        ? `Single base-pay change ${formatSignedPercent(new Decimal(state.value))}`
        : 'Single base-pay change not entered';
    return {
      input: offer.basePayRaisePercent,
      problems: [],
      summary: text,
      usesRows: false,
    };
  }

  const blocked = (problems: readonly string[], summary: string): NetBasePayChange => ({
    input: {
      state: { kind: 'missing' },
      provenance: 'user-assumption',
      sourceLabel: ADJUSTMENT_SOURCE_LABEL,
    },
    problems,
    summary,
    usesRows: true,
  });

  if (rows.length === 0) {
    return {
      input: {
        state: { kind: 'known', value: 0 },
        provenance: 'user-assumption',
        sourceLabel: ADJUSTMENT_SOURCE_LABEL,
      },
      problems: [],
      summary: 'No adjustments entered → net 0%',
      usesRows: true,
    };
  }

  const problems: string[] = [];
  let net = new Decimal(0);

  rows.forEach((row, index) => {
    const percent = rowPercent(row);
    if (percent === undefined) {
      problems.push(
        `Adjustment ${index + 1} is unfinished or invalid. Enter a percentage of 0 or more, or remove the row.`,
      );
      return;
    }
    net = row.direction === 'increase' ? net.plus(percent) : net.minus(percent);
  });

  if (problems.length > 0) {
    return blocked(problems, `Not available: ${problems.length} adjustment row(s) unfinished or invalid`);
  }

  const description = rows
    .map((row) => `${directionWord(row)} ${rowPercent(row)?.toString() ?? ''}%`)
    .join(', ');
  const summary = `${description} → net ${formatSignedPercent(net)}`;

  if (net.lessThan(-100)) {
    return blocked(
      [
        `The combined change is ${formatSignedPercent(net)}, which is below −100%. ` +
          'That would make salaries negative, so it is not accepted. Reduce the decreases.',
      ],
      summary,
    );
  }

  return {
    input: {
      state: { kind: 'known', value: net.toNumber() },
      provenance: 'user-assumption',
      sourceLabel: ADJUSTMENT_SOURCE_LABEL,
    },
    problems: [],
    summary,
    usesRows: true,
  };
}
