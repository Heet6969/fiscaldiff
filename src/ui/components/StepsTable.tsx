/** The audit trail: inputs, formulas, results, provenance and sources. */
import { PROVENANCE_LABEL, type CalcStep } from '../../domain/types';

export function StepsTable({ steps }: { steps: readonly CalcStep[] }) {
  if (steps.length === 0) {
    return <p className="state-note">No calculation steps are available yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <caption>
          Each line shows the formula actually used and where its inputs came from.
        </caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Formula</th>
            <th scope="col" className="num">
              Result
            </th>
            <th scope="col">Basis</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            <tr key={`${step.label}-${index}`}>
              <th scope="row">{step.label}</th>
              <td>{step.formula}</td>
              <td className="num">{step.result}</td>
              <td>
                {step.provenance ? PROVENANCE_LABEL[step.provenance] : '—'}
                {step.sourceLabel ? (
                  <>
                    <br />
                    <span className="state-note">{step.sourceLabel}</span>
                  </>
                ) : null}
                {step.agreementPassage ? (
                  <blockquote className="source-passage">{step.agreementPassage}</blockquote>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AssumptionsList({
  assumptions,
  exclusions,
}: {
  assumptions: readonly string[];
  exclusions: readonly { category: string; reason: string }[];
}) {
  return (
    <>
      <h3>Assumptions applied</h3>
      <ul className="stack-tight">
        {assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>

      <h3 style={{ marginTop: '1.5rem' }}>Excluded from every figure</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Cost category</th>
              <th scope="col">Why it is excluded</th>
            </tr>
          </thead>
          <tbody>
            {exclusions.map((exclusion) => (
              <tr key={exclusion.category}>
                <th scope="row">{exclusion.category}</th>
                <td>{exclusion.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
