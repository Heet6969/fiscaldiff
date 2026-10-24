/**
 * Offer B's increase/decrease rows, end to end: editing, blocking, signed
 * values on every output, and state surviving print preview.
 */
import Papa from 'papaparse';
import { expect, test, type Locator, type Page } from '@playwright/test';

const ADD = 'Add another increase/decrease';

function offerB(page: Page): Locator {
  return page.getByRole('group', { name: /Offer B/ });
}
function offerA(page: Page): Locator {
  return page.getByRole('group', { name: /Offer A/ });
}
function adjustment(page: Page, n: number): Locator {
  return offerB(page).getByRole('group', { name: `Adjustment ${n}` });
}
function results(page: Page): Locator {
  return page.getByRole('table').filter({ hasText: 'Increase over baseline, this fiscal year' });
}
/** Column 0 is Offer A, column 1 is Offer B. */
async function cell(page: Page, rowName: RegExp, column: 0 | 1): Promise<string> {
  return results(page).getByRole('row', { name: rowName }).locator('td').nth(column).innerText();
}
async function csvRows(page: Page): Promise<string[][]> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export calculation breakdown (CSV)' }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = new TextDecoder('utf-8').decode(Buffer.concat(chunks)).replace(/^\uFEFF/, '');
  return Papa.parse<string[]>(text, { delimiter: ',', newline: '\r\n' }).data;
}
const field = (rows: string[][], key: string) => rows.find((r) => r[0] === key)?.[1];

const INCREASE_ROW = /Increase over baseline, this fiscal year/;

test.describe('the editor', () => {
  test('Offer B starts as one Increase row holding its existing 2.5%', async ({ page }) => {
    await page.goto('/');
    const row = adjustment(page, 1);
    await expect(row.getByLabel('Direction')).toHaveValue('increase');
    await expect(row.getByLabel('Percentage (percent)')).toHaveValue('2.5');
    await expect(offerB(page).getByRole('group', { name: 'Adjustment 2' })).toHaveCount(0);
    await expect(offerB(page).getByRole('button', { name: ADD })).toBeVisible();
    await expect(offerB(page).getByRole('button', { name: 'Remove adjustment 1' })).toBeVisible();
    // No leftover single-percentage field on Offer B.
    await expect(offerB(page).getByLabel('Base-pay raise (percent)')).toHaveCount(0);
  });

  test('Offer A keeps its single percentage and effective date', async ({ page }) => {
    await page.goto('/');
    await expect(offerA(page).getByLabel('Base-pay raise (percent)')).toHaveValue('3');
    await expect(offerA(page).getByLabel('Raise effective date')).toHaveValue('2027-01-01');
    await expect(offerA(page).getByRole('button', { name: ADD })).toHaveCount(0);
    await expect(offerA(page).getByLabel('Direction')).toHaveCount(0);
  });

  test('the existing demonstration totals are unchanged', async ({ page }) => {
    await page.goto('/');
    expect(await cell(page, INCREASE_ROW, 0)).toContain('$73,276.00');
    expect(await cell(page, INCREASE_ROW, 1)).toContain('$77,036.00');
    expect(await cell(page, /Annualized recurring increase/, 1)).toContain('$80,443.20');
    expect(await cell(page, /Total proposed expenditure/, 1)).toContain('$3,295,116.80');
    expect(await cell(page, /Workforce budget remaining or shortfall/, 1)).toContain('-$2,116.80');
  });

  test('shows a compact net summary with the basis', async ({ page }) => {
    await page.goto('/');
    const summary = offerB(page).locator('.adjust-summary');
    await expect(summary).toContainText('Net base-pay change:');
    await expect(summary).toContainText('+2.5%');
    await expect(summary).toContainText('added together');
    await expect(summary).toContainText('not compounded');
  });

  test('rows can be added and removed, and the net follows', async ({ page }) => {
    await page.goto('/');
    await offerB(page).getByRole('button', { name: ADD }).click();
    await expect(adjustment(page, 2)).toBeVisible();

    await adjustment(page, 2).getByLabel('Direction').selectOption('decrease');
    await adjustment(page, 2).getByLabel('Percentage (percent)').fill('1');
    await expect(offerB(page).locator('.adjust-summary')).toContainText('+1.5%');

    await offerB(page).getByRole('button', { name: 'Remove adjustment 2' }).click();
    await expect(adjustment(page, 2)).toHaveCount(0);
    await expect(offerB(page).locator('.adjust-summary')).toContainText('+2.5%');
  });

  test('removing every row is an explicit 0%, not a missing value', async ({ page }) => {
    await page.goto('/');
    await offerB(page).getByRole('button', { name: 'Remove adjustment 1' }).click();

    await expect(offerB(page).getByText(/No adjustments entered, so the base-pay change is an explicit 0%/)).toBeVisible();
    await expect(offerB(page).locator('.adjust-summary')).toContainText('0%');
    expect(await cell(page, /^Base pay/, 1)).toContain('$0.00');
    await expect(page.getByText(/Partial estimate/)).toHaveCount(0);
  });
});

