/**
 * Core domain vocabulary.
 *
 * This module holds types and tiny constructors only. No arithmetic, no I/O.
 * The point of `ValueState` is that "missing", "unknown", "excluded" and
 * "known zero" are four different things, and the compiler will not let you
 * read a number out of one without deciding what to do about the other three.
 */

/** Calendar date, 'YYYY-MM-DD'. A civil date: no time, no timezone. */
export type IsoDate = string;

/** Calendar month, 'YYYY-MM'. */
export type YearMonth = string;

export type ValueState<T> =
  | { readonly kind: 'known'; readonly value: T }
  /** The value should exist for this dataset but was not supplied. */
  | { readonly kind: 'missing' }
  /** The value exists in the world but has not been determined. */
  | { readonly kind: 'unknown' }
  /** Deliberately out of scope for this calculation. */
  | { readonly kind: 'excluded'; readonly reason: string };

export type Provenance =
  /** Taken from a cited document or agreement passage. */
  | 'source-supported'
  /** Supplied by the user as an assumption. */
  | 'user-assumption'
  /** Part of the fictional demonstration dataset. */
  | 'synthetic-sample';

/**
 * What an input said before a user edited it. Kept so the history is not lost,
 * but held apart from the current provenance so an agreement passage is never
 * presented as supporting a value it does not describe.
 */
export type OriginalSource = {
  readonly provenance: Provenance;
  readonly sourceLabel?: string;
  readonly agreementPassage?: string;
};

export type Input<T> = {
  readonly state: ValueState<T>;
  readonly provenance: Provenance;
  readonly sourceLabel?: string;
  readonly agreementPassage?: string;
  /** Present only after an edit replaced a sourced or sample value. */
  readonly originalSource?: OriginalSource;
};

/**
 * The input after a person typed a new value into it.
 *
 * An edited value is the user's own assumption, whatever it replaced. The
 * original source label and agreement passage move to `originalSource` rather
 * than staying where they would read as support for the new number.
 */
export function editedInput<T>(previous: Input<T>, state: ValueState<T>): Input<T> {
  if (previous.provenance === 'user-assumption') {
    // Already an assumption: keep whatever earlier original context it carries.
    return { ...previous, state };
  }

  const hasContext = previous.sourceLabel !== undefined || previous.agreementPassage !== undefined;
  return {
    state,
    provenance: 'user-assumption',
    sourceLabel: 'Entered on screen',
    ...(hasContext || previous.provenance === 'source-supported'
      ? {
          originalSource: {
            provenance: previous.provenance,
            ...(previous.sourceLabel !== undefined ? { sourceLabel: previous.sourceLabel } : {}),
            ...(previous.agreementPassage !== undefined
              ? { agreementPassage: previous.agreementPassage }
              : {}),
          },
        }
      : {}),
  };
}

export function known<T>(
  value: T,
  provenance: Provenance,
  extra?: { sourceLabel?: string; agreementPassage?: string },
): Input<T> {
  return { state: { kind: 'known', value }, provenance, ...extra };
}

export function missing<T>(provenance: Provenance, sourceLabel?: string): Input<T> {
  return { state: { kind: 'missing' }, provenance, sourceLabel };
}

export function unknownInput<T>(provenance: Provenance, sourceLabel?: string): Input<T> {
  return { state: { kind: 'unknown' }, provenance, sourceLabel };
}

export function excluded<T>(reason: string, provenance: Provenance): Input<T> {
  return { state: { kind: 'excluded', reason }, provenance };
}

export function isKnown<T>(input: Input<T>): boolean {
  return input.state.kind === 'known';
}

/** Returns the value only when known. Callers must handle `undefined`. */
export function valueOf<T>(input: Input<T>): T | undefined {
  return input.state.kind === 'known' ? input.state.value : undefined;
}

/** Human-readable name for a state, for display and exports. */
export function stateLabel(state: ValueState<unknown>): string {
  switch (state.kind) {
    case 'known':
      return 'Known';
    case 'missing':
      return 'Missing';
    case 'unknown':
      return 'Unknown';
    case 'excluded':
      return 'Excluded';
  }
}

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  'source-supported': 'Source-supported',
  'user-assumption': 'User assumption',
  'synthetic-sample': 'Synthetic sample',
};

/**
 * Whether a result can be presented as a complete figure.
 * `partial` may be shown only with a visible partial-estimate label.
 * `refused` must not show a total at all.
 */
export type Completeness =
  | { readonly kind: 'complete' }
  | { readonly kind: 'partial'; readonly absentInputs: readonly string[] }
  | { readonly kind: 'refused'; readonly absentInputs: readonly string[] };

export const COMPLETE: Completeness = { kind: 'complete' };

/** A cost category that this prototype does not calculate. */
export type Exclusion = {
  readonly category: string;
  readonly reason: string;
};

/** One line of the audit trail behind a figure. */
export type CalcStep = {
  readonly label: string;
  readonly formula: string;
  readonly result: string;
  readonly provenance?: Provenance;
  readonly sourceLabel?: string;
  readonly agreementPassage?: string;
  /** Source of the value this edit replaced. Shown separately, never as support. */
  readonly originalSource?: OriginalSource;
};

/**
 * Components a fiscal note can claim to cover.
 * `total-payroll` exists so a total-payroll claim can be recognised and
 * refused, rather than silently compared against an incremental figure.
 */
export type ComponentId =
  | 'base-pay-increment'
  | 'one-time-bonus'
  | 'overtime-increment'
  | 'employer-taxes'
  | 'pension'
  | 'benefits'
  | 'total-payroll';

export const COMPONENT_LABEL: Record<ComponentId, string> = {
  'base-pay-increment': 'Base-pay increase',
  'one-time-bonus': 'One-time bonus',
  'overtime-increment': 'Overtime increase',
  'employer-taxes': 'Employer taxes',
  pension: 'Pension',
  benefits: 'Benefits',
  'total-payroll': 'Total payroll',
};

/** Components this prototype can calculate. */
export const CALCULABLE_COMPONENTS: readonly ComponentId[] = [
  'base-pay-increment',
  'one-time-bonus',
  'overtime-increment',
];

/** Components this prototype never calculates, and will not guess. */
export const UNCALCULATED_COMPONENTS: readonly ComponentId[] = [
  'employer-taxes',
  'pension',
  'benefits',
];
