/**
 * Current-year incremental cost for Offers A and B, split into its components.
 *
 * Every number comes from the engine's OfferResult. This component only maps
 * amounts to pixels. Positive components stack to the right of zero and
 * negative ones to the left, so a negative component is drawn as negative
 * rather than being hidden or netted away. The axis always includes zero.
 */
import { useId } from 'react';
import { formatUSD, type Money } from '../../../money/money';
import type { ValueState } from '../../../domain/types';
import { Amount } from '../Common';
import { centsToNumber, niceTicks, useMeasuredWidth, usdTick } from './chartUtils';

export type SegmentKey = 'base' | 'overtime' | 'onetime';

export type StackedOffer = {
  readonly id: string;
  readonly label: string;
  readonly segments: readonly {
    readonly key: SegmentKey;
    readonly label: string;
    readonly state: ValueState<Money>;
  }[];
  readonly total: ValueState<Money>;
  readonly annualizedRecurring: ValueState<Money>;
};

const SEGMENT_META: Record<SegmentKey, { swatch: string }> = {
  base: { swatch: 'swatch--base' },
  overtime: { swatch: 'swatch--overtime' },
  onetime: { swatch: 'swatch--onetime' },
};

const ROW_HEIGHT = 64;
const BAR_HEIGHT = 26;
const PAD_X = 14;
const PAD_TOP = 6;
const AXIS_HEIGHT = 26;

function describe(state: ValueState<Money>): string {
  if (state.kind === 'known') return formatUSD(state.value);
  if (state.kind === 'excluded') return 'excluded';
  return state.kind;
}

export function StackedCostChart({ offers }: { offers: readonly StackedOffer[] }) {
  const [ref, width] = useMeasuredWidth(560);
  const patternId = useId();
  const W = Math.max(260, width - 18);

  // Extents, from the known components only.
  let lo = 0;
  let hi = 0;
  for (const offer of offers) {
    let positive = 0;
    let negative = 0;
    for (const segment of offer.segments) {
      if (segment.state.kind !== 'known') continue;
      const value = centsToNumber(segment.state.value);
      if (value > 0) positive += value;
      if (value < 0) negative += value;
    }
    hi = Math.max(hi, positive);
    lo = Math.min(lo, negative);
  }

  const nothingToDraw = hi === 0 && lo === 0;
  const ticks = niceTicks(lo, hi, 4);
  const d0 = ticks[0] ?? 0;
  const d1 = ticks[ticks.length - 1] ?? 1;
  const plotW = W - PAD_X * 2;
  const x = (value: number) => PAD_X + ((value - d0) / (d1 - d0)) * plotW;

  const height = PAD_TOP + offers.length * ROW_HEIGHT + AXIS_HEIGHT;
  const axisY = PAD_TOP + offers.length * ROW_HEIGHT;

  const ariaSummary = offers
    .map(
      (offer) =>
        `${offer.label}: total ${describe(offer.total)}` +
        ` (${offer.segments.map((s) => `${s.label.toLowerCase()} ${describe(s.state)}`).join(', ')})`,
    )
    .join('. ');

  return (
    <figure className="chart-figure">
      <div className="chart-box" ref={ref}>
        <svg
          className="chart"
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          role="img"
          aria-label={`Stacked bar chart of the current fiscal-year increase over baseline. ${ariaSummary}.`}
        >
          <defs>
            <pattern
              id={patternId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="#cfe5e2" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#0f766e" strokeWidth="2.5" />
            </pattern>
          </defs>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="chart__gridline"
                x1={x(tick)}
                x2={x(tick)}
                y1={PAD_TOP}
                y2={axisY}
              />
              <text
                className="chart__label"
                x={x(tick)}
                y={axisY + 16}
                textAnchor={tick === d0 && d0 !== 0 ? 'start' : tick === d1 ? 'end' : 'middle'}
              >
                {usdTick(tick)}
              </text>
            </g>
          ))}
          <line className="chart__zero" x1={x(0)} x2={x(0)} y1={PAD_TOP} y2={axisY} />

          {offers.map((offer, index) => {
            const top = PAD_TOP + index * ROW_HEIGHT;
            const barY = top + 26;
            let posCursor = 0;
            let negCursor = 0;

            const rects = offer.segments.flatMap((segment) => {
              if (segment.state.kind !== 'known') return [];
              const value = centsToNumber(segment.state.value);
              if (value === 0) return [];

              const from = value > 0 ? posCursor : negCursor + value;
              const to = value > 0 ? posCursor + value : negCursor;
              if (value > 0) posCursor += value;
              else negCursor += value;

              const segmentWidth = x(to) - x(from);
              const fill = segment.key === 'onetime' ? `url(#${patternId})` : undefined;
              const solid = segment.key !== 'onetime';
              return [
                <g key={segment.key}>
                  <rect
                    className={`seg seg--${segment.key}`}
                    style={fill ? { fill } : undefined}
                    x={x(from)}
                    y={barY}
                    width={Math.max(0, segmentWidth)}
                    height={BAR_HEIGHT}
                  >
                    <title>{`${segment.label}: ${formatUSD(segment.state.value)}`}</title>
                  </rect>
                  {solid && segmentWidth >= 96 ? (
                    <text
                      className="chart__inbar"
                      x={x(from) + segmentWidth / 2}
                      y={barY + BAR_HEIGHT / 2 + 4}
                      textAnchor="middle"
                    >
                      {formatUSD(segment.state.value)}
                    </text>
                  ) : null}
                </g>,
              ];
            });

            const totalText =
              offer.total.kind === 'known'
                ? `Total ${formatUSD(offer.total.value)}`
                : 'Total not available';

            return (
              <g key={offer.id}>
                <text className="chart__bar-label" x={PAD_X} y={top + 16}>
                  {offer.label} — {totalText}
                </text>
                {rects}
              </g>
            );
          })}

          {nothingToDraw ? (
            <text className="chart__label" x={PAD_X} y={axisY - 8}>
              No component has a cost to draw.
            </text>
          ) : null}
        </svg>
      </div>

      <figcaption className="figure-note">
        Bars show the increase over baseline for this fiscal year. The axis includes $0.
      </figcaption>

      <ul className="legend" aria-label="Chart legend with exact amounts">
        {(offers[0]?.segments ?? []).map((segment) => (
          <li key={segment.key}>
            <span className={`swatch ${SEGMENT_META[segment.key].swatch}`} aria-hidden="true" />
            <span>
              <strong>{segment.label}</strong>
              {offers.map((offer) => {
                const match = offer.segments.find((s) => s.key === segment.key);
                return (
                  <span key={offer.id}>
                    {' · '}
                    {offer.id}: {match ? <Amount state={match.state} /> : '—'}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>

      <p className="figure-note">
        <strong>Annualized recurring impact</strong>, shown separately and not part of the
        bars:
        {offers.map((offer) => (
          <span key={offer.id}>
            {' '}
            {offer.id}: <Amount state={offer.annualizedRecurring} />
            {offer.id === offers[offers.length - 1]?.id ? '' : ' ·'}
          </span>
        ))}
      </p>
    </figure>
  );
}