test.describe('sum, not compound', () => {
  test('+3% and −1% gives exactly the figures of a single +2%', async ({ page }) => {
    await page.goto('/');

    // Two rows: +3% and −1%.
    await adjustment(page, 1).getByLabel('Percentage (percent)').fill('3');
    await offerB(page).getByRole('button', { name: ADD }).click();
    await adjustment(page, 2).getByLabel('Direction').selectOption('decrease');
    await adjustment(page, 2).getByLabel('Percentage (percent)').fill('1');
    await expect(offerB(page).locator('.adjust-summary')).toContainText('+2%');

    const twoRows = {
      increase: await cell(page, INCREASE_ROW, 1),
      base: await cell(page, /^Base pay/, 1),
      recurring: await cell(page, /Annualized recurring increase/, 1),
      total: await cell(page, /Total proposed expenditure/, 1),
      budget: await cell(page, /Workforce budget remaining or shortfall/, 1),
    };

    // One row: +2%, same dates and assumptions.
    await offerB(page).getByRole('button', { name: 'Remove adjustment 2' }).click();
    await adjustment(page, 1).getByLabel('Percentage (percent)').fill('2');
    await expect(offerB(page).locator('.adjust-summary')).toContainText('+2%');

    expect(await cell(page, INCREASE_ROW, 1)).toBe(twoRows.increase);
    expect(await cell(page, /^Base pay/, 1)).toBe(twoRows.base);
    expect(await cell(page, /Annualized recurring increase/, 1)).toBe(twoRows.recurring);
    expect(await cell(page, /Total proposed expenditure/, 1)).toBe(twoRows.total);
    expect(await cell(page, /Workforce budget remaining or shortfall/, 1)).toBe(twoRows.budget);

    // 2% of $60,000 for 50 staff over ten of twelve months. A compounded 1.97% would differ.
    expect(twoRows.base).toContain('$50,000.00');
  });
});

