/**
 * Review overtime.
 *
 * Describes what the records say and flags patterns worth a human look. It does
 * not say why anything moved, and the only status word is "Needs review".
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../state/AppState';
import { Amount, Disclosure, NotEnoughData } from '../components/Common';
import { NumberField } from '../components/Fields';
import { TrendChart, type ChartPoint } from '../components/TrendChart';
import { formatSignedUSD, formatUSD } from '../../money/money';
import { formatYearMonthLong } from '../../engine/dates';
import { REVIEW_THRESHOLD_DISCLAIMER } from '../../engine/config';
import type { MonthlyOvertimeRow } from '../../engine/overtime';
import type { Flag } from '../../engine/flags';
import { centsToNumber, groupedNumber } from '../components/charts/chartUtils';

type Metric = 'hours' | 'dollars' | 'effective' | 'variance';

type MetricConfig = {
  readonly label: string;
  readonly axisTitle: string;
  readonly zeroBased: boolean;
  readonly emphasiseZero: boolean;
  readonly showBudget: boolean;
  readonly formatTick: (value: number) => string;
  readonly formatValue: (value: number) => string;
};

function dollars(value: number, decimals: number): string {
  const text = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${value < 0 ? '-' : ''}$${text}`;
}

/**
 * Units follow the selected measure. Only the dollars view carries a budget
 * line: a dollar budget has no meaning on an hours axis.
 */
const METRICS: Record<Metric, MetricConfig> = {
  hours: {
    label: 'Overtime hours per month',
    axisTitle: 'Hours per month',
    zeroBased: true,
    emphasiseZero: false,
    showBudget: false,
    formatTick: (v) => groupedNumber(v),
    formatValue: (v) => `${groupedNumber(Math.round(v * 10) / 10)} hours`,
  },
  dollars: {
    label: 'Overtime dollars per month',
    axisTitle: 'Dollars per month',
    zeroBased: true,
    emphasiseZero: false,
    showBudget: true,
    formatTick: (v) => dollars(v, 0),
    formatValue: (v) => dollars(v, 2),
  },
  effective: {
    label: 'Effective overtime hourly cost',
    axisTitle: 'Dollars per overtime hour',
    zeroBased: false,
    emphasiseZero: false,
    showBudget: false,
    formatTick: (v) => dollars(v, 2),
    formatValue: (v) => dollars(v, 2),
  },
  variance: {
    label: 'Budget variance per month',
    axisTitle: 'Dollars above (+) or below (−) the monthly budget',
    zeroBased: false,
    emphasiseZero: true,
    showBudget: false,
    formatTick: (v) => (v > 0 ? `+${dollars(v, 0)}` : dollars(v, 0)),
    formatValue: (v) => (v > 0 ? `+${dollars(v, 2)}` : dollars(v, 2)),
  },
};

const METRIC_ORDER: readonly Metric[] = ['hours', 'dollars', 'effective', 'variance'];

