/**
 * Comparison context.
 *
 * One table, no engine of its own, no scoring and no ranking. Rows that do not
 * share the subject role, grade and pay basis are marked and are never averaged
 * into anything.
 */
import type { Comparator } from '../../domain/dataset';
import { formatIsoDateLong } from '../../engine/dates';
import { compareToSubject, type PayBasis } from '../../engine/comparators';
import { Amount } from './Common';

export function ComparatorTable({
  comparators,
  subjectRole,
  subjectGradeStep,
  subjectPayBasis,
}: {
  comparators: readonly Comparator[];
  subjectRole: string;
  subjectGradeStep: string;
  subjectPayBasis: PayBasis;
}) {
  if (comparators.length === 0) {
    return <p className="state-note">No comparison rows are loaded.</p>;
  }

  return (
    <>
      <p className="notice">
        Context for negotiation only. This table does not establish fair pay, a market
        rate, or a justified wage. Positions with a different role, grade or pay basis
        are not equivalent and are marked below.
      </p>

      <div className="table-wrap" tabIndex={0} role="region" aria-label="Comparison municipalities table">
        <table>
          <caption>
            Fictional municipalities. Compared against {subjectRole}, {subjectGradeStep}, paid by{' '}
            {subjectPayBasis === 'annual' ? 'annual salary' : 'hourly wage'}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Municipality</th>
              <th scope="col">Role</th>
              <th scope="col">Grade / step</th>
              <th scope="col">Effective date</th>
              <th scope="col" className="num">
                Scheduled hours
              </th>
              <th scope="col">Pay basis</th>
              <th scope="col" className="num">
                Stated pay
              </th>
              <th scope="col">Comparability</th>
            </tr>
          </thead>
          <tbody>
            {comparators.map((c) => {
              const verdict = compareToSubject(c, {
                role: subjectRole,
                gradeStep: subjectGradeStep,
                payBasis: subjectPayBasis,
              });
              const effective =
                c.effectiveDate.state.kind === 'known'
                  ? formatIsoDateLong(c.effectiveDate.state.value)
                  : 'Not stated';
              return (
                <tr key={c.id}>
                  <th scope="row">{c.municipality}</th>
                  <td>{c.role}</td>
                  <td>{c.gradeStep}</td>
                  <td>{effective}</td>
                  <td className="num">
                    {c.scheduledHoursPerWeek.state.kind === 'known'
                      ? c.scheduledHoursPerWeek.state.value
                      : 'Not stated'}
                  </td>
                  <td>{c.payBasis === 'annual' ? 'Annual salary' : 'Hourly wage'}</td>
                  <td className="num">
                    <Amount state={c.statedPay.state} />
                  </td>
                  <td>
                    {verdict.comparable ? (
                      'Same role, grade and pay basis'
                    ) : (
                      <>
                        <span className="state-note">Not directly comparable</span>
                        <br />
                        <span className="state-note">{verdict.reasons.join('; ')}</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="section__hint">
        No average is shown. Averaging an hourly wage against an annual salary, or one
        grade against another, would produce a number that looks authoritative and means
        nothing. Normalising across pay bases would require an explicit hours assumption
        for each row, which these fictional rows do not all carry.
      </p>
    </>
  );
}
