/**
 * Regression tests for the independent review's reproducible findings.
 * Each test exercises the behavior a person would see, not an internal detail.
 */
import Papa from 'papaparse';
import { expect, test, type Page } from '@playwright/test';

async function csvText(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export calculation breakdown (CSV)' }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks)).replace(/^\uFEFF/, '');
}

/** The report as rows of fields, so quoting and padding cannot fool an assertion. */
function rowsOf(csv: string): string[][] {
  return Papa.parse<string[]>(csv, { delimiter: ',', newline: '\r\n' }).data;
}

function field(rows: string[][], key: string): string | undefined {
  return rows.find((r) => r[0] === key)?.[1];
}

async function openStated(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Check a stated cost' }).click();
}

test.describe('one stated-cost check across screen, CSV and print', () => {
  test('the CSV and the printable summary use the claim, offer, tolerance and text on screen', async ({
    page,
  }) => {
    await openStated(page);

    await page.getByLabel('Check against').selectOption('B');
    await page.getByLabel('Tolerance (dollars)').fill('250');
    await page.getByLabel('Bonus', { exact: false }).first().uncheck().catch(() => undefined);
    await page.getByRole('checkbox', { name: /^One-time bonus/ }).uncheck();
    await page.getByLabel('Supporting document label (optional)').fill('My memo, v2');
    await page.getByLabel('Relevant passage (optional)').fill('Typed by the user, with a comma.');

    // The screen.
    const verdict = page.getByRole('status');
    await expect(verdict).toContainText('Checked against Offer B — alternative');

    // The CSV.
    const rows = rowsOf(await csvText(page));
    expect(field(rows, 'Offer compared against')).toBe('Offer B — alternative');
    expect(field(rows, 'Components claimed')).toBe('Base-pay increase');
    expect(field(rows, 'Tolerance applied')).toBe('$250.00 absolute difference');
    expect(field(rows, 'Source document')).toBe('My memo, v2');
    expect(field(rows, 'Supporting passage')).toBe('Typed by the user, with a comma.');
    // The breakdown above it is for Offer A and says so.
    expect(field(rows, 'Offer (calculation breakdown)')).toBe('Offer A — union request');

    // The printable summary.
    await page.getByRole('button', { name: 'Open printable summary' }).click();
    const summary = page.locator('#print-report');
    await expect(summary).toContainText('Offer compared against');
    await expect(summary).toContainText('Offer B — alternative');
    await expect(summary).toContainText('$250.00 absolute difference');
    await expect(summary).toContainText('Base-pay increase');
    await expect(summary).toContainText('My memo, v2');
    await expect(summary).toContainText('Typed by the user, with a comma.');
    await expect(summary.getByText('One-time bonus')).toHaveCount(0);
  });

  test('all three agree on the verdict for the same inputs', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Load a fictional example').selectOption('CLAIM-2');
    await expect(page.getByRole('status')).toContainText('Matches within the stated tolerance');

    expect(field(rowsOf(await csvText(page)), 'Verdict')).toBe('Matches within the stated tolerance');

    await page.getByRole('button', { name: 'Open printable summary' }).click();
    await expect(page.locator('#print-report')).toContainText('Matches within the stated tolerance');
  });

  test('keeps every entry, including an invalid one, through print preview and back', async ({
    page,
  }) => {
    await openStated(page);
    await page.getByLabel('Check against').selectOption('B');
    await page.getByLabel('Supporting document label (optional)').fill('Kept label');
    await page.getByLabel('Tolerance (dollars)').fill('abc');
    await expect(page.getByLabel('Tolerance (dollars)')).toHaveAttribute('aria-invalid', 'true');

    await page.getByRole('button', { name: 'Open printable summary' }).click();
    // Mid-correction, the summary says nothing was compared.
    const summary = page.locator('#print-report');
    await expect(summary).toContainText('Cannot compare yet');
    await expect(summary).toContainText('Offer B — alternative');
    await page.getByRole('button', { name: 'Back to the application' }).click();

    await expect(page.getByRole('tab', { name: 'Check a stated cost' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Check against')).toHaveValue('B');
    await expect(page.getByLabel('Supporting document label (optional)')).toHaveValue('Kept label');
    // The invalid text itself survived, not just the last good value.
    await expect(page.getByLabel('Tolerance (dollars)')).toHaveValue('abc');
    await expect(page.getByLabel('Tolerance (dollars)')).toHaveAttribute('aria-invalid', 'true');
  });

  test('keeps proposal entries through print preview too', async ({ page }) => {
    await page.goto('/');
    const offerA = page.getByRole('group', { name: /Offer A/ });
    await offerA.getByLabel('Base-pay raise (percent)').fill('4.5');
    await offerA.getByLabel('One-time bonus per eligible employee').fill('oops');

    await page.getByRole('button', { name: 'Open printable summary' }).click();
    await page.getByRole('button', { name: 'Back to the application' }).click();

    await expect(offerA.getByLabel('Base-pay raise (percent)')).toHaveValue('4.5');
    await expect(offerA.getByLabel('One-time bonus per eligible employee')).toHaveValue('oops');
  });
});

test.describe('no verdict from a cleared or invalid entry', () => {
  async function expectNoComparison(page: Page) {
    const status = page.getByRole('status');
    await expect(status).toContainText('Cannot compare yet');
    await expect(status).toContainText('Nothing has been compared');
    await expect(status).not.toContainText('Matches within');
    await expect(status).not.toContainText('Difference requiring review');
    await expect(status).not.toContainText('$70,000.00');
    await expect(page.getByRole('img', { name: /Bar chart comparing the stated amount/ })).toHaveCount(0);
    await expect(page.locator('#panel-stated summary', { hasText: 'Reconciliation' })).toHaveCount(0);
  }

  test('clearing the “from” date stops the comparison and says what to fix', async ({ page }) => {
    await openStated(page);
    await expect(page.getByRole('status')).toContainText('Difference requiring review');

    await page.getByLabel('Period the figure covers — from').fill('');
    await expectNoComparison(page);
    await expect(page.getByRole('status')).toContainText('The "from" date is empty or not a valid date');

    await page.getByLabel('Period the figure covers — from').fill('2026-07-01');
    await expect(page.getByRole('status')).toContainText('Difference requiring review');
  });

  test('clearing the “to” date stops the comparison', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Period the figure covers — to').fill('');
    await expectNoComparison(page);
    await expect(page.getByRole('status')).toContainText('The "to" date is empty or not a valid date');
  });

  test('an empty tolerance stops the comparison', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Tolerance (dollars)').fill('');
    await expectNoComparison(page);
    await expect(page.getByRole('status')).toContainText('The tolerance is empty or not a valid amount');
  });

  test('an invalid tolerance stops the comparison and does not keep the old one', async ({ page }) => {
    await openStated(page);
    // The old tolerance was $1.00. A verdict at $1.00 would be exactly the stale answer.
    await page.getByLabel('Tolerance (dollars)').fill('1.00x');
    await expectNoComparison(page);
    await expect(page.getByLabel('Tolerance (dollars)')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Tolerance (dollars)').fill('30000');
    await expect(page.getByRole('status')).toContainText('Matches within the stated tolerance');
  });

  test('reports every problem together', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Period the figure covers — from').fill('');
    await page.getByLabel('Period the figure covers — to').fill('');
    await page.getByLabel('Tolerance (dollars)').fill('');
    const items = page.getByRole('status').getByRole('listitem');
    await expect(items).toHaveCount(3);
  });

  test('the CSV and the summary also refuse to report a verdict meanwhile', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Period the figure covers — from').fill('');

    const rows = rowsOf(await csvText(page));
    expect(field(rows, 'Status')).toContain('Cannot compare yet');
    expect(field(rows, 'Needs correction')).toContain('The "from" date is empty or not a valid date');
    expect(field(rows, 'Offer compared against')).toBe('Offer A — union request');
    expect(field(rows, 'Verdict')).toBeUndefined();
    expect(field(rows, 'Stated amount (USD)')).toBeUndefined();

    await page.getByRole('button', { name: 'Open printable summary' }).click();
    const summary = page.locator('#print-report');
    await expect(summary).toContainText('Cannot compare yet');
    await expect(summary).not.toContainText('Difference requiring review');
  });
});

