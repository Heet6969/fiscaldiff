/**
 * Check a stated cost.
 *
 * The scope is settled before any arithmetic happens, so a claim about a
 * different period or a different set of components comes back as "Cannot
 * verify" rather than as a difference that looks like a finding.
 */
import { useMemo, useState } from 'react';
import { useAppState } from '../state/AppState';
import { Amount, Disclosure } from '../components/Common';
import { DateField, MoneyField, NumberField, SelectField } from '../components/Fields';
import { StepsTable } from '../components/StepsTable';
import { checkStatedCost, type Reconciliation } from '../../engine';
import type { OfferId, StatedCostClaim } from '../../domain/dataset';
import { CALCULABLE_COMPONENTS, COMPONENT_LABEL, UNCALCULATED_COMPONENTS, known, type ComponentId } from '../../domain/types';
import { DEFAULT_TOLERANCE_AMOUNT } from '../../engine/config';
import { fromDollars } from '../../money/money';

const SELECTABLE_COMPONENTS: readonly ComponentId[] = [
  ...CALCULABLE_COMPONENTS,
  ...UNCALCULATED_COMPONENTS,
  'total-payroll',
];

function blankClaim(periodStart: string, periodEnd: string): StatedCostClaim {
  return {
    id: 'custom',
    label: 'Figure entered on screen',
    statedAmount: known(fromDollars('0'), 'user-assumption'),
    periodStart,
    periodEnd,
    claimedComponents: ['base-pay-increment', 'one-time-bonus'],
    tolerance: { kind: 'absolute', amount: DEFAULT_TOLERANCE_AMOUNT },
  };
}

