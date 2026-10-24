/**
 * Presentation helpers for charts.
 *
 * Nothing here calculates a financial result. Charts receive engine outputs and
 * these helpers only turn them into pixel positions, tick marks and labels.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useState } from 'react';
import { formatUSD, fromCents, type Money } from '../../../money/money';
import type { ValueState } from '../../../domain/types';

/** Tracks an element's rendered width so chart text stays a constant size. */
export function useMeasuredWidth(fallback = 640): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => {
      const measured = Math.floor(element.getBoundingClientRect().width);
      // A hidden panel measures 0; keep the last real width until it shows.
      if (measured > 0) setWidth(measured);
    };
    update();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Round-number ticks covering [min, max]. The returned ends bound the domain. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];

  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
  }

  const rough = (hi - lo) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const step = nice * magnitude;

  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;

  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push(Number((Math.round(v / step) * step).toPrecision(12)));
  }
  return ticks;
}

/** Cents to a plain number, for geometry only. Never fed back into a calculation. */
export function centsToNumber(money: Money): number {
  return Number(money.cents) / 100;
}

/** Exact dollar label for an axis tick. */
export function usdTick(value: number): string {
  const showCents = !Number.isInteger(value);
  return formatUSD(fromCents(BigInt(Math.round(value * 100))), { showCents });
}

/**
 * A part as a percentage of a whole, to one decimal place, from exact cents.
 *
 * Returns undefined unless the denominator is a positive amount and the part is
 * not negative, so a percentage is never shown for a missing, zero or otherwise
 * unclear denominator. Display only; nothing here feeds a calculation.
 */
export function shareOfTotal(part: Money, total: Money): string | undefined {
  if (total.cents <= 0n || part.cents < 0n) return undefined;
  const tenths = (part.cents * 1000n + total.cents / 2n) / total.cents;
  return `${tenths / 10n}.${tenths % 10n}%`;
}

/** Plain-words label for an amount that may not be a number. Never "$0.00". */
export function describeAmount(state: ValueState<Money>): string {
  switch (state.kind) {
    case 'known':
      return formatUSD(state.value);
    case 'excluded':
      return 'Excluded';
    case 'missing':
      return 'Missing';
    case 'unknown':
      return 'Unknown';
  }
}

export function groupedNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