test.describe('overtime thresholds say when an entry is not applied', () => {
  async function openThresholds(page: Page) {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();
    await page.locator('#panel-overtime summary', { hasText: 'Review thresholds' }).click();
  }

  test('an invalid hours threshold is flagged, visibly, with the value still in force', async ({ page }) => {
    await openThresholds(page);
    const before = await page.locator('#panel-overtime .flag').count();

    await page.getByLabel(/Flag an hours increase of at least/).fill('abc');
    const note = page.getByRole('note', { name: 'Threshold entry not applied' });
    await expect(note).toBeVisible();
    await expect(note).toContainText('not applied');
    await expect(note).toContainText('last valid value, 25%');
    // Flags were not silently recomputed from the broken entry.
    await expect(page.locator('#panel-overtime .flag')).toHaveCount(before);

    // Collapsed or not, the note stays visible.
    await page.locator('#panel-overtime summary', { hasText: 'Review thresholds' }).click();
    await expect(note).toBeVisible();
    await expect(page.locator('#panel-overtime summary', { hasText: 'Review thresholds' })).toContainText(
      'an entry is not applied',
    );
  });

  test('an empty threshold is reported the same way', async ({ page }) => {
    await openThresholds(page);
    await page.getByLabel(/Flag an effective hourly cost change of at least/).fill('');
    const note = page.getByRole('note', { name: 'Threshold entry not applied' });
    await expect(note).toContainText('hourly-cost threshold');
    await expect(note).toContainText('last valid value, 15%');
  });

  test('a valid entry applies and clears the note', async ({ page }) => {
    await openThresholds(page);
    await page.getByLabel(/Flag an hours increase of at least/).fill('abc');
    await expect(page.getByRole('note', { name: 'Threshold entry not applied' })).toBeVisible();

    await page.getByLabel(/Flag an hours increase of at least/).fill('500');
    await expect(page.getByRole('note', { name: 'Threshold entry not applied' })).toHaveCount(0);
    await expect(page.locator('#panel-overtime .flag').filter({ hasText: 'Overtime hours up' })).toHaveCount(0);
  });
});

