/**
 * One line chart, hand-drawn in SVG.
 *
 * What it shows depends on the selected measure, and its units follow:
 *  - the axis title and tick format change with the measure;
 *  - the monthly budget line appears only on the dollars view, never on hours;
 *  - months with a "Needs review" flag are marked with an amber diamond, which
 *    differs in shape and outline from ordinary points and is named in the
 *    legend and in the data table;
 *  - months with no recorded value leave a gap rather than being joined across.
 *
 * Interaction: hovering, focusing or tapping a month shows the month, the
 * selected measure with its exact formatted value, any budget shown on the
 * chart, and "Needs review" when that month is flagged. A month with no value
 * says so in words. It is never presented as zero.
 *
 * Values arrive from the engine already computed. This component only maps
 * them to pixels.
 */
import { ChartStage, type ChartTarget } from './charts/ChartStage';
import { niceTicks, useMeasuredWidth } from './charts/chartUtils';

export type ChartPoint = {
  readonly label: string;
  readonly shortLabel: string;
  readonly value: number | undefined;
  readonly flagged: boolean;
  readonly budget: number | undefined;
  /** The value formatted for display, or the reason there is none. */
  readonly valueText: string;
  /** Extra tooltip lines, such as the budget when it is drawn. */
  readonly extraLines: readonly string[];
};

const HEIGHT = 290;
const PAD_LEFT = 66;
const PAD_RIGHT = 14;
const PAD_TOP = 26;
const PAD_BOTTOM = 36;