test.describe('a net decrease', () => {
  async function makeDecrease(page: Page) {
    await adjustment(page, 1).getByLabel('Direction').selectOption('decrease');
    await expect(offerB(page).locator('.adjust-summary')).toContainText('−2.5%');
  }

  test('reduces base pay and shows the sign in words and numbers', async ({ page }) => {
    await page.goto('/');
    await makeDecrease(page);

    // 2.5% of $3,000,000 for ten of twelve months, as a saving.
    expect(await cell(page, /^Base pay/, 1)).toContain('-$62,500.00');
    expect(await cell(page, /Annualized recurring increase/, 1)).toMatch(/-\$/);
    expect(await cell(page, INCREASE_ROW, 1)).toMatch(/-\$/);

    await expect(
      page.locator('.key-result__item', { hasText: 'Offer B' }).locator('.key-result__unit'),
    ).toContainText('decrease (saving) this fiscal year');
    // Offer A is still an increase.
    await expect(
      page.locator('.key-result__item', { hasText: 'Offer A' }).locator('.key-result__unit'),
    ).toContainText('increase this fiscal year');
    await expect(page.getByText(/A negative amount is a decrease from baseline \(a saving\)/).first()).toBeVisible();
  });

  test('lowers a derived overtime rate, so the overtime change is also negative', async ({ page }) => {
    await page.goto('/');
    expect(await cell(page, /^Overtime/, 1)).not.toMatch(/-\$/);
    await makeDecrease(page);
    expect(await cell(page, /^Overtime/, 1)).toMatch(/-\$/);
  });

  test('improves the workforce budget position', async ({ page }) => {
    await page.goto('/');
    expect(await cell(page, /Workforce budget remaining or shortfall/, 1)).toContain('Workforce budget shortfall');
    await makeDecrease(page);
    const budget = await cell(page, /Workforce budget remaining or shortfall/, 1);
    expect(budget).toContain('+$');
    expect(budget).toContain('Remaining against');
    expect(budget).not.toContain('Workforce budget shortfall');
  });

  test('is drawn left of zero on the chart, with the saving explained', async ({ page }) => {
    await page.goto('/');
    await makeDecrease(page);
    const chart = page.getByRole('img', { name: /Stacked bar chart/ });
    await expect(chart).toHaveAttribute('aria-label', /Offer B — alternative: total -\$/);
    await expect(chart).toHaveAttribute('aria-label', /base-pay increase -\$62,500\.00/);

    await page.getByRole('button', { name: /Offer B · Base-pay increase/ }).hover();
    const tip = page.locator('#panel-compare .chart-tooltip.is-visible');
    await expect(tip).toContainText('-$62,500.00');
    // A share of a negative total is not meaningful, so none is shown.
    await expect(tip).not.toContainText('%');
    await expect(page.getByText(/A bar to the left of \$0 is a decrease \(a saving\)/)).toBeVisible();
  });

  test('Offer A does not move', async ({ page }) => {
    await page.goto('/');
    const before = [
      await cell(page, INCREASE_ROW, 0),
      await cell(page, /Annualized recurring increase/, 0),
      await cell(page, /Total proposed expenditure/, 0),
    ];
    await makeDecrease(page);
    await offerB(page).getByRole('button', { name: ADD }).click();
    await adjustment(page, 2).getByLabel('Percentage (percent)').fill('abc');
    expect(await cell(page, INCREASE_ROW, 0)).toBe(before[0]);
    expect(await cell(page, /Annualized recurring increase/, 0)).toBe(before[1]);
    expect(await cell(page, /Total proposed expenditure/, 0)).toBe(before[2]);
  });
});