test.describe('an edited proposal value is the user’s assumption', () => {
  test('the old agreement passage is shown only as a replaced original', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('group', { name: /Offer A/ }).getByLabel('Base-pay raise (percent)').fill('4');
    await page.locator('summary', { hasText: 'Assumptions and calculation steps — Offer A' }).click();

    const row = page.locator('#panel-compare tr', { hasText: 'Annualized base-pay increase' }).first();
    const basis = row.locator('td').last();
    await expect(basis).toContainText('User assumption');
    await expect(basis).toContainText('Entered on screen');

    // The passage is no longer attached to the current value...
    await expect(basis.locator(':scope > blockquote')).toHaveCount(0);
    // ...it is kept, labelled as what the edit replaced.
    const original = basis.locator('.original-source');
    await expect(original).toContainText('Replaced original — not support for this value');
    await expect(original).toContainText('Source-supported');
    await expect(original.locator('blockquote')).toContainText('three percent (3%)');
  });

  test('an unedited value keeps its passage as support', async ({ page }) => {
    await page.goto('/');
    await page.locator('summary', { hasText: 'Assumptions and calculation steps — Offer A' }).click();
    const basis = page
      .locator('#panel-compare tr', { hasText: 'Annualized base-pay increase' })
      .first()
      .locator('td')
      .last();
    await expect(basis).toContainText('Source-supported');
    await expect(basis.locator(':scope > blockquote')).toContainText('three percent (3%)');
    await expect(basis.locator('.original-source')).toHaveCount(0);
  });

  test('editing the bonus does the same for the bonus', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('group', { name: /Offer A/ })
      .getByLabel('One-time bonus per eligible employee')
      .fill('600');
    await page.locator('summary', { hasText: 'Assumptions and calculation steps — Offer A' }).click();
    const basis = page
      .locator('#panel-compare tr', { hasText: 'One-time bonus' })
      .filter({ hasText: 'explicitly bonus-eligible' })
      .first()
      .locator('td')
      .last();
    await expect(basis).toContainText('User assumption');
    await expect(basis.locator(':scope > blockquote')).toHaveCount(0);
    await expect(basis.locator('.original-source blockquote')).toContainText('ratification payment');
  });

  test('editing the stated amount reclassifies it in the reconciliation', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Stated incremental cost').fill('50000');
    await page.locator('#panel-stated summary', { hasText: 'Reconciliation' }).click();
    const basis = page.locator('#panel-stated tr', { hasText: 'Stated amount' }).first().locator('td').last();
    await expect(basis).toContainText('User assumption');
    await expect(basis.locator('.original-source')).toContainText('Replaced original');
  });

  test('the CSV puts the superseded source in its own column', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('group', { name: /Offer A/ }).getByLabel('Base-pay raise (percent)').fill('4');
    const rows = rowsOf(await csvText(page));
    const header = rows.find((r) => r[0] === 'Calculation step') ?? [];
    expect(header[5]).toBe('Replaced original source (not support for the edited value)');
    const step = rows.find((r) => r[0] === 'Annualized base-pay increase') ?? [];
    expect(step[3]).toBe('user-assumption');
    expect(step[4]).not.toContain('Article 12');
    expect(step[5]).toContain('Article 12.1 (fictional)');
  });
});

