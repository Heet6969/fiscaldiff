/**
 * Review overtime.
 *
 * Describes what the records say and flags patterns worth a human look. It does
 * not say why anything moved, and the only status word is "Needs review".
 */
import { useMemo, useState } from 'react';
import { useAppState } from '../state/AppState';
import { Amount, Disclosure, NotEnoughData } from '../components/Common';
import { NumberField } from '../components/Fields';
import { TrendChart, type ChartPoint } from '../components/TrendChart';
import { formatSignedUSD, formatUSD, toDecimalDollars } from '../../money/money';
import { formatYearMonthLong } from '../../engine/dates';
import { REVIEW_THRESHOLD_DISCLAIMER } from '../../engine/config';
import type { MonthlyOvertimeRow } from '../../engine/overtime';
import type { Flag } from '../../engine/flags';

type Metric = 'hours' | 'dollars' | 'effective' | 'variance';

const METRIC_OPTIONS: readonly { value: Metric; label: string }[] = [
  { value: 'hours', label: 'Overtime hours per month' },
  { value: 'dollars', label: 'Overtime dollars per month' },
  { value: 'effective', label: 'Effective overtime hourly cost' },
  { value: 'variance', label: 'Budget variance per month' },
];

export function ReviewOvertime() {
  const { engine, thresholds, setThresholds, epoch } = useAppState();
  const [metric, setMetric] = useState<Metric>('hours');

  const rows = engine.overtimeRows;
  const totals = engine.overtimeTotals;
  const { flags, notAssessed } = engine.flags;

  const points = useMemo<ChartPoint[]>(
    () =>
      rows.map((row) => ({
        label: formatYearMonthLong(row.month),
        shortLabel: row.month,
        value: metricValue(row, metric),
      })),
    [rows, metric],
  );

  const metricLabel = METRIC_OPTIONS.find((o) => o.value === metric)?.label ?? 'Overtime';
  const knownCount = points.filter((p) => p.value !== undefined).length;

  return (
    <div className="stack">
      <section className="section">
        <div className="section__head">
          <h2>Overtime history</h2>
          <p className="section__hint">
            {rows.length} month{rows.length === 1 ? '' : 's'} of records, {knownCount} with a
            value for this measure. Figures describe what was recorded. They are not a
            forecast.
          </p>
        </div>

        <div className="panel">
          <div style={{ maxWidth: '24rem', marginBottom: '1rem' }}>
            <div className="field">
              <label className="field__label" htmlFor="metric-select">
                Show
              </label>
              <select
                id="metric-select"
                value={metric}
                onChange={(e) => setMetric(e.target.value as Metric)}
              >
                {METRIC_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TrendChart
            points={points}
            metricLabel={metricLabel}
            formatValue={(value) => formatMetric(value, metric, true)}
            summary={summarise(points, metric)}
          />
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Needs review</h2>
          <p className="section__hint">{REVIEW_THRESHOLD_DISCLAIMER}</p>
        </div>

        <div className="panel panel--sunken" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Demonstration thresholds</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1rem' }}>
            <NumberField
              key={`hours-threshold-${epoch}`}
              label="Flag an hours increase of at least"
              suffix="percent"
              hint="Compared against the immediately preceding complete month."
              value={{ state: { kind: 'known', value: thresholds.hoursIncreasePercent }, provenance: 'user-assumption' }}
              onCommit={(state) => {
                if (state.kind === 'known') {
                  setThresholds({ ...thresholds, hoursIncreasePercent: state.value });
                }
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
              }}
            />
          </div>
          <div className="checkbox-option" style={{ marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              id="flag-budget"
              checked={thresholds.flagBudgetOverage}
              onChange={(e) => setThresholds({ ...thresholds, flagBudgetOverage: e.target.checked })}
            />
            <label htmlFor="flag-budget">Flag months whose spending exceeds the entered budget</label>
          </div>
        </div>

        {flags.length === 0 ? (
          <p className="notice">
            No month met the thresholds above. That is a statement about these thresholds
            and these records, nothing more.
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
              These months were not compared. A month with no record is not a month with
              zero overtime.
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
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Monthly records</h2>
        </div>
        <div className="table-wrap">
          <table>
            <caption>
              The same figures as the chart above. Effective hourly cost is dollars divided
              by hours, shown only where both are recorded and hours are above zero.
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
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <th scope="row">{formatYearMonthLong(row.month)}</th>
                  <td className="num">
                    {row.hours.kind === 'known' ? (
                      formatHoursValue(row.hours.value)
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
                      <span className={row.budgetVariance.overBudget ? 'amount--negative' : undefined}>
                        {formatSignedUSD(row.budgetVariance.variance)}
                      </span>
                    ) : row.budgetVariance.kind === 'no-budget' ? (
                      <span className="state-note">No budget</span>
                    ) : (
                      <NotEnoughData reason={row.budgetVariance.reason} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="row--total">
                <th scope="row">Total across {totals.monthsCounted} months</th>
                <td className="num">
                  {totals.totalHours.kind === 'known' ? (
                    formatHoursValue(totals.totalHours.value)
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
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
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
      return row.dollars.kind === 'known' ? toDecimalDollars(row.dollars.value).toNumber() : undefined;
    case 'effective':
      return row.effectiveHourlyCost.kind === 'computed'
        ? toDecimalDollars(row.effectiveHourlyCost.amount).toNumber()
        : undefined;
    case 'variance':
      return row.budgetVariance.kind === 'computed'
        ? toDecimalDollars(row.budgetVariance.variance).toNumber()
        : undefined;
  }
}

function formatMetric(value: number, metric: Metric, compact = false): string {
  if (metric === 'hours') return compact ? String(Math.round(value)) : formatHoursValue(value);
  const rounded = Math.round(value);
  if (compact) {
    const abs = Math.abs(rounded);
    const sign = rounded < 0 ? '-' : '';
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${sign}$${abs}`;
  }
  return `$${rounded.toLocaleString('en-US')}`;
}

function formatHoursValue(hours: number): string {
  return hours.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function summarise(points: readonly ChartPoint[], metric: Metric): string {
  const known = points.filter((p) => p.value !== undefined) as { label: string; value: number }[];
  if (known.length === 0) return 'No values are recorded for this measure.';

  let lowest = known[0];
  let highest = known[0];
  if (!lowest || !highest) return 'No values are recorded for this measure.';
  for (const point of known) {
    if (point.value < lowest.value) lowest = point;
    if (point.value > highest.value) highest = point;
  }

  const gaps = points.length - known.length;
  const gapNote = gaps > 0 ? ` ${gaps} month${gaps === 1 ? '' : 's'} have no recorded value.` : '';

  return (
    `Lowest ${formatMetric(lowest.value, metric)} in ${lowest.label}, ` +
    `highest ${formatMetric(highest.value, metric)} in ${highest.label}.${gapNote}`
  );
}
