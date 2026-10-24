/**
 * Regression tests for the independent review's findings: provenance after an
 * edit, comparison pay basis, and the single shared stated-cost check.
 */
import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../../src/data/generate/demoDataset';
import {
  blankDraft,
  checkStatedCost,
  compareToSubject,
  computeEngineView,
  computeOffer,
  DEFAULT_REVIEW_THRESHOLDS,
  initialStatedInputs,
  resolveStatedCheck,
  SUBJECT_PAY_BASIS,
  type StatedCheckInputs,
} from '../../src/engine';
import { calculationBreakdownCsv } from '../../src/export/breakdown';
import { editedInput, known, missing, type Input } from '../../src/domain/types';
import type { Comparator, Dataset } from '../../src/domain/dataset';
import { fromDollars } from '../../src/money/money';
import Papa from 'papaparse';
import { stripBom } from '../../src/data/csv/format';

const PASSAGE = 'Article 12.1 (fictional): effective January 1, 2027, base salary rises by three percent.';

function sourced(): Input<number> {
  return known(3, 'source-supported', { sourceLabel: 'Fictional proposal, Article 12', agreementPassage: PASSAGE });
}

describe('provenance after an edit', () => {
  it('marks an edited, previously sourced value as the user’s own assumption', () => {
    const edited = editedInput(sourced(), { kind: 'known', value: 4 });
    expect(edited.provenance).toBe('user-assumption');
    expect(edited.state).toEqual({ kind: 'known', value: 4 });
  });

  it('no longer presents the old passage or source label as support', () => {
    const edited = editedInput(sourced(), { kind: 'known', value: 4 });
    expect(edited.agreementPassage).toBeUndefined();
    expect(edited.sourceLabel).toBe('Entered on screen');
    expect(edited.sourceLabel).not.toContain('Article 12');
  });

  it('keeps the original context, separately labelled, rather than discarding it', () => {
    const edited = editedInput(sourced(), { kind: 'known', value: 4 });
    expect(edited.originalSource).toEqual({
      provenance: 'source-supported',
      sourceLabel: 'Fictional proposal, Article 12',
      agreementPassage: PASSAGE,
    });
  });

  it('also reclassifies synthetic sample values when they are edited', () => {
    const edited = editedInput(known(500, 'synthetic-sample'), { kind: 'known', value: 600 });
    expect(edited.provenance).toBe('user-assumption');
  });

  it('keeps an existing assumption an assumption, and keeps any earlier original context', () => {
    const once = editedInput(sourced(), { kind: 'known', value: 4 });
    const twice = editedInput(once, { kind: 'known', value: 5 });
    expect(twice.provenance).toBe('user-assumption');
    expect(twice.originalSource?.agreementPassage).toBe(PASSAGE);
    expect(twice.state).toEqual({ kind: 'known', value: 5 });
  });

  it('a cleared field is still a user assumption, with the value missing', () => {
    const edited = editedInput(sourced(), { kind: 'missing' });
    expect(edited.provenance).toBe('user-assumption');
    expect(edited.state.kind).toBe('missing');
  });

  it('carries into the calculation steps without being shown as support', () => {
    const dataset = buildDemoDataset();
    const edited: Dataset = {
      ...dataset,
      offers: {
        ...dataset.offers,
        A: {
          ...dataset.offers.A,
          basePayRaisePercent: editedInput(dataset.offers.A.basePayRaisePercent, {
            kind: 'known',
            value: 4,
          }),
        },
      },
    };
    const step = computeOffer(edited, 'A').steps.find((s) => s.label === 'Annualized base-pay increase');
    expect(step).toBeDefined();
    expect(step?.provenance).toBe('user-assumption');
    expect(step?.agreementPassage).toBeUndefined();
    expect(step?.originalSource?.agreementPassage).toContain('three percent (3%)');
    expect(step?.originalSource?.provenance).toBe('source-supported');
  });

  it('leaves an unedited sourced value as source-supported with its passage', () => {
    const step = computeOffer(buildDemoDataset(), 'A').steps.find(
      (s) => s.label === 'Annualized base-pay increase',
    );
    expect(step?.provenance).toBe('source-supported');
    expect(step?.agreementPassage).toContain('three percent (3%)');
    expect(step?.originalSource).toBeUndefined();
  });

  it('puts the superseded source in its own column of the CSV report', () => {
    const dataset = buildDemoDataset();
    const edited: Dataset = {
      ...dataset,
      offers: {
        ...dataset.offers,
        A: {
          ...dataset.offers.A,
          basePayRaisePercent: editedInput(dataset.offers.A.basePayRaisePercent, {
            kind: 'known',
            value: 4,
          }),
        },
      },
    };
    const view = computeEngineView(edited, DEFAULT_REVIEW_THRESHOLDS);
    const csv = calculationBreakdownCsv({
      dataset: edited,
      offerId: 'A',
      offer: view.offers.A,
      budget: view.budgets.A,
      overtimeRows: [],
      flags: [],
      statedCheck: undefined,
      generatedOn: '2026-10-24',
    });
    const rows = Papa.parse<string[]>(stripBom(csv), { delimiter: ',', newline: '\r\n' }).data;
    const header = rows.find((r) => r[0] === 'Calculation step') ?? [];
    expect(header[5]).toContain('Replaced original source');

    const step = rows.find((r) => r[0] === 'Annualized base-pay increase') ?? [];
    expect(step[3]).toBe('user-assumption');
    // The current Source column no longer carries the agreement label...
    expect(step[4]).not.toContain('Article 12');
    // ...the superseded one is kept apart.
    expect(step[5]).toContain('Article 12');
    expect(step[5]).toContain('source-supported');
  });
});