test.describe('invalid rows block results', () => {
  test('a newly added, still-empty row blocks Offer B and is named', async ({ page }) => {
    await page.goto('/');
    await offerB(page).getByRole('button', { name: ADD }).click();

    expect(await cell(page, INCREASE_ROW, 1)).toContain('Missing');
    expect(await cell(page, /^Base pay/, 1)).toContain('Missing');
    expect(await cell(page, /Total proposed expenditure/, 1)).toContain('Missing');
    await expect(offerB(page).locator('.adjust-summary')).toContainText('not available');
    await expect(offerB(page).locator('.adjust-summary')).toContainText('Adjustment 2 is unfinished or invalid');
    await expect(page.getByRole('note', { name: /Partial estimate/ })).toContainText('Adjustment 2 is unfinished or invalid');
    // Offer A is not blocked by it.
    expect(await cell(page, INCREASE_ROW, 0)).toContain('$73,276.00');

    // Completing the row releases it.
    await adjustment(page, 2).getByLabel('Percentage (percent)').fill('1');
    expect(await cell(page, INCREASE_ROW, 1)).not.toContain('Missing');
  });

  test('an invalid entry is reported on the field and blocks, never skipped', async ({ page }) => {
    await page.goto('/');
    const percent = adjustment(page, 1).getByLabel('Percentage (percent)');
    await percent.fill('2.5x');
    await expect(percent).toHaveAttribute('aria-invalid', 'true');
    expect(await cell(page, INCREASE_ROW, 1)).toContain('Missing');
    // The typed text is kept so it can be corrected.
    await expect(percent).toHaveValue('2.5x');
  });

  test('a negative percentage is rejected: direction carries the sign', async ({ page }) => {
    await page.goto('/');
    const percent = adjustment(page, 1).getByLabel('Percentage (percent)');
    await percent.fill('-2');
    await expect(percent).toHaveAttribute('aria-invalid', 'true');
    expect(await cell(page, INCREASE_ROW, 1)).toContain('Missing');
  });

  test('a combined change below −100% is refused with the reason', async ({ page }) => {
    await page.goto('/');
    await adjustment(page, 1).getByLabel('Direction').selectOption('decrease');
    await adjustment(page, 1).getByLabel('Percentage (percent)').fill('60');
    await offerB(page).getByRole('button', { name: ADD }).click();
    await adjustment(page, 2).getByLabel('Direction').selectOption('decrease');
    await adjustment(page, 2).getByLabel('Percentage (percent)').fill('50');

    const summary = offerB(page).locator('.adjust-summary');
    await expect(summary).toContainText('below −100%');
    await expect(summary).toContainText('−110%');
    expect(await cell(page, INCREASE_ROW, 1)).toContain('Missing');
    expect(await cell(page, /Total proposed expenditure/, 1)).toContain('Missing');

    // Reducing it releases the block.
    await adjustment(page, 2).getByLabel('Percentage (percent)').fill('30');
    await expect(summary).toContainText('−90%');
    expect(await cell(page, INCREASE_ROW, 1)).not.toContain('Missing');
  });
});

test.describe('state survives print preview', () => {
  test('keeps rows, directions, values and an unfinished row', async ({ page }) => {
    await page.goto('/');
    await adjustment(page, 1).getByLabel('Percentage (percent)').fill('3');
    await offerB(page).getByRole('button', { name: ADD }).click();
    await adjustment(page, 2).getByLabel('Direction').selectOption('decrease');
    await adjustment(page, 2).getByLabel('Percentage (percent)').fill('1.5x');
    await offerB(page).getByRole('button', { name: ADD }).click();

    await page.getByRole('button', { name: 'Open printable summary' }).click();
    // The summary says plainly that Offer B's change is not available.
    await expect(page.locator('#print-report')).toContainText('Offer B base-pay changes');
    await expect(page.locator('#print-report')).toContainText('Not available');
    await page.getByRole('button', { name: 'Back to the application' }).click();

    await expect(adjustment(page, 1).getByLabel('Percentage (percent)')).toHaveValue('3');
    await expect(adjustment(page, 2).getByLabel('Direction')).toHaveValue('decrease');
    await expect(adjustment(page, 2).getByLabel('Percentage (percent)')).toHaveValue('1.5x');
    await expect(adjustment(page, 2).getByLabel('Percentage (percent)')).toHaveAttribute('aria-invalid', 'true');
    await expect(adjustment(page, 3)).toBeVisible();
    await expect(adjustment(page, 3).getByLabel('Percentage (percent)')).toHaveValue('');
  });
});

test.describe('provenance', () => {
  test('rows are user assumptions, and the net is recorded as one', async ({ page }) => {
    await page.goto('/');
    await adjustment(page, 1).getByLabel('Percentage (percent)').fill('4');
    await page.locator('summary', { hasText: 'Assumptions and calculation steps — Offer B' }).click();

    const row = page.locator('#panel-compare tr', { hasText: 'Net base-pay change' }).first();
    await expect(row).toContainText('+4%');
    await expect(row).toContainText('not compounded');
    await expect(row.locator('td').last()).toContainText('User assumption');
    await expect(row.locator('td').last()).toContainText('Counterproposal adjustments entered on screen');
  });
});

