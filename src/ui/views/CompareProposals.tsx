/**
 * Compare proposals.
 *
 * Total proposed expenditure, increase over baseline, and budget remaining or
 * shortfall are separately labeled. They are easy to conflate and expensive to
 * conflate, so they never share a label.
 *
 * The chart and the key-result strip read the same engine output as the table;
 * nothing here recomputes a figure.
 */
import { useMemo } from 'react';
import { useAppState } from '../state/AppState';
import {
  Amount,
  CompletenessNotice,
  Disclosure,
  ExclusionsNote,
  WarningList,
} from '../components/Common';
import { MoneyField } from '../components/Fields';
import { OfferForm } from '../components/OfferForm';
import { AssumptionsList, StepsTable } from '../components/StepsTable';
import { ComparatorTable } from '../components/ComparatorTable';
import { StackedCostChart, type StackedOffer } from '../components/charts/StackedCostChart';
import { overtimeStressTest, type OfferResult } from '../../engine';
import { SUBJECT_PAY_BASIS } from '../../engine/comparators';
import type { BudgetPosition } from '../../engine/offer';
import { formatSignedUSD, formatUSD, type Money } from '../../money/money';
import type { OfferId } from '../../domain/dataset';
import type { ValueState } from '../../domain/types';

const OFFER_IDS: readonly OfferId[] = ['A', 'B'];

function toStacked(result: OfferResult, id: string): StackedOffer {
  return {
    id,
    label: result.label,
    segments: [
      { key: 'base', label: 'Base-pay increase', state: result.currentYearBasePayIncrement },
      { key: 'overtime', label: 'Overtime increase', state: result.currentYearOvertimeIncrement },
      { key: 'onetime', label: 'One-time bonus', state: result.oneTimeCost },
    ],
    total: result.currentYearTotalIncremental,
    annualizedRecurring: result.annualizedRecurringIncrease,
  };
}

export function CompareProposals() {
  const { dataset, engine, epoch, updateOffer, updateDataset } = useAppState();
  const offerA = engine.offers.A;
  const offerB = engine.offers.B;

  const stressA = useMemo(() => overtimeStressTest(dataset, 'A'), [dataset]);
  const allWarnings = [...new Set([...offerA.warnings, ...offerB.warnings])];
  const subject = dataset.employees[0];

  return (
    <div>
      <header className="view-intro">
        <h2>What would each offer cost this fiscal year?</h2>
        <KeyResult
          results={[offerA, offerB]}
          budgets={[engine.budgets.A, engine.budgets.B]}
        />
      </header>

      <div className="workbench">
        <section className="controls" aria-labelledby="inputs-heading">
          <h3 className="pane-title" id="inputs-heading">
            Your inputs
          </h3>

          <MoneyField
            key={`budget-${epoch}`}
            label="Adopted workforce budget for this fiscal year"
            hint="Optional. Leave empty and no remaining-or-shortfall figure is shown."
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

          {OFFER_IDS.map((id) => (
            <OfferForm
              key={`${id}-${epoch}`}
              offerId={id}
              offer={dataset.offers[id]}
              onChange={(patch) => updateOffer(id, patch)}
            />
          ))}
        </section>

        <section className="results" aria-labelledby="results-heading">
          <h3 className="pane-title" id="results-heading">
            Results
          </h3>

          <WarningList title="Things to be aware of" items={allWarnings} />
          <CompletenessNotice completeness={offerA.completeness} />
          {offerB.completeness.kind !== 'complete' && offerB.label !== offerA.label ? (
            <CompletenessNotice completeness={offerB.completeness} />
          ) : null}

          <StackedCostChart
            offers={[toStacked(offerA, 'A'), toStacked(offerB, 'B')]}
          />

          <ResultsTable
            a={offerA}
            b={offerB}
            budgetA={engine.budgets.A}
            budgetB={engine.budgets.B}
          />

          <ExclusionsNote exclusions={offerA.exclusions} />

          <dl className="baseline-strip">
            <div>
              <dt>Baseline annual base pay</dt>
              <dd>
                <Amount state={offerA.baseline.annualBasePay} />
              </dd>
            </div>
            <div>
              <dt>Baseline annual overtime</dt>
              <dd>
                <Amount state={offerA.baseline.annualOvertimeCost} />
              </dd>
            </div>
            <div>
              <dt>Baseline annual cost</dt>
              <dd>
                <Amount state={offerA.baselineTotalCost} />
              </dd>
            </div>
          </dl>
          <p className="state-note">
            Baseline for {offerA.baseline.headcount} employees,{' '}
            {offerA.baseline.bonusEligibleCount} marked bonus-eligible.
          </p>

          <div>
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
                <div className="table-wrap" tabIndex={0} role="region" aria-label="Overtime hours stress test table">
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
                subjectPayBasis={SUBJECT_PAY_BASIS}
              />
            </Disclosure>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Plain words for the sign of a change from baseline. */
function changeWord(state: ValueState<Money>): string {
  if (state.kind !== 'known') return 'change';
  if (state.value.cents < 0n) return 'decrease (saving)';
  if (state.value.cents === 0n) return 'no change';
  return 'increase';
}

/** The answer to the view's question, before anything else. */
function KeyResult({
  results,
  budgets,
}: {
  results: readonly [OfferResult, OfferResult];
  budgets: readonly [BudgetPosition | undefined, BudgetPosition | undefined];
}) {
  return (
    <dl className="key-result">
      {results.map((result, index) => {
        const budget = budgets[index];
        return (
          <div className="key-result__item" key={result.offerId}>
            <dt>{result.label}</dt>
            <dd className="key-result__value">
              <Amount state={result.currentYearTotalIncremental} />{' '}
              <span className="key-result__unit">
                {changeWord(result.currentYearTotalIncremental)} this fiscal year
              </span>
            </dd>
            <dd className="key-result__sub">
              <Amount state={result.annualizedRecurringIncrease} /> a year once fully in effect
            </dd>
            <dd className="key-result__sub">
              {budget ? (
                <span className={budget.isShortfall ? 'amount--negative' : undefined}>
                  {budget.isShortfall ? 'Workforce budget shortfall' : 'Budget remaining'}{' '}
                  {formatSignedUSD(budget.remaining)}
                </span>
              ) : (
                'No workforce budget entered'
              )}
            </dd>
          </div>
        );
      })}
    </dl>
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
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Offer comparison results table">
      <table>
        <caption>
          Fiscal year {a.fiscalYear.label} unless a row says otherwise. A negative amount is a
          decrease from baseline (a saving).
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
