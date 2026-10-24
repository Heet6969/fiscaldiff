/**
 * Presentation checks: the three charts, honest axes and units, view-switching
 * that preserves entries, and the print layout.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

function disclosure(page: import('@playwright/test').Page, text: string) {
  return page.locator('summary', { hasText: text });
}

test.describe('compare chart', () => {
  test('draws both offers with exact totals and a text legend', async ({ page }) => {
    await page.goto('/');
    const chart = page.getByRole('img', { name: /Stacked bar chart of the current fiscal-year increase/ });
    await expect(chart).toBeVisible();

    const label = (await chart.getAttribute('aria-label')) ?? '';
    expect(label).toContain('total $73,276.00');
    expect(label).toContain('base-pay increase $45,000.00');
    expect(label).toContain('overtime increase $3,276.00');
    expect(label).toContain('one-time bonus $25,000.00');
    expect(label).toContain('total $77,036.00');

    // Text legend carries every amount, so colour is never the only channel.
    const legend = page.getByRole('list', { name: 'Chart legend with exact amounts' });
    await expect(legend).toContainText('Base-pay increase');
    await expect(legend).toContainText('A: $45,000.00');
    await expect(legend).toContainText('B: $62,500.00');
    await expect(legend).toContainText('One-time bonus');
    await expect(legend).toContainText('B: $10,000.00');
  });

  test('keeps annualized recurring impact separate from the bars', async ({ page }) => {
    await page.goto('/');
    const note = page.locator('.figure-note', { hasText: 'Annualized recurring impact' });
    await expect(note).toContainText('shown separately and not part of the bars');
    await expect(note).toContainText('$96,552.00');
    await expect(note).toContainText('$80,443.20');
  });

  test('follows the numbers when an offer changes', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('group', { name: /Offer A/ })
      .getByLabel('One-time bonus per eligible employee')
      .fill('0');

    const chart = page.getByRole('img', { name: /Stacked bar chart/ });
    await expect(chart).toHaveAttribute('aria-label', /one-time bonus \$0\.00/);
    await expect(chart).toHaveAttribute('aria-label', /total \$48,276\.00/);
  });

  test('says a component is excluded rather than drawing it as zero', async ({ page }) => {
    await page.goto('/');
    const offerA = page.getByRole('group', { name: /Offer A/ });
    await offerA.locator('summary', { hasText: 'Overtime assumptions' }).click();
    await offerA.getByLabel(/Do not model overtime/).check();

    await expect(page.getByRole('img', { name: /Stacked bar chart/ })).toHaveAttribute(
      'aria-label',
      /overtime increase excluded/,
    );
    await expect(
      page.getByRole('list', { name: 'Chart legend with exact amounts' }),
    ).toContainText('Excluded');
  });

  test('shows an incomplete total as unavailable, not as zero', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('group', { name: /Offer A/ })
      .getByLabel('Bonus payment date')
      .fill('');

    await expect(page.getByRole('img', { name: /Stacked bar chart/ })).toHaveAttribute(
      'aria-label',
      /Offer A — union request: total missing/,
    );
  });
});

test.describe('overtime chart', () => {
  async function openOvertime(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();
  }

  test('hours view has hours units, flagged months, and no budget line', async ({ page }) => {
    await openOvertime(page);
    const chart = page.getByRole('img', { name: /Line chart of Overtime hours per month/ });
    await expect(chart).toBeVisible();

    await expect(page.locator('#panel-overtime').getByText('Hours per month', { exact: true })).toBeVisible();
    // Dollar budget must not appear on an hours axis.
    await expect(page.locator('.chart__budget')).toHaveCount(0);
    await expect(page.locator('#panel-overtime .legend--inline')).not.toContainText('Monthly overtime budget');
    // Three months carry a Needs review flag and are marked.
    await expect(page.locator('polygon.chart__flag')).toHaveCount(3);
    await expect(page.locator('#panel-overtime .legend--inline')).toContainText('Month with a Needs review flag (3)');
  });

  test('dollars view shows the budget line with dollar units', async ({ page }) => {
    await openOvertime(page);
    await page.getByLabel('Show').selectOption('dollars');

    await expect(page.locator('#panel-overtime').getByText('Dollars per month', { exact: true })).toBeVisible();
    // A constant budget is a flat line with no height, so assert it is drawn, not 'visible'.
    await expect(page.locator('#panel-overtime polyline.chart__budget').first()).toBeAttached();
    await expect(page.locator('#panel-overtime .legend--inline')).toContainText('Monthly overtime budget');
    // Axis labels are dollars, not bare hour counts.
    await expect(page.locator('#panel-overtime .chart__label', { hasText: /^\$\d/ }).first()).toBeVisible();
  });

  test('switching back to hours removes the budget line again', async ({ page }) => {
    await openOvertime(page);
    await page.getByLabel('Show').selectOption('dollars');
    // A constant budget is a flat line with no height, so assert it is drawn, not 'visible'.
    await expect(page.locator('#panel-overtime polyline.chart__budget').first()).toBeAttached();
    await page.getByLabel('Show').selectOption('hours');
    await expect(page.locator('.chart__budget')).toHaveCount(0);
  });

  test('hourly cost axis states that it does not start at zero', async ({ page }) => {
    await openOvertime(page);
    await page.getByLabel('Show').selectOption('effective');
    await expect(page.locator('#panel-overtime').getByText('Dollars per overtime hour', { exact: true })).toBeVisible();
    await expect(page.getByText(/The vertical axis does not start at zero/)).toBeVisible();

    await page.getByLabel('Show').selectOption('hours');
    await expect(page.getByText(/The vertical axis includes zero/)).toBeVisible();
  });

  test('variance view draws a zero line and signed units', async ({ page }) => {
    await openOvertime(page);
    await page.getByLabel('Show').selectOption('variance');
    await expect(page.locator('#panel-overtime line.chart__zero').first()).toBeAttached();
    await expect(page.locator('#panel-overtime .chart__label', { hasText: /^\+\$/ }).first()).toBeVisible();
  });

  test('the data table marks flagged months in words', async ({ page }) => {
    await openOvertime(page);
    await disclosure(page, 'Monthly records').click();
    const marked = page.locator('.review-mark');
    await expect(marked).toHaveCount(3);
    await expect(marked.first()).toHaveText('Needs review');
  });

  test('leaves a gap for a missing month and does not join across it', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Which table').selectOption('overtime_records');
    // Drop one month's hours and dollars from a copy of the demo data.
    const header =
      'month,overtime_hours,overtime_dollars,overtime_budget_dollars,provenance,source_label';
    const rows = [
      '2026-01,400,17000.00,22000.00,synthetic-sample,Test',
      '2026-02,,,22000.00,synthetic-sample,Test',
      '2026-03,410,17500.00,22000.00,synthetic-sample,Test',
      '2026-04,420,18000.00,22000.00,synthetic-sample,Test',
    ];
    await page.getByLabel('Import a CSV file').setInputFiles({
      name: 'gap.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([header, ...rows].join('\n')),
    });
    await expect(page.getByRole('status').filter({ hasText: 'imported' })).toBeVisible();

    await page.getByRole('tab', { name: 'Review overtime' }).click();
    await expect(page.locator('line.chart__gap')).toHaveCount(1);
    // Two separate line segments rather than one joined across February.
    await expect(page.locator('polyline.chart__line')).toHaveCount(2);
  });
});

test.describe('stated-cost chart', () => {
  async function openStated(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
  }

  test('compares stated and calculated with a signed difference in words', async ({ page }) => {
    await openStated(page);
    const chart = page.getByRole('img', { name: /Bar chart comparing the stated amount/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute('aria-label', /\$45,000\.00 with the calculated amount \$70,000\.00/);

    const note = page.locator('#panel-stated figcaption');
    await expect(note).toContainText('Difference (stated − calculated): -$25,000.00');
    await expect(note).toContainText('$25,000.00 lower than calculated');
  });

  test('draws bars for a match too', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Load a fictional example').selectOption('CLAIM-2');
    await expect(page.getByRole('img', { name: /Bar chart comparing the stated amount/ })).toBeVisible();
    await expect(page.locator('#panel-stated figcaption')).toContainText(
      'The stated amount equals the calculated amount',
    );
  });

  test('draws no bars when the claim cannot be verified, and says why', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Load a fictional example').selectOption('CLAIM-3');

    await expect(page.getByRole('status')).toContainText('Cannot verify');
    await expect(page.getByRole('img', { name: /Bar chart comparing the stated amount/ })).toHaveCount(0);
    await expect(page.locator('#panel-stated .notice')).toContainText('No comparison is drawn');
    await expect(page.getByRole('status')).toContainText('not an incremental-cost scope');
  });

  test('draws no bars for a period mismatch', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Period the figure covers — to').fill('2028-06-30');
    await expect(page.getByRole('status')).toContainText('Cannot verify');
    await expect(page.getByRole('img', { name: /Bar chart comparing the stated amount/ })).toHaveCount(0);
  });
});

test.describe('view switching preserves entries', () => {
  test('keeps valid and invalid entries across all three views', async ({ page }) => {
    await page.goto('/');

    const offerA = page.getByRole('group', { name: /Offer A/ });
    await offerA.getByLabel('Base-pay raise (percent)').fill('4.5');
    const bonus = offerA.getByLabel('One-time bonus per eligible employee');
    await bonus.fill('not a number');

    await page.getByRole('tab', { name: 'Review overtime' }).click();
    await page.getByLabel('Show').selectOption('dollars');
    await disclosure(page, 'Review thresholds').click();
    await page.getByLabel(/Flag an hours increase of at least/).fill('40');

    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
    await page.getByLabel('Stated incremental cost').fill('12345');
    await page.getByLabel('Tolerance (dollars)').fill('7');
    await page.getByLabel('Supporting document label (optional)').fill('My memo');

    // Back through every view.
    await page.getByRole('tab', { name: 'Compare proposals' }).click();
    await expect(offerA.getByLabel('Base-pay raise (percent)')).toHaveValue('4.5');
    // Even the invalid text is still on screen, with its error.
    await expect(bonus).toHaveValue('not a number');
    await expect(offerA.getByText(/Enter a dollar amount/)).toBeVisible();

    await page.getByRole('tab', { name: 'Review overtime' }).click();
    await expect(page.getByLabel('Show')).toHaveValue('dollars');
    await expect(page.getByLabel(/Flag an hours increase of at least/)).toHaveValue('40');

    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
    await expect(page.getByLabel('Stated incremental cost')).toHaveValue('12345');
    await expect(page.getByLabel('Tolerance (dollars)')).toHaveValue('7');
    await expect(page.getByLabel('Supporting document label (optional)')).toHaveValue('My memo');
  });

  test('reset still restores the stated-cost entries too', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
    await page.getByLabel('Stated incremental cost').fill('999');
    await page.getByRole('button', { name: 'Reset to the demonstration data' }).click();
    await expect(page.getByLabel('Stated incremental cost')).toHaveValue('45000.00');
  });
});

test.describe('layout and contrast', () => {
  test('puts inputs beside results on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const controls = await page.locator('#panel-compare .controls').boundingBox();
    const results = await page.locator('#panel-compare .results').boundingBox();
    expect(controls && results).toBeTruthy();
    if (!controls || !results) return;
    expect(results.x).toBeGreaterThan(controls.x + controls.width - 1);
    expect(Math.abs(results.y - controls.y)).toBeLessThan(40);
  });

  test('stacks into one column on a narrow screen without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/');
    const controls = await page.locator('#panel-compare .controls').boundingBox();
    const results = await page.locator('#panel-compare .results').boundingBox();
    if (!controls || !results) throw new Error('layout boxes not found');
    expect(results.y).toBeGreaterThan(controls.y + controls.height - 1);
    expect(Math.abs(results.x - controls.x)).toBeLessThan(2);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('charts stay inside their container at a narrow width', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await page.goto('/');
    for (const view of ['Compare proposals', 'Review overtime', 'Check a stated cost'] as const) {
      await page.getByRole('tab', { name: view }).click();
      const overflowing = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.chart-box'))
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => el.scrollWidth - el.clientWidth)
          .filter((n) => n > 1),
      );
      expect(overflowing, view).toEqual([]);
    }
  });

  test('every view passes axe with the new colours, including the expanded sections', async ({ page }) => {
    await page.goto('/');
    for (const view of ['Compare proposals', 'Review overtime', 'Check a stated cost'] as const) {
      await page.getByRole('tab', { name: view }).click();
      // Open every disclosure in the visible panel so their contents are checked too.
      await page.evaluate(() => {
        document
          .querySelectorAll('[role="tabpanel"]:not([hidden]) details')
          .forEach((d) => ((d as HTMLDetailsElement).open = true));
      });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
        .join('\n');
      expect(summary, view).toBe('');
    }
  });

  test('the colour roles hold: amber for review, red only for shortfall or invalid input', async ({ page }) => {
    await page.goto('/');
    const shortfall = page.locator('.key-result__sub', { hasText: 'Workforce budget shortfall' });
    await expect(shortfall).toBeVisible();
    const red = await shortfall.evaluate((el) => getComputedStyle(el.firstElementChild ?? el).color);
    expect(red).toBe('rgb(180, 35, 24)');

    await page.getByRole('tab', { name: 'Review overtime' }).click();
    const status = page.locator('.flag__status').first();
    await expect(status).toHaveText('Needs review');
    const amber = await status.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(amber).toBe('rgb(183, 121, 31)');
  });

  test('keyboard focus is visible on the new controls', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();
    const select = page.getByLabel('Show');
    await select.focus();
    const outline = await select.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    // Reach the disclosure the way a keyboard user does. Programmatic focus on a
    // summary does not count as focus-visible, so tab to it instead.
    await page.keyboard.press('Tab');
    const summary = page.locator('#panel-overtime summary', { hasText: 'Review thresholds' });
    await expect(summary).toBeFocused();
    expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    expect(await summary.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('3px');
  });
});

test.describe('print layout', () => {
  test('the printable summary has no on-screen chrome when printed', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open printable summary' }).click();
    await page.emulateMedia({ media: 'print' });

    await expect(page.getByRole('button', { name: 'Print this summary' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'CivicVariance — workforce budget impact summary',
    );
    await expect(page.getByText(/All figures below are fictional/)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});



