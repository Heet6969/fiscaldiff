/**
 * One line chart, hand-drawn in SVG.
 *
 * Written by hand rather than pulled from a charting library so the markup stays
 * accessible and plain, and so there is no temptation toward decoration. The
 * table underneath carries the same numbers and is the accessible equivalent;
 * the chart is labelled as an image with a text summary.
 *
 * Months with no value leave a gap. A gap is drawn as a gap, because joining
 * across it would imply a value that was never recorded.
 */
export type ChartPoint = {
  readonly label: string;
  readonly shortLabel: string;
  readonly value: number | undefined;
};

const WIDTH = 760;
const HEIGHT = 260;
const PAD_LEFT = 72;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 44;

export function TrendChart({
  points,
  metricLabel,
  formatValue,
  summary,
}: {
  points: readonly ChartPoint[];
  metricLabel: string;
  formatValue: (value: number) => string;
  summary: string;
}) {
  const known = points.filter((p) => p.value !== undefined) as { label: string; shortLabel: string; value: number }[];

  if (known.length < 2) {
    return (
      <p className="notice">
        Not enough comparable data to draw a trend. At least two months with recorded
        values are needed.
      </p>
    );
  }

  const values = known.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin;
  const min = span === 0 ? rawMin - 1 : rawMin - span * 0.1;
  const max = span === 0 ? rawMax + 1 : rawMax + span * 0.1;

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (index: number) =>
    points.length === 1
      ? PAD_LEFT + plotWidth / 2
      : PAD_LEFT + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => PAD_TOP + plotHeight - ((value - min) / (max - min)) * plotHeight;

  // Build segments, breaking wherever a value is absent.
  const segments: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];
  points.forEach((point, index) => {
    if (point.value === undefined) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ index, value: point.value });
    }
  });
  if (current.length > 0) segments.push(current);

  const ticks = 4;
  const gridValues = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);

  // Show roughly six month labels so the axis stays readable.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <figure className="chart-figure">
      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Line chart of ${metricLabel}. ${summary}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              className="chart__gridline"
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(value)}
              y2={y(value)}
            />
            <text className="chart__label" x={PAD_LEFT - 8} y={y(value) + 3} textAnchor="end">
              {formatValue(value)}
            </text>
          </g>
        ))}

        <line
          className="chart__axis"
          x1={PAD_LEFT}
          x2={PAD_LEFT}
          y1={PAD_TOP}
          y2={PAD_TOP + plotHeight}
        />
        <line
          className="chart__axis"
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={PAD_TOP + plotHeight}
          y2={PAD_TOP + plotHeight}
        />

        {segments.map((segment) => (
          <polyline
            key={`seg-${segment[0]?.index ?? 0}`}
            className="chart__line"
            points={segment.map((p) => `${x(p.index)},${y(p.value)}`).join(' ')}
          />
        ))}

        {points.map((point, index) =>
          point.value === undefined ? (
            <line
              key={`gap-${point.label}`}
              className="chart__gap"
              x1={x(index)}
              x2={x(index)}
              y1={PAD_TOP}
              y2={PAD_TOP + plotHeight}
            />
          ) : (
            <circle
              key={`pt-${point.label}`}
              className="chart__point"
              cx={x(index)}
              cy={y(point.value)}
              r={2.5}
            />
          ),
        )}

        {points.map((point, index) =>
          index % labelStep === 0 ? (
            <text
              key={`lbl-${point.label}`}
              className="chart__label"
              x={x(index)}
              y={HEIGHT - PAD_BOTTOM + 18}
              textAnchor="middle"
            >
              {point.shortLabel}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="section__hint">
        {metricLabel}. {summary} A dashed vertical line marks a month with no recorded
        value; the line is not joined across it.
      </figcaption>
    </figure>
  );
}
