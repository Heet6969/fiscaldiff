/**
 * A printable summary for a meeting.
 *
 * A print stylesheet over a plain layout, not a generated binary. Charts are
 * replaced by their data, and every page carries the synthetic-data label, the
 * fiscal period, the assumptions, the exclusions and the generation date.
 */
import { useAppState } from '../state/AppState';
import { Amount } from '../components/Common';
import { formatSignedUSD, formatUSD } from '../../money/money';
import type { BudgetPosition } from '../../engine/offer';
import { formatYearMonthLong } from '../../engine/dates';
import { COMPONENT_LABEL } from '../../domain/types';

/**
 * Budget position. The word is always present, so the meaning never rests on
 * the sign or on colour.
 */
function BudgetSummaryCell({ position }: { position: BudgetPosition | undefined }) {
  if (!position) return <span className="state-note">No budget entered</span>;
  return (
    <>
      {formatSignedUSD(position.remaining)}
      <br />
      <span className="state-note">
        {position.isShortfall ? 'Workforce budget shortfall' : 'Remaining'} against{' '}
        {formatUSD(position.budget)}
      </span>
    </>
  );
}

export function PrintableReport({
  generatedOn,
  onBack,
}: {
  generatedOn: string;
  onBack: () => void;
}) {
  const { dataset, engine, statedOutcome } = useAppState();
  const a = engine.offers.A;
  const b = engine.offers.B;
  const flags = engine.flags.flags;

  return (
    <div className="shell" style={{ paddingTop: '1.5rem' }}>
      <div className="button-row no-print" style={{ marginBottom: '1.5rem' }}>
        <button type="button" className="button" onClick={() => window.print()}>
          Print this summary
        </button>
        <button type="button" className="button button--secondary" onClick={onBack}>
          Back to the application
        </button>
      </div>

      <article className="stack">
        <header>
          <h1>CivicVariance — workforce budget impact summary</h1>
          <p className="state-note">Understand workforce costs. Explain every difference.</p>
          <p>
            <strong>{dataset.meta.label}.</strong> All figures below are fictional. This is
            not a statement about any real municipality, contract or official.
          </p>
          <dl className="detail-list" style={{ marginTop: '0.75rem' }}>
            <dt>Department</dt>
            <dd>{dataset.department.name}</dd>
            <dt>Fiscal year</dt>
            <dd>{dataset.fiscalYear.label}</dd>
            <dt>Generated on</dt>
            <dd>{generatedOn}</dd>
            <dt>Prepared with</dt>
            <dd>CivicVariance — prototype, synthetic data only</dd>
          </dl>
        </header>

        <section>
          <h2>What each offer costs</h2>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Offer comparison table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Figure</th>
                  <th scope="col" className="num">
                    {a.label}
                  </th>
                  <th scope="col" className="num">
                    {b.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Baseline annual cost</th>
                  <td className="num">
                    <Amount state={a.baselineTotalCost} />
                  </td>
                  <td className="num">
                    <Amount state={b.baselineTotalCost} />
                  </td>
                </tr>
                <tr className="row--total">
                  <th scope="row">Increase over baseline, this fiscal year</th>
                  <td className="num">
                    <Amount state={a.currentYearTotalIncremental} />
                  </td>
                  <td className="num">
                    <Amount state={b.currentYearTotalIncremental} />
                  </td>
                </tr>
                <tr className="row--indent">
                  <th scope="row">Base pay</th>
                  <td className="num">
                    <Amount state={a.currentYearBasePayIncrement} />
                  </td>
                  <td className="num">
                    <Amount state={b.currentYearBasePayIncrement} />
                  </td>
                </tr>
                <tr className="row--indent">
                  <th scope="row">Overtime</th>
                  <td className="num">
                    <Amount state={a.currentYearOvertimeIncrement} />
                  </td>
                  <td className="num">
                    <Amount state={b.currentYearOvertimeIncrement} />
                  </td>
                </tr>
                <tr className="row--indent">
                  <th scope="row">One-time cost, not recurring</th>
                  <td className="num">
                    <Amount state={a.oneTimeCost} />
                  </td>
                  <td className="num">
                    <Amount state={b.oneTimeCost} />
                  </td>
                </tr>
                <tr className="row--total">
                  <th scope="row">Annualized recurring increase</th>
                  <td className="num">
                    <Amount state={a.annualizedRecurringIncrease} />
                  </td>
                  <td className="num">
                    <Amount state={b.annualizedRecurringIncrease} />
                  </td>
                </tr>
                <tr className="row--total">
                  <th scope="row">Total proposed expenditure</th>
                  <td className="num">
                    <Amount state={a.totalProposedExpenditure} />
                  </td>
                  <td className="num">
                    <Amount state={b.totalProposedExpenditure} />
                  </td>
                </tr>
                <tr className="row--total">
                  <th scope="row">Workforce budget remaining or shortfall</th>
                  <td className="num">
                    <BudgetSummaryCell position={engine.budgets.A} />
                  </td>
                  <td className="num">
                    <BudgetSummaryCell position={engine.budgets.B} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Stated cost check</h2>
          {statedOutcome.kind === 'needs-correction' ? (
            <dl className="detail-list">
              <dt>Offer compared against</dt>
              <dd>{statedOutcome.offerLabel}</dd>
              <dt>Claim</dt>
              <dd>{statedOutcome.claimLabel}</dd>
              <dt>Status</dt>
              <dd>
                <strong>Cannot compare yet</strong> — an entry needs correcting. Nothing was
                compared.
              </dd>
              <dt>Needs correction</dt>
              <dd>
                <ul className="stack-tight">
                  {statedOutcome.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </dd>
              {statedOutcome.draft.documentLabel ? (
                <>
                  <dt>Source document</dt>
                  <dd>{statedOutcome.draft.documentLabel}</dd>
                </>
              ) : null}
              {statedOutcome.draft.documentText ? (
                <>
                  <dt>Supporting passage</dt>
                  <dd>{statedOutcome.draft.documentText}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <dl className="detail-list">
              <dt>Offer compared against</dt>
              <dd>{statedOutcome.reconciliation.offerLabel}</dd>
              <dt>Claim</dt>
              <dd>{statedOutcome.reconciliation.claimLabel}</dd>
              <dt>Verdict</dt>
              <dd>
                <strong>{statedOutcome.reconciliation.verdictLabel}</strong>
                {statedOutcome.reconciliation.refusalReason
                  ? ` — ${statedOutcome.reconciliation.refusalReason}`
                  : null}
              </dd>
              <dt>Period claimed</dt>
              <dd>{statedOutcome.reconciliation.periodDescription}</dd>
              <dt>Components claimed</dt>
              <dd>
                {statedOutcome.reconciliation.claimedComponents
                  .map((c) => COMPONENT_LABEL[c])
                  .join(', ')}
              </dd>
              <dt>Stated</dt>
              <dd>
                <Amount state={statedOutcome.reconciliation.statedAmount} />
              </dd>
              <dt>Calculated</dt>
              <dd>
                <Amount state={statedOutcome.reconciliation.calculatedAmount} />
              </dd>
              <dt>Difference</dt>
              <dd>
                <Amount state={statedOutcome.reconciliation.difference} signed />{' '}
                <span className="state-note">(stated minus calculated)</span>
              </dd>
              <dt>Tolerance applied</dt>
              <dd>{statedOutcome.reconciliation.toleranceDescription}</dd>
              {statedOutcome.reconciliation.documentLabel ? (
                <>
                  <dt>Source document</dt>
                  <dd>{statedOutcome.reconciliation.documentLabel}</dd>
                </>
              ) : null}
              {statedOutcome.reconciliation.documentText ? (
                <>
                  <dt>Supporting passage</dt>
                  <dd>{statedOutcome.reconciliation.documentText}</dd>
                </>
              ) : null}
            </dl>
          )}
        </section>
        <section>
          <h2>Overtime patterns needing review</h2>
          {flags.length === 0 ? (
            <p>No month met the configured review thresholds.</p>
          ) : (
            <ul className="stack-tight">
              {flags.map((flag) => (
                <li key={flag.id}>
                  <strong>
                    {flag.label}: {flag.title}
                  </strong>
                  <br />
                  {flag.summary}
                  <br />
                  <span className="state-note">
                    Records: {flag.months.map((m) => formatYearMonthLong(m)).join(' and ')}.{' '}
                    Comparison: {flag.comparison} Threshold: {flag.threshold}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="state-note" style={{ marginTop: '0.5rem' }}>
            A flag indicates a pattern a person should examine. It is not a finding, and no
            cause is inferred.
          </p>
        </section>

        <section>
          <h2>Assumptions applied</h2>
          <ul className="stack-tight">
            {a.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Excluded from every figure</h2>
          <ul className="stack-tight">
            {a.exclusions.map((exclusion) => (
              <li key={exclusion.category}>
                <strong>{exclusion.category}</strong> — {exclusion.reason}
              </li>
            ))}
          </ul>
        </section>

        {a.warnings.length > 0 ? (
          <section>
            <h2>Cautions</h2>
            <ul className="stack-tight">
              {a.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer>
          <p className="state-note">
            {dataset.meta.label} · {dataset.meta.generatedFrom} · {dataset.fiscalYear.label} ·
            generated {generatedOn}. Figures are produced by the same calculation used on
            screen. Employer taxes, pension and benefits are not included.
          </p>
        </footer>
      </article>
    </div>
  );
}