export function ReviewOvertime() {
  const { engine, thresholds, setThresholds, epoch } = useAppState();
  const [metric, setMetric] = useState<Metric>('hours');
  // True when the field currently holds something that is not a usable number.
  // The last valid threshold stays in force, and the screen says so.
  const [invalid, setInvalid] = useState({ hours: false, cost: false });
  useEffect(() => setInvalid({ hours: false, cost: false }), [epoch]);

  const rows = engine.overtimeRows;
  const totals = engine.overtimeTotals;
  const { flags, notAssessed } = engine.flags;
  const config = METRICS[metric];

  // The month a flag is about is the last one it names.
  const flaggedMonths = useMemo(
    () => new Set(flags.map((f) => f.months[f.months.length - 1]).filter((m): m is string => !!m)),
    [flags],
  );

  const points = useMemo<ChartPoint[]>(
    () =>
      rows.map((row) => {
        const value = metricValue(row, metric);
        const budget =
          row.budget && row.budget.kind === 'known' ? centsToNumber(row.budget.value) : undefined;
        return {
          label: formatYearMonthLong(row.month),
          shortLabel: row.month,
          value,
          flagged: flaggedMonths.has(row.month),
          budget,
          // A month without a value says why, in words. It is never shown as zero.
          valueText: value === undefined ? missingText(row, metric) : config.formatValue(value),
          extraLines:
            config.showBudget && budget !== undefined
              ? [`Monthly overtime budget: ${dollars(budget, 2)}`]
              : [],
        };
      }),
    [rows, metric, flaggedMonths, config],
  );

  const knownCount = points.filter((p) => p.value !== undefined).length;
  const monthCount = flaggedMonths.size;

  return (
    <div>
      <header className="view-intro">
        <h2>Which months deserve a second look?</h2>
        <p className="key-result-line">
          {flags.length === 0 ? (
            <strong>No month met the review thresholds.</strong>
          ) : (
            <>
              <strong>
                {flags.length} pattern{flags.length === 1 ? '' : 's'} in {monthCount} month
                {monthCount === 1 ? '' : 's'}
              </strong>{' '}
              of {rows.length} recorded {flags.length === 1 ? 'needs' : 'need'} a person to look.
              The tool does not say why.
            </>
          )}
        </p>
      </header>

      <div className="workbench">
        <section className="controls" aria-labelledby="overtime-inputs-heading">
          <h3 className="pane-title" id="overtime-inputs-heading">
            Your inputs
          </h3>

          <div className="field">
            <label className="field__label" htmlFor="metric-select">
              Show
            </label>
            <select
              id="metric-select"
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
            >
              {METRIC_ORDER.map((key) => (
                <option key={key} value={key}>
                  {METRICS[key].label}
                </option>
              ))}
            </select>
          </div>

          <details className="inline-details">
            <summary>
              Review thresholds
              <span className="summary-detail">
                Hours +{thresholds.hoursIncreasePercent}%, hourly cost ±
                {thresholds.effectiveHourlyCostChangePercent}% — demonstration values
                {invalid.hours || invalid.cost ? ' — an entry is not applied' : ''}
              </span>
            </summary>
            <div style={{ padding: '0.75rem' }}>
              <p className="field__hint" style={{ marginBottom: '0.75rem' }}>
                {REVIEW_THRESHOLD_DISCLAIMER}
              </p>
              <NumberField
                key={`hours-threshold-${epoch}`}
                label="Flag an hours increase of at least"
                suffix="percent"
                hint="Compared against the immediately preceding complete month."
                value={{
                  state: { kind: 'known', value: thresholds.hoursIncreasePercent },
                  provenance: 'user-assumption',
                }}
                onCommit={(state) => {
                  if (state.kind === 'known') {
                    setThresholds({ ...thresholds, hoursIncreasePercent: state.value });
                  }
                  setInvalid((current) => ({ ...current, hours: state.kind !== 'known' }));
                }}
              />
              <NumberField
                key={`cost-threshold-${epoch}`}
                label="Flag an effective hourly cost change of at least"
                suffix="percent"
                hint="In either direction, against the preceding complete month."
                value={{
                  state: { kind: 'known', value: thresholds.effectiveHourlyCostChangePercent },
                  provenance: 'user-assumption',
                }}
                onCommit={(state) => {
                  if (state.kind === 'known') {
                    setThresholds({ ...thresholds, effectiveHourlyCostChangePercent: state.value });
                  }
                  setInvalid((current) => ({ ...current, cost: state.kind !== 'known' }));
                }}
              />
              <div className="checkbox-option">
                <input
                  type="checkbox"
                  id="flag-budget"
                  checked={thresholds.flagBudgetOverage}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, flagBudgetOverage: e.target.checked })
                  }
                />
                <label htmlFor="flag-budget">
                  Flag months whose spending exceeds the entered budget
                </label>
              </div>
            </div>
          </details>

          {invalid.hours || invalid.cost ? (
            // Visible even when the thresholds section is collapsed: the flags
            // below are being computed from a value the person did not just type.
            <div className="warnings" role="note" aria-label="Threshold entry not applied">
              <h3>Threshold entry not applied</h3>
              <ul>
                {invalid.hours ? (
                  <li>
                    The hours-increase threshold is empty or not a valid number, so it is not
                    applied. Flags still use the last valid value,{' '}
                    {thresholds.hoursIncreasePercent}%.
                  </li>
                ) : null}
                {invalid.cost ? (
                  <li>
                    The hourly-cost threshold is empty or not a valid number, so it is not
                    applied. Flags still use the last valid value,{' '}
                    {thresholds.effectiveHourlyCostChangePercent}%.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <p className="state-note">
            Thresholds are demonstration values, not an industry standard or an anomaly detector.
          </p>
        </section>

        <section className="results" aria-labelledby="overtime-results-heading">
          <h3 className="pane-title" id="overtime-results-heading">
            Overtime history
          </h3>

          <TrendChart
            points={points}
            metricLabel={config.label}
            axisTitle={config.axisTitle}
            formatTick={config.formatTick}
            summary={summarise(points, config)}
            showBudget={config.showBudget}
            zeroBased={config.zeroBased}
            emphasiseZero={config.emphasiseZero}
          />
          <p className="state-note">
            {rows.length} months recorded, {knownCount} with a value for this measure.
            Descriptive only, not a forecast.
          </p>

          <h3 className="pane-title" style={{ marginTop: '1.5rem' }}>
            Needs review
          </h3>

          {flags.length === 0 ? (
            <p className="notice">
              No month met the thresholds. That is a statement about these thresholds and these
              records, nothing more.
            </p>
          ) : (
            <ul className="flag-list">
              {flags.map((flag) => (
                <FlagCard key={flag.id} flag={flag} />
              ))}
            </ul>
          )}

          {notAssessed.length > 0 ? (
            <Disclosure summary={`Months not assessed (${notAssessed.length})`}>
              <p className="section__hint" style={{ marginBottom: '0.75rem' }}>
                These months were not compared. A month with no record is not a month with zero
                overtime.
              </p>
              <ul className="stack-tight">
                {notAssessed.map((item, index) => (
                  <li key={`${item.month}-${index}`}>
                    <strong>{formatYearMonthLong(item.month)}</strong> — {item.reason}
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}

          <Disclosure summary="Monthly records — table of the chart data">
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Monthly overtime records table">
              <table>
                <caption>
                  Effective hourly cost is dollars divided by hours, shown only where both are
                  recorded and hours are above zero.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col" className="num">
                      Hours
                    </th>
                    <th scope="col" className="num">
                      Dollars
                    </th>
                    <th scope="col" className="num">
                      Effective hourly cost
                    </th>
                    <th scope="col" className="num">
                      Budget variance
                    </th>
                    <th scope="col">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month}>
                      <th scope="row">{formatYearMonthLong(row.month)}</th>
                      <td className="num">
                        {row.hours.kind === 'known' ? (
                          groupedNumber(Math.round(row.hours.value * 10) / 10)
                        ) : (
                          <span className="state-note">
                            {row.hours.kind === 'missing' ? 'Missing' : 'Unknown'}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        <Amount state={row.dollars} />
                      </td>
                      <td className="num">
                        {row.effectiveHourlyCost.kind === 'computed' ? (
                          formatUSD(row.effectiveHourlyCost.amount)
                        ) : (
                          <NotEnoughData reason={row.effectiveHourlyCost.reason} />
                        )}
                      </td>
                      <td className="num">
                        {row.budgetVariance.kind === 'computed' ? (
                          <span
                            className={row.budgetVariance.overBudget ? 'amount--negative' : undefined}
                          >
                            {formatSignedUSD(row.budgetVariance.variance)}
                          </span>
                        ) : row.budgetVariance.kind === 'no-budget' ? (
                          <span className="state-note">No budget</span>
                        ) : (
                          <NotEnoughData reason={row.budgetVariance.reason} />
                        )}
                      </td>
                      <td>
                        {flaggedMonths.has(row.month) ? (
                          <span className="review-mark">Needs review</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="row--total">
                    <th scope="row">Total across {totals.monthsCounted} months</th>
                    <td className="num">
                      {totals.totalHours.kind === 'known' ? (
                        groupedNumber(Math.round(totals.totalHours.value * 10) / 10)
                      ) : (
                        <NotEnoughData reason={`${totals.monthsIncomplete} incomplete month(s)`} />
                      )}
                    </td>
                    <td className="num">
                      <Amount state={totals.totalDollars} />
                    </td>
                    <td className="num">
                      {totals.overallEffectiveHourlyCost.kind === 'computed' ? (
                        formatUSD(totals.overallEffectiveHourlyCost.amount)
                      ) : (
                        <NotEnoughData reason={totals.overallEffectiveHourlyCost.reason} />
                      )}
                    </td>
                    <td className="num">—</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Disclosure>
        </section>
      </div>
    </div>
  );
}

function FlagCard({ flag }: { flag: Flag }) {
  return (
    <li className="flag">
      <span className="flag__status">{flag.label}</span>
      <div className="flag__title">{flag.title}</div>
      <p>{flag.summary}</p>
      <dl className="flag__meta">
        <div>
          <dt>Records:</dt>
          <dd>{flag.months.map((m) => formatYearMonthLong(m)).join(' and ')}</dd>
        </div>
        <div>
          <dt>Comparison:</dt>
          <dd>{flag.comparison}</dd>
        </div>
        <div>
          <dt>Threshold:</dt>
          <dd>{flag.threshold}</dd>
        </div>
      </dl>
    </li>
  );
}

function metricValue(row: MonthlyOvertimeRow, metric: Metric): number | undefined {
  switch (metric) {
    case 'hours':
      return row.hours.kind === 'known' ? row.hours.value : undefined;
    case 'dollars':
      return row.dollars.kind === 'known' ? centsToNumber(row.dollars.value) : undefined;
    case 'effective':
      return row.effectiveHourlyCost.kind === 'computed'
        ? centsToNumber(row.effectiveHourlyCost.amount)
        : undefined;
    case 'variance':
      return row.budgetVariance.kind === 'computed'
        ? centsToNumber(row.budgetVariance.variance)
        : undefined;
  }
}

function stateWord(kind: 'known' | 'missing' | 'unknown' | 'excluded'): string {
  if (kind === 'unknown') return 'Unknown';
  if (kind === 'excluded') return 'Excluded';
  return 'Missing — no recorded value';
}

/** Why a month has no point for the selected measure. */
function missingText(row: MonthlyOvertimeRow, metric: Metric): string {
  switch (metric) {
    case 'hours':
      return stateWord(row.hours.kind);
    case 'dollars':
      return stateWord(row.dollars.kind);
    case 'effective':
      return 'Not enough comparable data';
    case 'variance':
      return row.budgetVariance.kind === 'no-budget'
        ? 'No budget entered'
        : 'Not enough comparable data';
  }
}

function summarise(points: readonly ChartPoint[], config: MetricConfig): string {
  const known = points.filter((p): p is ChartPoint & { value: number } => p.value !== undefined);
  const first = known[0];
  if (!first) return 'No values are recorded for this measure.';

  let lowest = first;
  let highest = first;
  for (const point of known) {
    if (point.value < lowest.value) lowest = point;
    if (point.value > highest.value) highest = point;
  }

  const gaps = points.length - known.length;
  const gapNote = gaps > 0 ? ` ${gaps} month${gaps === 1 ? '' : 's'} have no recorded value.` : '';

  return (
    `Lowest ${config.formatValue(lowest.value)} in ${lowest.label}, ` +
    `highest ${config.formatValue(highest.value)} in ${highest.label}.${gapNote}`
  );
}
