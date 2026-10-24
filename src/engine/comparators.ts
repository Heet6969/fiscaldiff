/**
 * Whether a comparison municipality's row can be set beside the subject position.
 *
 * Two rows are only directly comparable when role, grade/step AND pay basis all
 * match. An hourly wage and an annual salary for the same job title are still
 * different quantities until an explicit hours assumption converts one into the
 * other, and this table never does that silently.
 */
import type { Comparator } from '../domain/dataset';

export type PayBasis = Comparator['payBasis'];

export type ComparatorSubject = {
  readonly role: string;
  readonly gradeStep: string;
  readonly payBasis: PayBasis;
};

/**
 * The subject cohort is paid by annual base salary (that is what the employee
 * records hold), so that is the basis comparison rows are measured against.
 */
export const SUBJECT_PAY_BASIS: PayBasis = 'annual';

export type Comparability =
  | { readonly comparable: true }
  | { readonly comparable: false; readonly reasons: readonly string[] };

const PAY_BASIS_NAME: Record<PayBasis, string> = {
  annual: 'annual salary',
  hourly: 'hourly wage',
};

export function compareToSubject(row: Comparator, subject: ComparatorSubject): Comparability {
  const reasons: string[] = [];

  if (row.role !== subject.role) reasons.push(`different role (${row.role})`);
  if (row.gradeStep !== subject.gradeStep) reasons.push(`different grade or step (${row.gradeStep})`);
  if (row.payBasis !== subject.payBasis) {
    reasons.push(
      `${PAY_BASIS_NAME[row.payBasis]} compared with ${PAY_BASIS_NAME[subject.payBasis]}`,
    );
  }

  return reasons.length === 0 ? { comparable: true } : { comparable: false, reasons };
}
