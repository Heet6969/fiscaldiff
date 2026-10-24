/**
 * Check a stated cost.
 *
 * The scope is settled before any arithmetic happens, so a claim about a
 * different period or a different set of components comes back as "Cannot
 * verify" rather than as a difference that looks like a finding. The chart is
 * drawn only when a comparison was actually made.
 */
import { useState } from 'react';
import { useAppState } from '../state/AppState';
import { Amount, Disclosure } from '../components/Common';
import { DateField, MoneyField, NumberField, SelectField } from '../components/Fields';
import { StepsTable } from '../components/StepsTable';
import { StatedComparisonChart } from '../components/charts/StatedComparisonChart';
import type { OfferId, Tolerance } from '../../domain/dataset';
import {
  CALCULABLE_COMPONENTS,
  COMPONENT_LABEL,
  UNCALCULATED_COMPONENTS,
  editedInput,
  known,
  missing,
  type ComponentId,
} from '../../domain/types';
import {
  DEFAULT_TOLERANCE_AMOUNT,
  type Reconciliation,
  type StatedCheckOutcome,
} from '../../engine';
import { fromDollars } from '../../money/money';

const SELECTABLE_COMPONENTS: readonly ComponentId[] = [
  ...CALCULABLE_COMPONENTS,
  ...UNCALCULATED_COMPONENTS,
  'total-payroll',
];

/** A typed tolerance as an amount, or null when it cannot be one. */
function toleranceFromNumber(dollars: number): Tolerance | null {
  try {
    return { kind: 'absolute', amount: fromDollars(dollars.toFixed(2)) };
  } catch {
    return null;
  }
}

export function CheckStatedCost() {
  const {
    dataset,
    epoch,
    statedInputs,
    statedOutcome,
    updateStatedClaim,
    setStatedOffer,
    loadStatedClaim,
  } = useAppState();
  const claim = statedInputs.claim;
  const offerId = statedInputs.offerId;
  const [formKey, setFormKey] = useState(0);
  const fieldKey = `${epoch}-${formKey}`;

  function loadClaim(id: string) {
    loadStatedClaim(id);
    setFormKey((n) => n + 1);
  }

  function toggleComponent(component: ComponentId, checked: boolean) {
    updateStatedClaim((current) => ({
      claimedComponents: checked
        ? [...current.claimedComponents, component]
        : current.claimedComponents.filter((c) => c !== component),
    }));
  }
  const toleranceInput =
    claim.tolerance === null
      ? missing<number>('user-assumption')
      : known(
          Number(
            (claim.tolerance.kind === 'absolute' ? claim.tolerance.amount : DEFAULT_TOLERANCE_AMOUNT)
              .cents,
          ) / 100,
          'user-assumption',
        );

  const reconciliation = statedOutcome.kind === 'checked' ? statedOutcome.reconciliation : undefined;
  const comparable =
    reconciliation !== undefined &&
    reconciliation.verdict !== 'cannot-verify' &&
    reconciliation.statedAmount.kind === 'known' &&
    reconciliation.calculatedAmount.kind === 'known' &&
    reconciliation.difference.kind === 'known';
  return (
    <div>
      <header className="view-intro">
        <h2>Does the stated figure match the calculation?</h2>
        <VerdictPanel outcome={statedOutcome} />
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
            onChange={(value) => setStatedOffer(value)}
          />

          <MoneyField
            key={`stated-${fieldKey}`}
            label="Stated incremental cost"
            value={claim.statedAmount}
            onCommit={(state) =>
              updateStatedClaim((current) => ({
                // An edited figure is the user's own entry, not the cited source's.
                statedAmount: editedInput(current.statedAmount, state),
              }))
            }
          />

          <div className="field-pair">
            <DateField
              key={`start-${fieldKey}`}
              label="Period the figure covers — from"
              value={
                claim.periodStart === null
                  ? missing<string>('user-assumption')
                  : known(claim.periodStart, 'user-assumption')
              }
              // A cleared or invalid date is stored as null, not ignored, so the
              // previous date cannot keep producing a verdict.
              onCommit={(state) =>
                updateStatedClaim(() => ({ periodStart: state.kind === 'known' ? state.value : null }))
              }
            />
            <DateField
              key={`end-${fieldKey}`}
              label="Period the figure covers — to"
              value={
                claim.periodEnd === null
                  ? missing<string>('user-assumption')
                  : known(claim.periodEnd, 'user-assumption')
              }
              onCommit={(state) =>
                updateStatedClaim(() => ({ periodEnd: state.kind === 'known' ? state.value : null }))
              }
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
            key={`tolerance-${fieldKey}`}
            label="Tolerance"
            suffix="dollars"
            hint="A prototype tolerance, not an audit standard."
            value={toleranceInput}
            onCommit={(state) =>
              updateStatedClaim(() => ({
                tolerance: state.kind === 'known' ? toleranceFromNumber(state.value) : null,
              }))
            }
          />

          <div className="field">
            <label className="field__label" htmlFor="document-label">
              Supporting document label (optional)
            </label>
            <input
              id="document-label"
              type="text"
              value={claim.documentLabel ?? ''}
              onChange={(e) => updateStatedClaim(() => ({ documentLabel: e.target.value }))}
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
              onChange={(e) => updateStatedClaim(() => ({ documentText: e.target.value }))}
            />
          </div>
        </section>

        <section className="results" aria-labelledby="stated-results-heading">
          <h3 className="pane-title" id="stated-results-heading">
            Stated versus calculated
          </h3>

          {comparable &&
          reconciliation &&
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
              No comparison is drawn.{' '}
              {statedOutcome.kind === 'needs-correction'
                ? 'An entry needs correcting first, so nothing has been compared.'
                : 'The scopes cannot be compared, so bars would imply a measurement that was never made.'}{' '}
              The reason is stated above.
            </p>
          )}

          {reconciliation ? (
            <Disclosure summary="Reconciliation — inputs, formulas, assumptions and sources">
              <ReconciliationDetail reconciliation={reconciliation} />
            </Disclosure>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function VerdictPanel({ outcome }: { outcome: StatedCheckOutcome }) {
  if (outcome.kind === 'needs-correction') {
    // Nothing is compared while an entry is empty or invalid. No match, no
    // difference and no figure from a value that has since been cleared.
    return (
      <div className="verdict verdict--cannot" role="status" aria-live="polite">
        <span className="verdict__label">Cannot compare yet</span>
        <p>
          Checking against {outcome.offerLabel}. Correct the following and the comparison will
          run. Nothing has been compared, and no earlier value is being reused.
        </p>
        <ul className="stack-tight" style={{ marginTop: '0.5rem' }}>
          {outcome.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    );
  }

  const reconciliation = outcome.reconciliation;
  const modifier =
    reconciliation.verdict === 'matches'
      ? 'verdict--matches'
      : reconciliation.verdict === 'difference-requires-review'
        ? 'verdict--difference'
        : 'verdict--cannot';

  return (
    <div className={`verdict ${modifier}`} role="status" aria-live="polite">
      <span className="verdict__label">{reconciliation.verdictLabel}</span>
      <p className="state-note" style={{ marginBottom: '0.5rem' }}>
        Checked against {reconciliation.offerLabel}.
      </p>

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
        <dt>Offer checked against</dt>
        <dd>{reconciliation.offerLabel}</dd>
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
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Components claimed table">
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