function comparator(overrides: Partial<Comparator>): Comparator {
  return {
    id: 'X',
    municipality: 'Testville (fictional)',
    role: 'Equipment Operator',
    gradeStep: 'PW-4 / Step 3',
    effectiveDate: known('2026-07-01', 'synthetic-sample'),
    scheduledHoursPerWeek: known(40, 'synthetic-sample'),
    payBasis: 'annual',
    statedPay: known(fromDollars('61200'), 'synthetic-sample'),
    ...overrides,
  };
}

describe('comparison rows must share the subject’s pay basis', () => {
  const subject = { role: 'Equipment Operator', gradeStep: 'PW-4 / Step 3', payBasis: SUBJECT_PAY_BASIS };

  it('treats the cohort as paid by annual salary', () => {
    expect(SUBJECT_PAY_BASIS).toBe('annual');
  });

  it('accepts a row that matches on role, grade and pay basis', () => {
    expect(compareToSubject(comparator({}), subject)).toEqual({ comparable: true });
  });

  it('rejects an hourly row with the same role and grade as an annual-salary subject', () => {
    const result = compareToSubject(comparator({ payBasis: 'hourly' }), subject);
    expect(result.comparable).toBe(false);
    if (result.comparable) return;
    expect(result.reasons.join(' ')).toContain('hourly wage compared with annual salary');
    // Only the pay basis differs, so it is the only reason given.
    expect(result.reasons).toHaveLength(1);
  });

  it('still rejects a different role or grade, and reports every reason', () => {
    const result = compareToSubject(
      comparator({ role: 'Senior Equipment Operator', gradeStep: 'PW-6 / Step 1', payBasis: 'hourly' }),
      subject,
    );
    expect(result.comparable).toBe(false);
    if (result.comparable) return;
    expect(result.reasons).toHaveLength(3);
  });

  it('marks the demonstration’s hourly row (same role and grade) as not comparable', () => {
    const rows = buildDemoDataset().comparators;
    const carrow = rows.find((r) => r.municipality.startsWith('Carrow'));
    expect(carrow?.payBasis).toBe('hourly');
    expect(carrow && compareToSubject(carrow, subject).comparable).toBe(false);
    const ashford = rows.find((r) => r.municipality.startsWith('Ashford'));
    expect(ashford && compareToSubject(ashford, subject).comparable).toBe(true);
  });
});

