/**
 * Stated versus calculated, drawn only when the comparison is valid.
 *
 * The caller passes this nothing for a "Cannot verify" result: bars for a
 * comparison that was refused would imply a measurement that was never made.
 * Both bars share one scale that starts at $0.
 *
 * Interaction: each bar shows its exact amount and the signed difference. The
 * stated bar also shows what percentage of the calculated amount it is, but
 * only when the calculated amount is a positive denominator.
 */
import { formatSignedUSD, formatUSD, type Money } from '../../../money/money';
import { ChartStage, type ChartTarget } from './ChartStage';
import { centsToNumber, niceTicks, shareOfTotal, useMeasuredWidth, usdTick } from './chartUtils';

const ROW_HEIGHT = 58;
const BAR_HEIGHT = 24;
const PAD_X = 14;
const PAD_TOP = 6;
const AXIS_HEIGHT = 26;

export function StatedComparisonChart({
  stated,
  calculated,
  difference,
}: {
  stated: Money;
  calculated: Money;
  difference: Money;
}) {
  const [ref, width] = useMeasuredWidth(560);
  const W = Math.max(260, width - 18);

  const values = [centsToNumber(stated), centsToNumber(calculated)];
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
  const d0 = ticks[0] ?? 0;
  const d1 = ticks[ticks.length - 1] ?? 1;
  const plotW = W - PAD_X * 2;
  const x = (value: number) => PAD_X + ((value - d0) / (d1 - d0)) * plotW;

  const rows = [
    { key: 'stated', label: 'Stated', money: stated, className: 'bar--stated' },
    { key: 'calculated', label: 'Calculated', money: calculated, className: 'bar--calculated' },
  ] as const;

  const height = PAD_TOP + rows.length * ROW_HEIGHT + AXIS_HEIGHT;
  const axisY = PAD_TOP + rows.length * ROW_HEIGHT;

  const relation =
    difference.cents === 0n
      ? 'The stated amount equals the calculated amount.'
      : difference.cents < 0n
        ? `The stated amount is ${formatUSD({ cents: -difference.cents })} lower than calculated.`
        : `The stated amount is ${formatUSD(difference)} higher than calculated.`;

  const statedShare = shareOfTotal(stated, calculated);

  const targets: ChartTarget[] = rows.map((row, index) => {
    const top = PAD_TOP + index * ROW_HEIGHT;
    return {
      id: row.key,
      box: { x: PAD_X, y: top, w: plotW, h: ROW_HEIGHT - 8 },
      tooltip: {
        title: row.label,
        lines: [
          formatUSD(row.money),
          ...(row.key === 'stated' && statedShare
            ? [`${statedShare} of the calculated amount`]
            : []),
          `Difference (stated − calculated): ${formatSignedUSD(difference)}`,
        ],
      },
    };
  });

  return (
    <figure className="chart-figure">
      <div className="chart-box" ref={ref}>
        <ChartStage
          width={W}
          height={height}
          targets={targets}
          groupLabel="Chart data points. Use the arrow keys to move between the stated and calculated bars."
        >
          {({ activeId }) => (
            <svg
              className="chart"
              width={W}
              height={height}
              viewBox={`0 0 ${W} ${height}`}
              role="img"
              aria-label={`Bar chart comparing the stated amount ${formatUSD(stated)} with the calculated amount ${formatUSD(calculated)}. Difference, stated minus calculated: ${formatSignedUSD(difference)}.`}
            >
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
                    textAnchor={tick === d1 ? 'end' : 'middle'}
                  >
                    {usdTick(tick)}
                  </text>
                </g>
              ))}
              <line className="chart__zero" x1={x(0)} x2={x(0)} y1={PAD_TOP} y2={axisY} />

              {rows.map((row, index) => {
                const top = PAD_TOP + index * ROW_HEIGHT;
                const value = centsToNumber(row.money);
                const from = Math.min(0, value);
                const to = Math.max(0, value);
                return (
                  <g key={row.key}>
                    <text className="chart__bar-label" x={PAD_X} y={top + 16}>
                      {row.label} — {formatUSD(row.money)}
                    </text>
                    <rect
                      className={`seg ${row.className}${activeId === row.key ? ' is-active' : ''}`}
                      x={x(from)}
                      y={top + 24}
                      width={Math.max(2, x(to) - x(from))}
                      height={BAR_HEIGHT}
                    />
                  </g>
                );
              })}
            </svg>
          )}
        </ChartStage>
      </div>

      <figcaption className="figure-note">
        <strong>Difference (stated − calculated): {formatSignedUSD(difference)}.</strong>{' '}
        {relation} Both bars use one scale starting at $0.
      </figcaption>
    </figure>
  );
}
