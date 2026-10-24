/**
 * Small shared pieces: the synthetic indicator, disclosures, amount rendering,
 * and the always-visible warning list.
 */
import type { ReactNode } from 'react';
import { formatSignedUSD, formatUSD, type Money } from '../../money/money';
import type { Completeness, Exclusion, ValueState } from '../../domain/types';
import { NOT_ENOUGH_DATA_LABEL } from '../../engine/overtime';

export function SyntheticBadge({ label }: { label: string }) {
  return (
    <span className="synthetic-badge" data-testid="synthetic-badge">
      <span className="synthetic-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Disclosure({
  summary,
  children,
  id,
}: {
  summary: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <details className="disclosure" id={id}>
      <summary>{summary}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

/**
 * Renders an amount, or the reason there is no amount. A state is never
 * rendered as a number it is not.
 */
export function Amount({
  state,
  signed = false,
  emphasiseSign = false,
}: {
  state: ValueState<Money>;
  signed?: boolean;
  emphasiseSign?: boolean;
}) {
  if (state.kind === 'known') {
    const text = signed ? formatSignedUSD(state.value) : formatUSD(state.value);
    const className = emphasiseSign
      ? state.value.cents < 0n
        ? 'amount--negative'
        : state.value.cents > 0n
          ? 'amount--positive'
          : undefined
      : undefined;
    return <span className={className}>{text}</span>;
  }
  if (state.kind === 'excluded') {
    return (
      <span className="state-note" title={state.reason}>
        Excluded
      </span>
    );
  }
  return <span className="state-note">{state.kind === 'missing' ? 'Missing' : 'Unknown'}</span>;
}

export function NotEnoughData({ reason }: { reason?: string }) {
  return (
    <span className="state-note" title={reason}>
      {NOT_ENOUGH_DATA_LABEL}
    </span>
  );
}

/** Always visible. Never collapsed behind a disclosure. */
export function WarningList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="warnings" role="note" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function CompletenessNotice({ completeness }: { completeness: Completeness }) {
  if (completeness.kind === 'complete') return null;

  const heading =
    completeness.kind === 'partial'
      ? 'Partial estimate — some inputs are missing'
      : 'No total can be produced — required inputs are missing';

  return (
    <div className="warnings" role="note" aria-label={heading}>
      <h3>{heading}</h3>
      <p>
        {completeness.kind === 'partial'
          ? 'The figures below leave out the items listed here. Treat the totals as incomplete.'
          : 'Enter the items listed here to produce a figure. Nothing is assumed in their place.'}
      </p>
      <ul>
        {completeness.absentInputs.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ExclusionsNote({ exclusions }: { exclusions: readonly Exclusion[] }) {
  if (exclusions.length === 0) return null;
  return (
    <p className="notice">
      <strong>Not calculated, and so not part of any increase above:</strong>{' '}
      {exclusions.map((e) => e.category).join(', ')}. These are disclosed rather than
      estimated. See the assumptions section for the reason in each case.
    </p>
  );
}

export function ProvenanceNote() {
  return (
    <p className="section__hint">
      Every figure carries where it came from: a cited source, an assumption you entered,
      or a synthetic sample value.
    </p>
  );
}
