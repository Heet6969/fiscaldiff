/**
 * Combinators for ValueState.
 *
 * Arithmetic on values that might be missing, unknown or excluded has to decide
 * what the combination means. The rules here are deliberate:
 *
 *  - missing + anything  -> missing   (a gap poisons the total)
 *  - unknown + anything  -> unknown
 *  - excluded + known    -> known     (an excluded component contributes nothing
 *                                      to a total whose scope excludes it, and
 *                                      the exclusion is disclosed separately)
 *
 * The excluded case is the subtle one. "Excluded" means a deliberate scope
 * decision that is shown to the user, so treating it as a zero contribution is
 * honest. "Missing" means we do not know, so it must not become zero.
 */
import type { ValueState } from './types';

export function knownState<T>(value: T): ValueState<T> {
  return { kind: 'known', value };
}

export const MISSING_STATE: ValueState<never> = { kind: 'missing' };
export const UNKNOWN_STATE: ValueState<never> = { kind: 'unknown' };

export function excludedState<T>(reason: string): ValueState<T> {
  return { kind: 'excluded', reason };
}

export function mapState<A, B>(a: ValueState<A>, fn: (value: A) => B): ValueState<B> {
  return a.kind === 'known' ? { kind: 'known', value: fn(a.value) } : a;
}

/** Combines two states. Returns the blocking state when either is not known. */
export function combine2<A, B, C>(
  a: ValueState<A>,
  b: ValueState<B>,
  fn: (a: A, b: B) => C,
): ValueState<C> {
  const blocked = firstBlocking([a, b]);
  if (blocked) return blocked;
  if (a.kind !== 'known' || b.kind !== 'known') return MISSING_STATE;
  return { kind: 'known', value: fn(a.value, b.value) };
}

/**
 * Sums a list of states, treating `excluded` as contributing nothing.
 * Any `missing` or `unknown` member blocks the whole sum.
 */
export function sumStates<T>(
  states: readonly ValueState<T>[],
  zero: T,
  addFn: (a: T, b: T) => T,
): ValueState<T> {
  const blocked = firstBlocking(states);
  if (blocked) return blocked;

  let total = zero;
  for (const s of states) {
    if (s.kind === 'known') total = addFn(total, s.value);
    // 'excluded' contributes nothing, by design. See module comment.
  }
  return { kind: 'known', value: total };
}

/** The first state that prevents a numeric result, if any. */
export function firstBlocking(
  states: readonly ValueState<unknown>[],
): ValueState<never> | undefined {
  for (const s of states) {
    if (s.kind === 'missing') return MISSING_STATE;
    if (s.kind === 'unknown') return UNKNOWN_STATE;
  }
  return undefined;
}

export function isKnownState<T>(state: ValueState<T>): state is { kind: 'known'; value: T } {
  return state.kind === 'known';
}

/** Value when known, otherwise undefined. */
export function stateValue<T>(state: ValueState<T>): T | undefined {
  return state.kind === 'known' ? state.value : undefined;
}

/** True when the state blocks a complete figure (missing or unknown). */
export function blocksCompleteness(state: ValueState<unknown>): boolean {
  return state.kind === 'missing' || state.kind === 'unknown';
}