test.describe('comparison rows must share the pay basis', () => {
  const HEADER =
    'municipality,role,grade_step,effective_date,scheduled_hours_per_week,pay_basis,stated_pay,provenance';

  test('an hourly row with the same role and grade is not directly comparable', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Which table').selectOption('comparators');
    await page.getByLabel('Import a CSV file').setInputFiles({
      name: 'comparators.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        [
          HEADER,
          'Hourlyville,Equipment Operator,PW-4 / Step 3,2026-07-01,40,hourly,29.50,synthetic-sample',
          'Salaryton,Equipment Operator,PW-4 / Step 3,2026-07-01,40,annual,61000.00,synthetic-sample',
        ].join('\r\n'),
      ),
    });
    await expect(page.getByRole('status').filter({ hasText: 'imported' })).toBeVisible();

    await page.locator('summary', { hasText: 'Comparison context' }).click();

    const hourly = page.locator('#panel-compare tr', { hasText: 'Hourlyville' });
    await expect(hourly).toContainText('Not directly comparable');
    await expect(hourly).toContainText('hourly wage compared with annual salary');

    const annual = page.locator('#panel-compare tr', { hasText: 'Salaryton' });
    await expect(annual).toContainText('Same role, grade and pay basis');
    await expect(annual).not.toContainText('Not directly comparable');
  });

  test('the demonstration’s hourly row is marked too', async ({ page }) => {
    await page.goto('/');
    await page.locator('summary', { hasText: 'Comparison context' }).click();
    const carrow = page.locator('#panel-compare tr', { hasText: 'Carrow' });
    await expect(carrow).toContainText('Not directly comparable');
    await expect(carrow).toContainText('hourly wage compared with annual salary');
  });
});

test.describe('scrollable regions are keyboard accessible', () => {
  test('every table wrapper is a named, focusable region', async ({ page }) => {
    await page.goto('/');
    for (const view of ['Compare proposals', 'Review overtime', 'Check a stated cost'] as const) {
      await page.getByRole('tab', { name: view }).click();
      await page.evaluate(() => {
        document
          .querySelectorAll('[role="tabpanel"]:not([hidden]) details')
          .forEach((d) => ((d as HTMLDetailsElement).open = true));
      });
      const problems = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="tabpanel"]:not([hidden]) .table-wrap'))
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .filter((el) => {
            const label = el.getAttribute('aria-label') ?? '';
            return el.getAttribute('tabindex') !== '0' || el.getAttribute('role') !== 'region' || label.trim() === '';
          })
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(problems, view).toEqual([]);
    }
  });

  test('the region can receive keyboard focus and shows it', async ({ page }) => {
    await page.goto('/');
    const region = page.getByRole('region', { name: 'Offer comparison results table' });
    await region.focus();
    await expect(region).toBeFocused();
    await expect(region).toHaveCSS('outline-style', 'solid');
  });

  test('the expanded Compare proposals sections pass axe, including scrollable-region-focusable', async ({
    page,
  }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/');
    await page.evaluate(() => {
      document
        .querySelectorAll('[role="tabpanel"]:not([hidden]) details')
        .forEach((d) => ((d as HTMLDetailsElement).open = true));
    });
    const results = await new AxeBuilder({ page }).withRules(['scrollable-region-focusable']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