test.describe('signed values agree on every output', () => {
  async function setUp(page: Page, stated: string) {
    await page.goto('/');
    // Offer B: net −2.5%, from 2026-09-01. Base pay only keeps the claim simple.
    await adjustment(page, 1).getByLabel('Direction').selectOption('decrease');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
    await page.getByLabel('Check against').selectOption('B');
    await page.getByRole('checkbox', { name: /^One-time bonus/ }).uncheck();
    await page.getByLabel('Stated incremental cost').fill(stated);
  }

  test('a stated saving that matches: screen, CSV and print show the same signed figures', async ({
    page,
  }) => {
    await setUp(page, '-62500');
    const status = page.getByRole('status');

    // Screen.
    await expect(status).toContainText('Matches within the stated tolerance');
    await expect(status).toContainText('Checked against Offer B — alternative');
    await expect(status.locator('dd', { hasText: '-$62,500.00' })).toHaveCount(2); // stated and calculated
    await expect(page.getByRole('img', { name: /Bar chart comparing the stated amount -\$62,500\.00 with the calculated amount -\$62,500\.00/ })).toBeVisible();

    // CSV.
    const rows = await csvRows(page);
    expect(field(rows, 'Stated amount (USD)')).toBe('-62500.00');
    expect(field(rows, 'Calculated amount (USD)')).toBe('-62500.00');
    expect(field(rows, 'Difference, stated minus calculated (USD)')).toBe('0.00');
    expect(field(rows, 'Offer compared against')).toBe('Offer B — alternative');
    expect(field(rows, 'Offer B base-pay changes')).toContain('Decrease 2.5% → net −2.5%');

    // Print.
    await page.getByRole('button', { name: 'Open printable summary' }).click();
    const summary = page.locator('#print-report');
    await expect(summary).toContainText('Matches within the stated tolerance');
    await expect(summary).toContainText('-$62,500.00');
    await expect(summary).toContainText('Decrease 2.5% → net −2.5%');
    await expect(summary).toContainText('A negative amount is a decrease from baseline (a saving).');
  });

  test('a saving stated too large: the signed difference is the same everywhere', async ({ page }) => {
    await setUp(page, '-50000');
    // Stated −50,000 against a calculated −62,500: stated minus calculated is +12,500.
    const status = page.getByRole('status');
    await expect(status).toContainText('Difference requiring review');
    await expect(status).toContainText('+$12,500.00');

    const rows = await csvRows(page);
    expect(field(rows, 'Stated amount (USD)')).toBe('-50000.00');
    expect(field(rows, 'Calculated amount (USD)')).toBe('-62500.00');
    expect(field(rows, 'Difference, stated minus calculated (USD)')).toBe('12500.00');

    await page.getByRole('button', { name: 'Open printable summary' }).click();
    const summary = page.locator('#print-report');
    await expect(summary).toContainText('-$50,000.00');
    await expect(summary).toContainText('-$62,500.00');
    await expect(summary).toContainText('+$12,500.00');
  });

  test('a stated cost where a saving was calculated is a difference, not a match', async ({ page }) => {
    await setUp(page, '62500');
    await expect(page.getByRole('status')).toContainText('Difference requiring review');
    await expect(page.getByRole('status')).toContainText('+$125,000.00');
  });
});

test.describe('which values may be negative', () => {
  test('a stated incremental cost may, with a hint', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
    const stated = page.getByLabel('Stated incremental cost');
    await stated.fill('-2000');
    await expect(stated).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Enter a negative amount, such as -2,000, for a stated saving.')).toBeVisible();
  });

  test('a bonus and a budget may not', async ({ page }) => {
    await page.goto('/');
    const bonus = offerB(page).getByLabel('One-time bonus per eligible employee');
    await bonus.fill('-5');
    await expect(bonus).toHaveAttribute('aria-invalid', 'true');
    await expect(offerB(page).getByText('Enter an amount of zero or more.')).toBeVisible();

    const budget = page.getByLabel('Adopted workforce budget for this fiscal year');
    await budget.fill('-5');
    await expect(budget).toHaveAttribute('aria-invalid', 'true');
  });

  test('a stated cost of text is still rejected', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
    const stated = page.getByLabel('Stated incremental cost');
    await stated.fill('minus two thousand');
    await expect(stated).toHaveAttribute('aria-invalid', 'true');
  });
});
