/**
 * The complete journey:
 * open demo -> edit proposal -> inspect result -> review an overtime flag ->
 * check the stated cost -> export a report.
 *
 * Expected amounts come from tests/unit/demoDataset.test.ts, which works them
 * through by hand from the fictional records.
 */
import { expect, test } from '@playwright/test';

/** Results table on the Compare proposals view. */
function resultsTable(page: import('@playwright/test').Page) {
  return page.getByRole('table').filter({ hasText: 'Increase over baseline, this fiscal year' });
}

function disclosure(page: import('@playwright/test').Page, text: string) {
  return page.locator('summary', { hasText: text });
}

test.describe('core journey', () => {
  test('opens with labeled fictional data and a baseline summed from records', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /CivicVariance/, level: 1 })).toBeVisible();
    await expect(page.getByTestId('synthetic-badge')).toHaveText(/Synthetic demo data/);
    await expect(page.getByText(/Township of Meadowbrook/).first()).toBeVisible();

    // 50 fictional employees at $60,000 each.
    await expect(page.getByText('$3,000,000.00').first()).toBeVisible();
    // Baseline overtime is shown rather than hidden inside a total.
    await expect(page.getByText('$218,080.80').first()).toBeVisible();
    await expect(page.getByText('$3,218,080.80').first()).toBeVisible();
  });

  test('shows the headline figures as separately labeled rows', async ({ page }) => {
    await page.goto('/');
    const results = resultsTable(page);

    await expect(
      results.getByRole('row', { name: /Increase over baseline, this fiscal year/ }),
    ).toContainText('$73,276.00');
    await expect(results.getByRole('row', { name: /Annualized recurring increase/ })).toContainText(
      '$96,552.00',
    );
    await expect(results.getByRole('row', { name: /One-time cost, not recurring/ })).toContainText(
      '$25,000.00',
    );
    await expect(results.getByRole('row', { name: /Total proposed expenditure/ })).toContainText(
      '$3,291,356.80',
    );

    // Offer A leaves budget; Offer B runs short. Both are on the same row,
    // each with its own word rather than relying on the sign alone.
    const budget = results.getByRole('row', { name: /Workforce budget remaining or shortfall/ });
    await expect(budget).toContainText('+$1,643.20');
    await expect(budget).toContainText('Remaining');
    await expect(budget).toContainText('-$2,116.80');
    await expect(budget).toContainText('Workforce budget shortfall');
  });

  test('keeps total expenditure, increase, and budget position distinct', async ({ page }) => {
    await page.goto('/');
    const results = resultsTable(page);

    const increase = await results
      .getByRole('row', { name: /Increase over baseline, this fiscal year/ })
      .locator('td')
      .first()
      .innerText();
    const total = await results
      .getByRole('row', { name: /Total proposed expenditure/ })
      .locator('td')
      .first()
      .innerText();

    expect(increase).not.toBe(total);
    expect(increase).toContain('73,276');
    expect(total).toContain('3,291,356');
  });

  test('editing an offer changes its figures and leaves the other alone', async ({ page }) => {
    await page.goto('/');
    const results = resultsTable(page);
    const increaseRow = results.getByRole('row', { name: /Increase over baseline, this fiscal year/ });

    const bBefore = await increaseRow.locator('td').nth(1).innerText();

    const offerA = page.getByRole('group', { name: /Offer A/ });
    await offerA.getByLabel('Base-pay raise (percent)').fill('6');

    // Doubling the raise doubles the base-pay and overtime-rate components.
    await expect(increaseRow).toContainText('$121,552.00');
    await expect(results.getByRole('row', { name: /Annualized recurring increase/ })).toContainText(
      '$193,104.00',
    );

    // Offer B is untouched.
    expect(await increaseRow.locator('td').nth(1).innerText()).toBe(bBefore);
    await expect(
      page.getByRole('group', { name: /Offer B/ }).getByLabel('Base-pay raise (percent)'),
    ).toHaveValue('2.5');
  });

  test('a shortfall is named a workforce budget shortfall, never a deficit', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Adopted workforce budget for this fiscal year').fill('3000000');

    const budget = resultsTable(page).getByRole('row', {
      name: /Workforce budget remaining or shortfall/,
    });
    await expect(budget).toContainText('-$291,356.80');
    await expect(budget).toContainText('Workforce budget shortfall');
    await expect(page.getByText(/fiscal deficit/i)).toHaveCount(0);
  });

  test('omitting the budget removes the figure instead of assuming one', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Adopted workforce budget for this fiscal year').fill('');

    const budget = resultsTable(page).getByRole('row', {
      name: /Workforce budget remaining or shortfall/,
    });
    await expect(budget).toContainText('No budget entered');
  });

  test('an invalid entry is reported and never silently becomes zero', async ({ page }) => {
    await page.goto('/');

    const offerA = page.getByRole('group', { name: /Offer A/ });
    const bonus = offerA.getByLabel('One-time bonus per eligible employee');
    await bonus.fill('not a number');

    await expect(offerA.getByText(/Enter a dollar amount/)).toBeVisible();
    await expect(bonus).toHaveAttribute('aria-invalid', 'true');
    // The typed text survives; the field is not reset under the user.
    await expect(bonus).toHaveValue('not a number');

    // The total refuses rather than dropping the bonus to zero.
    await expect(page.getByText(/Partial estimate — some inputs are missing/)).toBeVisible();
    await expect(page.getByText('One-time bonus amount')).toBeVisible();

    // Neighbouring fields kept their values through the invalid edit.
    await expect(offerA.getByLabel('Base-pay raise (percent)')).toHaveValue('3');
    await expect(offerA.getByLabel('Raise effective date')).toHaveValue('2027-01-01');
  });

  test('an invalid date leaves the annualized figure and blocks only the current year', async ({ page }) => {
    await page.goto('/');
    const offerA = page.getByRole('group', { name: /Offer A/ });
    await offerA.getByLabel('Raise effective date').fill('');

    const notice = page.getByRole('note', { name: /Partial estimate/ });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Raise effective date');

    // The annualized increase does not depend on the date, so it survives:
    // $90,000 of base pay plus $6,552 of annualized overtime.
    await expect(
      resultsTable(page).getByRole('row', { name: /Annualized recurring increase/ }),
    ).toContainText('$96,552.00');

    // Only the current-year figure is withheld.
    await expect(
      resultsTable(page).getByRole('row', { name: /Increase over baseline, this fiscal year/ }),
    ).toContainText('Missing');
  });

  test('changing overtime assumptions shows their effect', async ({ page }) => {
    await page.goto('/');
    const results = resultsTable(page);
    const overtimeRow = results.getByRole('row', { name: /^Overtime/ });

    // Derived from base pay, so the raise lifts the rate for half the year.
    await expect(overtimeRow).toContainText('$3,276.00');

    // The overtime assumptions are collapsed, but their current setting is
    // always stated in the summary line.
    const offerA = page.getByRole('group', { name: /Offer A/ });
    await expect(offerA.locator('summary', { hasText: 'Overtime assumptions' })).toContainText(
      'Rate derived from base pay × 1.5, 420 hours a month',
    );
    await offerA.locator('summary', { hasText: 'Overtime assumptions' }).click();

    // Raising modeled hours from the baseline 420 to 600 adds the extra hours
    // at the overtime rate, plus the rate uplift on the applicable months.
    await offerA.getByLabel(/Modeled overtime hours per month/).fill('600');
    await expect(overtimeRow).toContainText('$98,143.20');

    // A separately confirmed rate is held flat across the raise.
    await offerA.getByLabel(/Use a separately confirmed rate/).check();
    await expect(offerA.getByLabel(/Confirmed overtime hourly rate/)).toBeVisible();
    await expect(page.getByText(/held flat/).first()).toBeVisible();

    // Declining to model overtime reports it as excluded, not as zero.
    await offerA.getByLabel(/Do not model overtime/).check();
    await expect(overtimeRow).toContainText('Excluded');
    await expect(
      page.locator('p.notice').filter({ hasText: 'Not calculated, and so not part of any increase' }),
    ).toContainText('Overtime increase');
  });

  test('the stress test varies one stated assumption', async ({ page }) => {
    await page.goto('/');

    await disclosure(page, 'Overtime hours stress test').click();
    const stress = page.getByRole('table').filter({ hasText: 'of modeled hours' });

    await expect(stress).toContainText('150% of modeled hours');
    await expect(stress).toContainText('630');
    await expect(stress).toContainText('Varies one stated assumption');
  });

  test('inspects the calculation steps behind a figure', async ({ page }) => {
    await page.goto('/');

    await disclosure(page, 'Assumptions and calculation steps — Offer A').click();

    await expect(page.getByText(/Effective 2027-01-01 in fiscal year/)).toContainText(
      '6 full months of 12',
    );
    await expect(page.getByRole('row', { name: /Annualized base-pay increase/ })).toContainText(
      '$90,000.00',
    );
    await expect(page.getByText(/shall be increased by three percent/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Excluded from every figure' })).toBeVisible();
  });

  test('comparison context does not claim to establish fair pay', async ({ page }) => {
    await page.goto('/');

    await disclosure(page, 'Comparison context').click();

    await expect(page.getByText(/does not establish fair pay/)).toBeVisible();
    await expect(page.getByText('Not directly comparable').first()).toBeVisible();
    await expect(page.getByText(/No average is shown/)).toBeVisible();
  });

  test('reviews an overtime flag that explains itself', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();

    await expect(page.getByRole('heading', { name: 'Overtime history' })).toBeVisible();
    await expect(
      page.getByRole('img', { name: /Line chart of Overtime hours per month/ }),
    ).toBeVisible();

    // The full table is available behind a labeled section.
    await disclosure(page, 'Monthly records').click();
    const table = page.getByRole('table').filter({ hasText: 'Effective hourly cost' });
    await expect(table.locator('tbody tr')).toHaveCount(24);

    const flag = page.locator('.flag').filter({ hasText: 'February 2026' }).first();
    await expect(flag).toContainText('Needs review');
    await expect(flag).toContainText('immediately preceding complete month');
    await expect(flag).toContainText('25%');
    await expect(flag).toContainText('January 2026');
  });

  test('uses no accusatory language anywhere in the overtime view', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();

    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const word of ['fraud', 'misconduct', 'overpayment', 'incorrect pay', 'abuse', 'theft']) {
      expect(body, word).not.toContain(word);
    }
  });

  test('raising the threshold removes a flag', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();

    expect(await page.locator('.flag').count()).toBeGreaterThan(0);

    await disclosure(page, 'Review thresholds').click();
    await page.getByLabel(/Flag an hours increase of at least/).fill('500');
    await expect(page.locator('.flag').filter({ hasText: 'Overtime hours up' })).toHaveCount(0);
  });

  test('switching the chart metric keeps it labeled', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();

    await page.getByLabel('Show').selectOption('effective');
    await expect(
      page.getByRole('img', { name: /Line chart of Effective overtime hourly cost/ }),
    ).toBeVisible();

    await page.getByLabel('Show').selectOption('variance');
    await expect(
      page.getByRole('img', { name: /Line chart of Budget variance per month/ }),
    ).toBeVisible();
  });

  test('checks a stated cost and reaches all three verdicts', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();

    const verdict = page.getByRole('status');

    // The fiscal note that omitted the bonus.
    await expect(verdict).toContainText('Difference requiring review');
    await expect(verdict).toContainText('-$25,000.00');
    await expect(verdict).toContainText('$70,000.00');
    await expect(verdict).toContainText('$1.00 absolute difference');
    await expect(verdict).toContainText(/A difference is not by itself a mistake/);

    // The claim covering only the raise matches.
    await page.getByLabel('Load a fictional example').selectOption('CLAIM-2');
    await expect(verdict).toContainText('Matches within the stated tolerance');

    // A total-payroll claim is refused rather than compared.
    await page.getByLabel('Load a fictional example').selectOption('CLAIM-3');
    await expect(verdict).toContainText('Cannot verify');
    await expect(verdict).toContainText('not an incremental-cost scope');
  });

  test('refuses a claim that includes components it cannot calculate', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();

    await page.getByLabel(/^Pension/).check();
    await expect(page.getByRole('status')).toContainText('Cannot verify');
    await expect(page.getByRole('status')).toContainText('does not calculate');
  });

  test('refuses a mismatched period', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();

    await page.getByLabel('Period the figure covers — to').fill('2028-06-30');
    await expect(page.getByRole('status')).toContainText('Cannot verify');
    await expect(page.getByRole('status')).toContainText('periods differ');
  });

  test('shows the reconciliation with inputs, formulas and the source passage', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();

    await disclosure(page, 'Reconciliation').click();

    await expect(
      page.getByRole('row', { name: /Difference \(stated − calculated\)/ }),
    ).toContainText('-$25,000.00');
    await expect(page.getByText(/ratification payment is \$45,000/).first()).toBeVisible();
    // Scoped to this view's panel: every view stays mounted, so an unscoped
    // query would find the Compare view's own collapsed copy first.
    const statedPanel = page.locator('#panel-stated');
    await expect(statedPanel.getByText(/Monthly proration/).first()).toBeVisible();
    await expect(page.getByRole('row', { name: /Base-pay increase/ }).first()).toContainText(
      '$45,000.00',
    );
  });

  test('tolerance decides the verdict but never hides the difference', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();

    await page.getByLabel('Tolerance (dollars)').fill('30000');
    const verdict = page.getByRole('status');

    await expect(verdict).toContainText('Matches within the stated tolerance');
    // The real difference is still on screen.
    await expect(verdict).toContainText('-$25,000.00');
  });

  test('imports a valid CSV and reports actionable errors for an invalid one', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.getByLabel('Import a CSV file');

    // Invalid first. The error must be specific and nothing may change.
    await fileInput.setInputFiles('public/fixtures/invalid-imports/employees-duplicate-id.csv');
    const errors = page.getByRole('alert');
    await expect(errors).toContainText('The file was not imported');
    await expect(errors).toContainText('Duplicate identifier');
    await expect(errors).toContainText('already used on row 1');
    await expect(errors).toContainText('existing data has not changed');
    // Baseline untouched: still the 50-employee cohort.
    await expect(page.getByText('$3,000,000.00').first()).toBeVisible();

    // Then a valid file. 61500+57200+64800+52300+70100+56900 = 362,800.
    await fileInput.setInputFiles('public/fixtures/valid-baseline/employees.csv');
    await expect(page.getByRole('status').filter({ hasText: 'imported rows' })).toContainText(
      'Replaced the employee cohort with 6 imported rows',
    );
    await expect(page.getByText('$362,800.00').first()).toBeVisible();
  });

  test('reports an invalid month with its row number', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Which table').selectOption('overtime_records');
    await page
      .getByLabel('Import a CSV file')
      .setInputFiles('public/fixtures/invalid-imports/overtime-invalid-date.csv');

    const errors = page.getByRole('alert');
    await expect(errors).toContainText('YYYY-MM');
    await expect(errors.getByRole('row').filter({ hasText: 'month' }).first()).toBeVisible();
  });

  test('exports the calculation breakdown as CSV', async ({ page }) => {
    await page.goto('/');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export calculation breakdown (CSV)' }).click();
    const file = await download;

    expect(file.suggestedFilename()).toBe('civicvariance-calculation-breakdown.csv');

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');

    expect(text).toContain('Synthetic demo data');
    expect(text).toContain('FY2027');
    expect(text).toContain('73276.00');
    expect(text).toContain('Excluded from all figures');
    expect(text).toContain('Pension and retirement contributions');
    expect(text).toContain('Generated on');
    expect(text).toContain('Monthly proration');
    expect(text).toContain('Needs review');
  });

  test('offers a template and a round-trippable copy of the current data', async ({ page }) => {
    await page.goto('/');

    const templateDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download blank template' }).click();
    expect((await templateDownload).suggestedFilename()).toBe('template-employees.csv');

    const dataDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download current data' }).click();
    expect((await dataDownload).suggestedFilename()).toBe('employees.csv');
  });

  test('opens a printable summary carrying its labels', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Open printable summary' }).click();

    await expect(
      page.getByRole('heading', { name: /CivicVariance — workforce budget impact summary/ }),
    ).toBeVisible();
    await expect(page.getByText(/All figures below are fictional/)).toBeVisible();
    await expect(page.getByText('FY2027 (July 1, 2026 – June 30, 2027)').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Assumptions applied' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Excluded from every figure' })).toBeVisible();
    await expect(page.getByText('$73,276.00').first()).toBeVisible();
    await expect(page.getByText(/Difference requiring review/)).toBeVisible();
    await expect(page.getByText(/Needs review/).first()).toBeVisible();

    // Both budget positions carry a word, so neither rests on the sign alone.
    const budgetRow = page.getByRole('row', { name: /Workforce budget remaining or shortfall/ });
    await expect(budgetRow).toContainText('Remaining against');
    await expect(budgetRow).toContainText('Workforce budget shortfall against');

    await page.getByRole('button', { name: 'Back to the application' }).click();
    await expect(page.getByRole('tab', { name: 'Compare proposals' })).toBeVisible();
  });

  test('resetting restores the demonstration data', async ({ page }) => {
    await page.goto('/');

    const recurring = resultsTable(page).getByRole('row', {
      name: /Annualized recurring increase/,
    });
    await expect(recurring).toContainText('$96,552.00');

    await page.getByRole('group', { name: /Offer A/ }).getByLabel('Base-pay raise (percent)').fill('9');
    await expect(recurring).not.toContainText('$96,552.00');

    await page.getByRole('button', { name: 'Reset to the demonstration data' }).click();

    await expect(
      page.getByRole('group', { name: /Offer A/ }).getByLabel('Base-pay raise (percent)'),
    ).toHaveValue('3');
    await expect(recurring).toContainText('$96,552.00');
  });

  test('has no dead controls: every button is enabled and does something', async ({ page }) => {
    await page.goto('/');
    const buttons = page.locator('button:not([role="tab"])');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(buttons.nth(i)).toBeEnabled();
    }
  });

  test('makes no network requests for data', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://localhost:4173') && !url.startsWith('data:')) {
        external.push(url);
      }
    });

    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();

    expect(external).toEqual([]);
  });
});