export function TrendChart({
  points,
  metricLabel,
  axisTitle,
  formatTick,
  summary,
  showBudget,
  zeroBased,
  emphasiseZero,
}: {
  points: readonly ChartPoint[];
  metricLabel: string;
  axisTitle: string;
  formatTick: (value: number) => string;
  summary: string;
  /** Dollar views only. Never pass true for hours. */
  showBudget: boolean;
  zeroBased: boolean;
  /** Draws the zero line, used where zero means "on budget". */
  emphasiseZero: boolean;
}) {
  const [ref, width] = useMeasuredWidth(720);

  const known = points.filter((p) => p.value !== undefined);
  if (known.length < 2) {
    return (
      <p className="notice">
        Not enough comparable data to draw a trend. At least two months with recorded values
        are needed.
      </p>
    );
  }

  const W = Math.max(280, width - 18);
  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const budgetValues = showBudget
    ? points.map((p) => p.budget).filter((v): v is number => v !== undefined)
    : [];
  const budgetVisible = budgetValues.length > 0;

  const values = [
    ...known.map((p) => p.value as number),
    ...budgetValues,
    ...(zeroBased || emphasiseZero ? [0] : []),
  ];
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const d0 = ticks[0] ?? 0;
  const d1 = ticks[ticks.length - 1] ?? 1;

  const x = (index: number) => PAD_LEFT + (index / (points.length - 1)) * plotW;
  const y = (value: number) => PAD_TOP + plotH - ((value - d0) / (d1 - d0)) * plotH;

  const runsOf = (pick: (p: ChartPoint) => number | undefined) => {
    const runs: { index: number; value: number }[][] = [];
    let current: { index: number; value: number }[] = [];
    points.forEach((point, index) => {
      const value = pick(point);
      if (value === undefined) {
        if (current.length > 0) runs.push(current);
        current = [];
      } else {
        current.push({ index, value });
      }
    });
    if (current.length > 0) runs.push(current);
    return runs;
  };

  const valueRuns = runsOf((p) => p.value);
  const budgetRuns = budgetVisible ? runsOf((p) => p.budget) : [];

  const maxLabels = Math.max(2, Math.floor(plotW / 62));
  const labelStep = Math.max(1, Math.ceil(points.length / maxLabels));

  const flaggedCount = points.filter((p) => p.flagged).length;
  const gapCount = points.filter((p) => p.value === undefined).length;
  const crossesZero = d0 < 0 && d1 > 0;

  const pointId = (point: ChartPoint) => `m:${point.shortLabel}`;

  const spacing = plotW / (points.length - 1);
  const crowded = spacing < 26;

  const targets: ChartTarget[] = points.map((point, index) => {
    const cx = x(index);
    const tooltip = {
      title: point.label,
      lines: [`${metricLabel}: ${point.valueText}`, ...point.extraLines],
      ...(point.flagged ? { badge: 'Needs review' } : {}),
    };
    if (point.value === undefined) {
      // A month with no value stays a visible, named gap.
      return {
        id: pointId(point),
        shape: 'rect' as const,
        box: { x: cx - Math.min(9, spacing / 2), y: PAD_TOP, w: Math.min(18, spacing), h: plotH },
        tooltip,
      };
    }
    if (crowded) {
      // Months are closer together than a comfortable target, so each one gets
      // a full-height strip exactly as wide as its slot. Neighbouring targets
      // never overlap, and a tap anywhere in the column picks that month.
      return {
        id: pointId(point),
        shape: 'rect' as const,
        box: { x: cx - spacing / 2, y: PAD_TOP, w: spacing, h: plotH },
        tooltip,
      };
    }
    const cy = y(point.value);
    return {
      id: pointId(point),
      shape: 'circle' as const,
      box: { x: cx - 13, y: cy - 13, w: 26, h: 26 },
      tooltip,
    };
  });

  return (
    <figure className="chart-figure">
      <div className="chart-box" ref={ref}>
        <ChartStage
          width={W}
          height={HEIGHT}
          targets={targets}
          groupLabel={`Chart data points for ${metricLabel}. Use the left and right arrow keys to move between months.`}
        >
          {({ activeId }) => {
            const activeIndex = points.findIndex((p) => pointId(p) === activeId);
            const activePoint = activeIndex >= 0 ? points[activeIndex] : undefined;

            return (
              <svg
                className="chart"
                width={W}
                height={HEIGHT}
                viewBox={`0 0 ${W} ${HEIGHT}`}
                role="img"
                aria-label={`Line chart of ${metricLabel}. ${summary}`}
              >
                <text className="chart__axis-title" x={PAD_LEFT} y={14}>
                  {axisTitle}
                </text>

                {ticks.map((tick) => (
                  <g key={tick}>
                    <line
                      className="chart__gridline"
                      x1={PAD_LEFT}
                      x2={W - PAD_RIGHT}
                      y1={y(tick)}
                      y2={y(tick)}
                    />
                    <text className="chart__label" x={PAD_LEFT - 8} y={y(tick) + 4} textAnchor="end">
                      {formatTick(tick)}
                    </text>
                  </g>
                ))}

                <line
                  className="chart__axis"
                  x1={PAD_LEFT}
                  x2={PAD_LEFT}
                  y1={PAD_TOP}
                  y2={PAD_TOP + plotH}
                />
                <line
                  className="chart__axis"
                  x1={PAD_LEFT}
                  x2={W - PAD_RIGHT}
                  y1={PAD_TOP + plotH}
                  y2={PAD_TOP + plotH}
                />
                {emphasiseZero && crossesZero ? (
                  <line
                    className="chart__zero"
                    x1={PAD_LEFT}
                    x2={W - PAD_RIGHT}
                    y1={y(0)}
                    y2={y(0)}
                  />
                ) : null}

                {points.map((point, index) =>
                  point.flagged ? (
                    <rect
                      key={`band-${point.label}`}
                      className="chart__flag-band"
                      x={x(index) - 7}
                      y={PAD_TOP}
                      width={14}
                      height={plotH}
                    />
                  ) : null,
                )}

                {activePoint ? (
                  <line
                    className="chart__guide"
                    x1={x(activeIndex)}
                    x2={x(activeIndex)}
                    y1={PAD_TOP}
                    y2={PAD_TOP + plotH}
                  />
                ) : null}

                {budgetRuns.map((run) => (
                  <polyline
                    key={`budget-${run[0]?.index ?? 0}`}
                    className="chart__budget"
                    points={run.map((p) => `${x(p.index)},${y(p.value)}`).join(' ')}
                  />
                ))}

                {valueRuns.map((run) => (
                  <polyline
                    key={`line-${run[0]?.index ?? 0}`}
                    className="chart__line"
                    points={run.map((p) => `${x(p.index)},${y(p.value)}`).join(' ')}
                  />
                ))}

                {points.map((point, index) => {
                  if (point.value === undefined) {
                    return (
                      <line
                        key={`gap-${point.label}`}
                        className={`chart__gap${activeId === pointId(point) ? ' is-active' : ''}`}
                        x1={x(index)}
                        x2={x(index)}
                        y1={PAD_TOP}
                        y2={PAD_TOP + plotH}
                      />
                    );
                  }
                  const cx = x(index);
                  const cy = y(point.value);
                  return (
                    <g key={`pt-${point.label}`}>
                      <circle
                        className={`chart__halo${activeId === pointId(point) ? ' is-active' : ''}`}
                        cx={cx}
                        cy={cy}
                        r={11}
                      />
                      {point.flagged ? (
                        <polygon
                          className="chart__flag"
                          points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                        />
                      ) : (
                        <circle className="chart__point" cx={cx} cy={cy} r={2.75} />
                      )}
                    </g>
                  );
                })}

                {points.map((point, index) =>
                  index % labelStep === 0 ? (
                    <text
                      key={`lbl-${point.label}`}
                      className="chart__label"
                      x={x(index)}
                      y={PAD_TOP + plotH + 18}
                      textAnchor="middle"
                    >
                      {point.shortLabel}
                    </text>
                  ) : null,
                )}
              </svg>
            );
          }}
        </ChartStage>
      </div>

      <ul className="legend legend--inline" aria-label="Chart legend">
        <li>
          <span className="swatch swatch--line" aria-hidden="true" />
          {metricLabel}
        </li>
        {budgetVisible ? (
          <li>
            <span className="swatch swatch--budget" aria-hidden="true" />
            Monthly overtime budget
          </li>
        ) : null}
        {flaggedCount > 0 ? (
          <li>
            <span className="swatch swatch--flag" aria-hidden="true" />
            Month with a Needs review flag ({flaggedCount})
          </li>
        ) : null}
        {gapCount > 0 ? <li>Dotted vertical line: no recorded value ({gapCount})</li> : null}
      </ul>

      <figcaption className="figure-note">
        {summary}{' '}
        {zeroBased || emphasiseZero
          ? 'The vertical axis includes zero.'
          : 'The vertical axis does not start at zero.'}
      </figcaption>
    </figure>
  );
}