describe('the shared stated-cost check', () => {
  const dataset = buildDemoDataset();
  const base: StatedCheckInputs = initialStatedInputs(dataset);

  it('starts from the first fictional claim against Offer A', () => {
    expect(base.offerId).toBe('A');
    expect(base.claim.id).toBe('CLAIM-1');
    const outcome = resolveStatedCheck(dataset, base);
    expect(outcome.kind).toBe('checked');
    if (outcome.kind !== 'checked') return;
    expect(outcome.reconciliation.verdict).toBe('difference-requires-review');
    expect(outcome.offerLabel).toBe(dataset.offers.A.label);
  });

  it('follows the selected offer, and says which one', () => {
    const outcome = resolveStatedCheck(dataset, { ...base, offerId: 'B' });
    expect(outcome.kind).toBe('checked');
    if (outcome.kind !== 'checked') return;
    expect(outcome.offerId).toBe('B');
    expect(outcome.reconciliation.offerLabel).toBe(dataset.offers.B.label);
    // Same claim, different offer, different calculated figure.
    const a = resolveStatedCheck(dataset, base);
    if (a.kind !== 'checked') throw new Error('expected a check');
    expect(outcome.reconciliation.calculatedAmount).not.toEqual(a.reconciliation.calculatedAmount);
  });

  it('matches a direct engine call, so the screen and the exports cannot disagree', () => {
    const claim = dataset.statedCosts[0];
    if (!claim) throw new Error('no claim');
    const direct = checkStatedCost(dataset, claim, 'A');
    const outcome = resolveStatedCheck(dataset, base);
    if (outcome.kind !== 'checked') throw new Error('expected a check');
    expect(outcome.reconciliation.verdict).toBe(direct.verdict);
    expect(outcome.reconciliation.difference).toEqual(direct.difference);
    expect(outcome.reconciliation.calculatedAmount).toEqual(direct.calculatedAmount);
  });

  describe('an entry that is empty or invalid is never silently replaced', () => {
    it('refuses to compare when the “from” date is cleared', () => {
      const outcome = resolveStatedCheck(dataset, { ...base, claim: { ...base.claim, periodStart: null } });
      expect(outcome.kind).toBe('needs-correction');
      if (outcome.kind !== 'needs-correction') return;
      expect(outcome.problems.join(' ')).toContain('"from" date');
      expect(outcome.problems).toHaveLength(1);
    });

    it('refuses to compare when the “to” date is cleared', () => {
      const outcome = resolveStatedCheck(dataset, { ...base, claim: { ...base.claim, periodEnd: null } });
      expect(outcome.kind).toBe('needs-correction');
      if (outcome.kind !== 'needs-correction') return;
      expect(outcome.problems.join(' ')).toContain('"to" date');
    });

    it('refuses to compare when the tolerance is empty or invalid', () => {
      const outcome = resolveStatedCheck(dataset, { ...base, claim: { ...base.claim, tolerance: null } });
      expect(outcome.kind).toBe('needs-correction');
      if (outcome.kind !== 'needs-correction') return;
      expect(outcome.problems.join(' ')).toContain('tolerance');
    });

    it('lists every problem at once', () => {
      const outcome = resolveStatedCheck(dataset, {
        ...base,
        claim: { ...base.claim, periodStart: null, periodEnd: null, tolerance: null },
      });
      if (outcome.kind !== 'needs-correction') throw new Error('expected needs-correction');
      expect(outcome.problems).toHaveLength(3);
    });

    it('produces no verdict, no figures and no difference while an entry needs correcting', () => {
      const outcome = resolveStatedCheck(dataset, { ...base, claim: { ...base.claim, periodStart: null } });
      expect('reconciliation' in outcome).toBe(false);
    });

    it('names the offer even when nothing could be compared', () => {
      const outcome = resolveStatedCheck(dataset, {
        offerId: 'B',
        claim: { ...base.claim, tolerance: null },
      });
      expect(outcome.offerId).toBe('B');
      expect(outcome.offerLabel).toBe(dataset.offers.B.label);
    });

    it('accepts a tolerance of zero as a real value', () => {
      const outcome = resolveStatedCheck(dataset, {
        ...base,
        claim: { ...base.claim, tolerance: { kind: 'absolute', amount: fromDollars('0') } },
      });
      expect(outcome.kind).toBe('checked');
    });

    it('recovers as soon as the entry is corrected', () => {
      const broken = { ...base, claim: { ...base.claim, periodStart: null } };
      expect(resolveStatedCheck(dataset, broken).kind).toBe('needs-correction');
      const fixed = { ...broken, claim: { ...broken.claim, periodStart: dataset.fiscalYear.start } };
      expect(resolveStatedCheck(dataset, fixed).kind).toBe('checked');
    });
  });

  describe('the CSV report describes the same claim as the screen', () => {
    function report(inputs: StatedCheckInputs): string[][] {
      const view = computeEngineView(dataset, DEFAULT_REVIEW_THRESHOLDS);
      const csv = calculationBreakdownCsv({
        dataset,
        offerId: 'A',
        offer: view.offers.A,
        budget: view.budgets.A,
        overtimeRows: [],
        flags: [],
        statedCheck: resolveStatedCheck(dataset, inputs),
        generatedOn: '2026-10-24',
      });
      return Papa.parse<string[]>(stripBom(csv), { delimiter: ',', newline: '\r\n' }).data;
    }
    const cell = (rows: string[][], key: string) => rows.find((r) => r[0] === key)?.[1];

    it('carries the selected offer, components, period, tolerance and supporting text', () => {
      const edited: StatedCheckInputs = {
        offerId: 'B',
        claim: {
          ...base.claim,
          claimedComponents: ['base-pay-increment'],
          periodStart: '2026-07-01',
          periodEnd: '2027-06-30',
          tolerance: { kind: 'absolute', amount: fromDollars('250.00') },
          documentLabel: 'My memo, v2',
          documentText: 'Typed by the user, "quoted", with a comma.',
        },
      };
      const rows = report(edited);
      const outcome = resolveStatedCheck(dataset, edited);
      if (outcome.kind !== 'checked') throw new Error('expected a check');

      expect(cell(rows, 'Offer compared against')).toBe(dataset.offers.B.label);
      expect(cell(rows, 'Components claimed')).toBe('Base-pay increase');
      expect(cell(rows, 'Period claimed')).toBe(outcome.reconciliation.periodDescription);
      expect(cell(rows, 'Tolerance applied')).toBe('$250.00 absolute difference');
      expect(cell(rows, 'Source document')).toBe('My memo, v2');
      expect(cell(rows, 'Supporting passage')).toBe('Typed by the user, "quoted", with a comma.');
      expect(cell(rows, 'Verdict')).toBe(outcome.reconciliation.verdictLabel);
    });

    it('still labels the breakdown’s own offer separately from the one compared against', () => {
      const rows = report({ ...base, offerId: 'B' });
      expect(cell(rows, 'Offer (calculation breakdown)')).toBe(dataset.offers.A.label);
      expect(cell(rows, 'Offer compared against')).toBe(dataset.offers.B.label);
    });

    it('says plainly that nothing was compared when an entry needs correcting', () => {
      const rows = report({ ...base, claim: { ...base.claim, periodEnd: null, tolerance: null } });
      expect(cell(rows, 'Offer compared against')).toBe(dataset.offers.A.label);
      expect(cell(rows, 'Status')).toContain('Cannot compare yet');
      expect(rows.filter((r) => r[0] === 'Needs correction')).toHaveLength(2);
      // No verdict, and no amounts, are written.
      expect(cell(rows, 'Verdict')).toBeUndefined();
      expect(cell(rows, 'Stated amount (USD)')).toBeUndefined();
      expect(cell(rows, 'Difference, stated minus calculated (USD)')).toBeUndefined();
    });
  });

  it('has a blank draft that is itself a valid, checkable claim shape', () => {
    const draft = blankDraft(dataset.fiscalYear);
    expect(draft.periodStart).toBe(dataset.fiscalYear.start);
    expect(draft.tolerance).not.toBeNull();
    expect(draft.statedAmount.state.kind).toBe('known');
    // An unrelated cleared field stays distinguishable from a stated zero.
    expect(missing('user-assumption').state.kind).toBe('missing');
  });
});
