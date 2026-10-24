/**
 * Check a stated cost.
 *
 * The scope is settled before any arithmetic happens, so a claim about a
 * different period or a different set of components comes back as "Cannot
 * verify" rather than as a difference that looks like a finding. The chart is
 * drawn only when a comparison was actually made.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../state/AppState';
import { Amount, Disclosure } from '../components/Common';
import { DateField, MoneyField, NumberField, SelectField } from '../components/Fields';
import { StepsTable } from '../components/StepsTable';
import { StatedComparisonChart } from '../components/charts/StatedComparisonChart';
import { checkStatedCost, type Reconciliation } from '../../engine';
import type { OfferId, StatedCostClaim } from '../../domain/dataset';
import {
  CALCULABLE_COMPONENTS,
  COMPONENT_LABEL,
  UNCALCULATED_COMPONENTS,
  known,
  type ComponentId,
} from '../../domain/types';
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

  // This view stays mounted so its entries survive switching tabs. When the
  // whole dataset is replaced (reset or a successful import) it starts over.
  useEffect(() => {
    setClaim(dataset.statedCosts[0] ?? blankClaim(dataset.fiscalYear.start, dataset.fiscalYear.end));
    setFormKey((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

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
    claim.tolerance.kind === 'absolute' ? claim.tolerance.amount : DEFAULT_TOLERANCE_AMOUNT;

  const comparable =
    reconciliation.verdict !== 'cannot-verify' &&
    reconciliation.statedAmount.kind === 'known' &&
    reconciliation.calculatedAmount.kind === 'known' &&
    reconciliation.difference.kind === 'known';

  return (
    <div>
      <header className="view-intro">
        <h2>Does the stated figure match the calculation?</h2>
        <VerdictPanel reconciliation={reconciliation} />
      </header>

      <div className="workbench">
        <section className="controls" aria-labelledby="stated-inputs-heading">
          <h3 className="pane-title" id="stated-inputs-heading">
            The figure to check
          </h3>

          <SelectField
            label="Load a fictional example"
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
            key={`stated-${formKey}`}
            label="Stated incremental cost"
            value={claim.statedAmount}
            onCommit={(state) =>
              setClaim((current) => ({
                ...current,
                statedAmount: { ...current.statedAmount, state },
              }))
            }
          />

          <div className="field-pair">
            <DateField
              key={`start-${formKey}`}
              label="Period the figure covers — from"
              value={known(claim.periodStart, 'user-assumption')}
              onCommit={(state) => {
                if (state.kind === 'known') {
                  setClaim((current) => ({ ...current, periodStart: state.value }));
                }
              }}
            />
            <DateField
              key={`end-${formKey}`}
              label="Period the figure covers — to"
              value={known(claim.periodEnd, 'user-assumption')}
              onCommit={(state) => {
                if (state.kind === 'known') {
                  setClaim((current) => ({ ...current, periodEnd: state.value }));
                }
              }}
            />
          </div>

          <fieldset>
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
                      <span className="field__hint">
                        {' '}
                        — not calculated here; selecting it means the figure cannot be verified
                      </span>
                    ) : null}
                    {component === 'total-payroll' ? (
                      <span className="field__hint">
                        {' '}
                        — not an incremental scope; selecting it means the figure cannot be verified
                      </span>
                    ) : null}
                  </label>
                </div>
              );
            })}
          </fieldset>

          <NumberField
            key={`tolerance-${formKey}`}
            label="Tolerance"
            suffix="dollars"
            hint="A prototype tolerance, not an audit standard."
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

          <div className="field">
            <label className="field__label" htmlFor="document-label">
              Supporting document label (optional)
            </label>
            <input
              id="document-label"
              type="text"
              value={claim.documentLabel ?? ''}
              onChange={(e) =>
                setClaim((current) => ({ ...current, documentLabel: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="document-text">
              Relevant passage (optional)
            </label>
            <span className="field__hint" id="document-text-hint">
              Typed or pasted by you. Nothing here reads documents.
            </span>
            <textarea
              id="document-text"
              aria-describedby="document-text-hint"
              value={claim.documentText ?? ''}
              onChange={(e) =>
                setClaim((current) => ({ ...current, documentText: e.target.value }))
              }
            />
          </div>
        </section>

        <section className="results" aria-labelledby="stated-results-heading">
          <h3 className="pane-title" id="stated-results-heading">
            Stated versus calculated
          </h3>

          {comparable &&
          reconciliation.statedAmount.kind === 'known' &&
          reconciliation.calculatedAmount.kind === 'known' &&
          reconciliation.difference.kind === 'known' ? (
            <StatedComparisonChart
              stated={reconciliation.statedAmount.value}
              calculated={reconciliation.calculatedAmount.value}
              difference={reconciliation.difference.value}
            />
          ) : (
            <p className="notice">
              No comparison is drawn. The scopes cannot be compared, so bars would imply a
              measurement that was never made. The reason is stated above.
            </p>
          )}

          <Disclosure summary="Reconciliation — inputs, formulas, assumptions and sources">
            <ReconciliationDetail reconciliation={reconciliation} />
          </Disclosure>
        </section>
      </div>
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
        <dl className="detail-list">
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
          A difference is not by itself a mistake. It can mean the figure was built on different
          assumptions or a different scope. Confirm both before drawing a conclusion.
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
        <dd>
          {reconciliation.claimedComponents.map((c) => COMPONENT_LABEL[c]).join(', ') ||
            'None stated'}
        </dd>
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