export function CheckStatedCost() {
  const { dataset, epoch } = useAppState();
  const [offerId, setOfferId] = useState<OfferId>('A');
  const [claim, setClaim] = useState<StatedCostClaim>(
    () => dataset.statedCosts[0] ?? blankClaim(dataset.fiscalYear.start, dataset.fiscalYear.end),
  );
  const [formKey, setFormKey] = useState(0);

  const reconciliation = useMemo(
    () => checkStatedCost(dataset, claim, offerId),
    [dataset, claim, offerId],
  );

  function loadClaim(id: string) {
    const found = dataset.statedCosts.find((c) => c.id === id);
    setClaim(found ?? blankClaim(dataset.fiscalYear.start, dataset.fiscalYear.end));
    setFormKey((n) => n + 1);
  }

  function toggleComponent(component: ComponentId, checked: boolean) {
    setClaim((current) => ({
      ...current,
      claimedComponents: checked
        ? [...current.claimedComponents, component]
        : current.claimedComponents.filter((c) => c !== component),
    }));
  }

  const toleranceValue =
    claim.tolerance.kind === 'absolute'
      ? claim.tolerance.amount
      : DEFAULT_TOLERANCE_AMOUNT;

  return (
    <div className="stack">
      <section className="section">
        <div className="section__head">
          <h2>The figure you want to check</h2>
          <p className="section__hint">
            Enter a published figure and say what it claims to cover. It is compared only
            against the matching scope from the same calculation used elsewhere in this
            application.
          </p>
        </div>

        <div className="panel">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '0 1.5rem' }}>
            <SelectField
              label="Load a fictional example"
              hint="Or edit the fields below to check your own figure."
              value={claim.id}
              options={[
                ...dataset.statedCosts.map((c) => ({ value: c.id, label: c.label })),
                { value: 'custom', label: 'Enter my own figure' },
              ]}
              onChange={loadClaim}
            />

            <SelectField
              label="Check against"
              value={offerId}
              options={[
                { value: 'A' as OfferId, label: dataset.offers.A.label },
                { value: 'B' as OfferId, label: dataset.offers.B.label },
              ]}
              onChange={(value) => setOfferId(value)}
            />

            <MoneyField
              key={`stated-${formKey}-${epoch}`}
              label="Stated incremental cost"
              value={claim.statedAmount}
              onCommit={(state) =>
                setClaim((current) => ({
                  ...current,
                  statedAmount: { ...current.statedAmount, state },
                }))
              }
            />

            <NumberField
              key={`tolerance-${formKey}-${epoch}`}
              label="Tolerance"
              suffix="dollars"
              hint="A prototype reconciliation tolerance, not an audit standard."
              value={{
                state: { kind: 'known', value: Number(toleranceValue.cents) / 100 },
                provenance: 'user-assumption',
              }}
              onCommit={(state) => {
                if (state.kind !== 'known') return;
                setClaim((current) => ({
                  ...current,
                  tolerance: { kind: 'absolute', amount: fromDollars(state.value.toFixed(2)) },
                }));
              }}
            />

            <DateField
              key={`start-${formKey}-${epoch}`}
              label="Period the figure covers — from"
              value={known(claim.periodStart, 'user-assumption')}
              onCommit={(state) => {
                if (state.kind === 'known') {
                  setClaim((current) => ({ ...current, periodStart: state.value }));
                }
              }}
            />

            <DateField
              key={`end-${formKey}-${epoch}`}
              label="Period the figure covers — to"
              value={known(claim.periodEnd, 'user-assumption')}
              onCommit={(state) => {
                if (state.kind === 'known') {
                  setClaim((current) => ({ ...current, periodEnd: state.value }));
                }
              }}
            />
          </div>

          <fieldset style={{ marginTop: '1rem' }}>
            <legend>What the figure claims to include</legend>
            {SELECTABLE_COMPONENTS.map((component) => {
              const id = `component-${component}`;
              const uncalculated = UNCALCULATED_COMPONENTS.includes(component);
              return (
                <div className="checkbox-option" key={component}>
                  <input
                    type="checkbox"
                    id={id}
                    checked={claim.claimedComponents.includes(component)}
                    onChange={(e) => toggleComponent(component, e.target.checked)}
                  />
                  <label htmlFor={id}>
                    {COMPONENT_LABEL[component]}
                    {uncalculated ? (
                      <span className="field__hint"> — not calculated here; selecting it means the figure cannot be verified</span>
                    ) : null}
                    {component === 'total-payroll' ? (
                      <span className="field__hint"> — not an incremental scope; selecting it means the figure cannot be verified</span>
                    ) : null}
                  </label>
                </div>
              );
            })}
          </fieldset>

          <div style={{ marginTop: '1rem' }}>
            <div className="field">
              <label className="field__label" htmlFor="document-label">
                Supporting document label (optional)
              </label>
              <input
                id="document-label"
                type="text"
                value={claim.documentLabel ?? ''}
                onChange={(e) => setClaim((current) => ({ ...current, documentLabel: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="document-text">
                Relevant passage (optional)
              </label>
              <span className="field__hint" id="document-text-hint">
                Pasted or typed by you. This application does not read documents; there is
                no automated extraction here.
              </span>
              <textarea
                id="document-text"
                aria-describedby="document-text-hint"
                value={claim.documentText ?? ''}
                onChange={(e) => setClaim((current) => ({ ...current, documentText: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="verdict-heading">
        <div className="section__head">
          <h2 id="verdict-heading">Result</h2>
        </div>
        <VerdictPanel reconciliation={reconciliation} />

        <Disclosure summary="Reconciliation — inputs, formulas, assumptions and sources">
          <ReconciliationDetail reconciliation={reconciliation} />
        </Disclosure>
      </section>
    </div>
  );
}

function VerdictPanel({ reconciliation }: { reconciliation: Reconciliation }) {
  const modifier =
    reconciliation.verdict === 'matches'
      ? 'verdict--matches'
      : reconciliation.verdict === 'difference-requires-review'
        ? 'verdict--difference'
        : 'verdict--cannot';

  return (
    <div className={`verdict ${modifier}`} role="status" aria-live="polite">
      <span className="verdict__label">{reconciliation.verdictLabel}</span>

      {reconciliation.refusalReason ? (
        <p>{reconciliation.refusalReason}</p>
      ) : (
        <dl className="detail-list" style={{ marginTop: '0.5rem' }}>
          <dt>Stated</dt>
          <dd>
            <Amount state={reconciliation.statedAmount} />
          </dd>
          <dt>Calculated</dt>
          <dd>
            <Amount state={reconciliation.calculatedAmount} />
          </dd>
          <dt>Difference</dt>
          <dd>
            <Amount state={reconciliation.difference} signed emphasiseSign />
            <span className="state-note"> (stated minus calculated)</span>
          </dd>
          <dt>Tolerance applied</dt>
          <dd>{reconciliation.toleranceDescription}</dd>
        </dl>
      )}

      {reconciliation.verdict === 'difference-requires-review' ? (
        <p style={{ marginTop: '0.75rem' }}>
          A difference is not by itself a mistake. It can mean the figure was built on
          different assumptions or a different scope. Confirm both before drawing a
          conclusion.
        </p>
      ) : null}
    </div>
  );
}

function ReconciliationDetail({ reconciliation }: { reconciliation: Reconciliation }) {
  return (
    <>
      <dl className="detail-list">
        <dt>Claim</dt>
        <dd>{reconciliation.claimLabel}</dd>
        <dt>Period claimed</dt>
        <dd>{reconciliation.periodDescription}</dd>
        <dt>Components claimed</dt>
        <dd>{reconciliation.claimedComponents.map((c) => COMPONENT_LABEL[c]).join(', ') || 'None stated'}</dd>
        <dt>Tolerance</dt>
        <dd>
          {reconciliation.toleranceDescription}
          <br />
          <span className="state-note">{reconciliation.toleranceDisclaimer}</span>
        </dd>
        {reconciliation.documentLabel ? (
          <>
            <dt>Source document</dt>
            <dd>{reconciliation.documentLabel}</dd>
          </>
        ) : null}
      </dl>

      {reconciliation.documentText ? (
        <blockquote className="source-passage">{reconciliation.documentText}</blockquote>
      ) : null}

      <h3 style={{ marginTop: '1.5rem' }}>Components claimed</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col" className="num">
                Calculated for this period
              </th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.componentLines.map((line) => (
              <tr key={line.component}>
                <th scope="row">{line.label}</th>
                <td className="num">
                  {line.amount ? (
                    <Amount state={line.amount} />
                  ) : (
                    <span className="state-note">Not calculated here</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Calculation steps</h3>
      <StepsTable steps={reconciliation.steps} />

      <h3 style={{ marginTop: '1.5rem' }}>Assumptions applied</h3>
      <ul className="stack-tight">
        {reconciliation.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>

      <h3 style={{ marginTop: '1.5rem' }}>Excluded from the calculated figure</h3>
      <ul className="stack-tight">
        {reconciliation.exclusions.map((exclusion) => (
          <li key={exclusion.category}>
            <strong>{exclusion.category}</strong> — {exclusion.reason}
          </li>
        ))}
      </ul>
    </>
  );
}
