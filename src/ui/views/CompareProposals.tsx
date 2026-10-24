/**
 * Compare proposals.
 *
 * Total proposed expenditure, increase over baseline, and budget remaining or
 * shortfall are three separately labeled rows. They are easy to conflate and
 * expensive to conflate, so they never share a label.
 */
import { useMemo } from 'react';
import { useAppState } from '../state/AppState';
import { Amount, CompletenessNotice, Disclosure, ExclusionsNote, WarningList } from '../components/Common';
import { MoneyField } from '../components/Fields';
import { OfferForm } from '../components/OfferForm';
import { AssumptionsList, StepsTable } from '../components/StepsTable';
import { ComparatorTable } from '../components/ComparatorTable';
import { overtimeStressTest, type OfferResult } from '../../engine';
import type { BudgetPosition } from '../../engine/offer';
import { formatUSD } from '../../money/money';
import type { OfferId } from '../../domain/dataset';
import type { ValueState } from '../../domain/types';
import type { Money } from '../../money/money';

const OFFER_IDS: readonly OfferId[] = ['A', 'B'];

export function CompareProposals() {
  const { dataset, engine, epoch, updateOffer, updateDataset } = useAppState();
  const offerA = engine.offers.A;
  const offerB = engine.offers.B;

  const stressA = useMemo(() => overtimeStressTest(dataset, 'A'), [dataset]);

  const allWarnings = [...new Set([...offerA.warnings, ...offerB.warnings])];

  const subject = dataset.employees[0];

  return (
    <div className="stack">
      <section className="section">
        <div className="section__head">
          <h2>What the department costs now</h2>
          <p className="section__hint">
            {dataset.department.name} · {offerA.baseline.headcount} employees ·{' '}
            {offerA.baseline.bonusEligibleCount} marked bonus-eligible · fiscal year{' '}
            {dataset.fiscalYear.label}
          </p>
        </div>

        <div className="panel panel--sunken">
          <dl className="detail-list">
            <dt>Baseline annual base pay</dt>
            <dd>
              <Amount state={offerA.baseline.annualBasePay} />
            </dd>
            <dt>Baseline annual overtime</dt>
            <dd>
              <Amount state={offerA.baseline.annualOvertimeCost} />
            </dd>
            <dt>Baseline annual cost</dt>
            <dd>
              <Amount state={offerA.baselineTotalCost} />
            </dd>
          </dl>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Workforce budget</h2>
          <p className="section__hint">
            Optional. Leave it empty and no remaining-or-shortfall figure is shown; a
            budget is never assumed.
          </p>
        </div>
        <div className="panel" style={{ maxWidth: '26rem' }}>
          <MoneyField
            key={`budget-${epoch}`}
            label="Adopted workforce budget for this fiscal year"
            value={
              dataset.workforceBudget ?? {
                state: { kind: 'missing' },
                provenance: 'user-assumption',
              }
            }
            onCommit={(state: ValueState<Money>) =>
              updateDataset({
                workforceBudget: {
                  state,
                  provenance: 'user-assumption',
                  sourceLabel: 'Entered on screen',
                },
              })
            }
          />
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>The two offers</h2>
          <p className="section__hint">
            Offer A and Offer B are independent. Editing one never changes the other.
          </p>
        </div>
        <div className="offer-grid">
          {OFFER_IDS.map((id) => (
            <OfferForm
              key={`${id}-${epoch}`}
              offerId={id}
              offer={dataset.offers[id]}
              onChange={(patch) => updateOffer(id, patch)}
            />
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="results-heading">
        <div className="section__head">
          <h2 id="results-heading">What each offer costs</h2>
        </div>

        <WarningList title="Things to be aware of" items={allWarnings} />
        <CompletenessNotice completeness={offerA.completeness} />
        {offerB.completeness.kind !== 'complete' && offerB.label !== offerA.label ? (
          <CompletenessNotice completeness={offerB.completeness} />
        ) : null}

        <ResultsTable a={offerA} b={offerB} budgetA={engine.budgets.A} budgetB={engine.budgets.B} />

        <ExclusionsNote exclusions={offerA.exclusions} />
      </section>

      <section className="section">
        <Disclosure summary="Assumptions and calculation steps — Offer A">
          <AssumptionsList assumptions={offerA.assumptions} exclusions={offerA.exclusions} />
          <h3 style={{ marginTop: '1.5rem' }}>Calculation steps</h3>
          <p className="section__hint" style={{ marginBottom: '0.75rem' }}>
            {offerA.prorationNote}
          </p>
          <StepsTable steps={offerA.steps} />
        </Disclosure>

        <Disclosure summary="Assumptions and calculation steps — Offer B">
          <AssumptionsList assumptions={offerB.assumptions} exclusions={offerB.exclusions} />
          <h3 style={{ marginTop: '1.5rem' }}>Calculation steps</h3>
          <p className="section__hint" style={{ marginBottom: '0.75rem' }}>
            {offerB.prorationNote}
          </p>
          <StepsTable steps={offerB.steps} />
        </Disclosure>

        <Disclosure summary="Overtime hours stress test — Offer A">
          {stressA.baseHours === undefined ? (
            <p className="state-note">
              Overtime is not modeled for Offer A, so there are no hours to vary. Choose a
              rate basis under Overtime assumptions to use this.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <caption>
                  Varies one stated assumption — modeled overtime hours per month, from a
                  base of {stressA.baseHours} hours. Everything else is held constant.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Scenario</th>
                    <th scope="col" className="num">
                      Hours per month
                    </th>
                    <th scope="col" className="num">
                      Overtime increase
                    </th>
                    <th scope="col" className="num">
                      Total current-year increase
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stressA.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td className="num">{row.monthlyHours}</td>
                      <td className="num">
                        <Amount state={row.overtimeIncrement} />
                      </td>
                      <td className="num">
                        <Amount state={row.totalIncremental} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Disclosure>

        <Disclosure summary="Comparison context — other municipalities">
          <ComparatorTable
            comparators={dataset.comparators}
            subjectRole={subject?.role ?? 'the subject position'}
            subjectGradeStep={subject?.gradeStep ?? 'the subject grade'}
          />
        </Disclosure>
      </section>
    </div>
  );
}

function ResultsTable({
  a,
  b,
  budgetA,
  budgetB,
}: {
  a: OfferResult;
  b: OfferResult;
  budgetA: BudgetPosition | undefined;
  budgetB: BudgetPosition | undefined;
}) {
  return (
    <div className="table-wrap">
      <table>
        <caption>
          All amounts are for fiscal year {a.fiscalYear.label} unless the row says
          otherwise.
        </caption>
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
            <th scope="row">Annualized recurring increase, full 12 months</th>
            <td className="num">
              <Amount state={a.annualizedRecurringIncrease} />
            </td>
            <td className="num">
              <Amount state={b.annualizedRecurringIncrease} />
            </td>
          </tr>

          <tr className="row--total">
            <th scope="row">Total proposed expenditure, baseline plus increase</th>
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
              <BudgetCell position={budgetA} />
            </td>
            <td className="num">
              <BudgetCell position={budgetB} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BudgetCell({ position }: { position: BudgetPosition | undefined }) {
  if (!position) {
    return <span className="state-note">No budget entered</span>;
  }
  return (
    <>
      <Amount state={{ kind: 'known', value: position.remaining }} signed emphasiseSign />
      <br />
      <span className="state-note">
        {position.isShortfall ? 'Workforce budget shortfall' : 'Remaining'} against{' '}
        {formatUSD(position.budget)}
      </span>
    </>
  );
}
