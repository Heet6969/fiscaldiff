/**
 * Chart interactions: hover highlight and tooltip, keyboard, touch, tooltip
 * placement, honest handling of missing and excluded data, reduced motion,
 * print, and accessibility with a tooltip open.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const COMPARE_TIP = '#panel-compare .chart-tooltip.is-visible';
const OVERTIME_TIP = '#panel-overtime .chart-tooltip.is-visible';
const STATED_TIP = '#panel-stated .chart-tooltip.is-visible';

/** Press Tab the way a keyboard user would until `target` has focus. */
async function tabTo(page: Page, target: Locator, max = 120): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const focused = await target.evaluate((el) => el === document.activeElement).catch(() => false);
    if (focused) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Keyboard focus never reached the chart.');
}

async function openOvertime(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Review overtime' }).click();
}

async function openStated(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Check a stated cost' }).click();
}

test.describe('stacked cost chart', () => {
  test('hover highlights the segment and shows its exact value and share', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Offer A · Base-pay increase/ }).hover();

    const tip = page.locator(COMPARE_TIP);
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Offer A · Base-pay increase');
    await expect(tip).toContainText('$45,000.00');
    // 45,000 of 73,276, labeled with what it is a percentage of.
    await expect(tip).toContainText("61.4% of Offer A's current-year increase");

    // The chosen segment is full strength and the others recede.
    await expect(page.locator('#panel-compare rect.seg--base.is-active')).toHaveCount(1);
    await expect(page.locator('#panel-compare rect.seg.is-active').first()).toHaveCSS('opacity', '1');
    await expect(page.locator('#panel-compare rect.seg:not(.is-active)').first()).toHaveCSS(
      'opacity',
      '0.55',
    );
  });

  test('uses a short, gentle transition', async ({ page }) => {
    await page.goto('/');
    const durations = await page
      .locator('#panel-compare rect.seg')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration.split(',').map((d) => parseFloat(d)));
    expect(durations.length).toBeGreaterThan(0);
    for (const seconds of durations) {
      expect(seconds).toBeGreaterThanOrEqual(0.12);
      expect(seconds).toBeLessThanOrEqual(0.18);
    }
    const tip = await page
      .locator('#panel-compare .chart-tooltip')
      .evaluate((el) => getComputedStyle(el).transitionDuration.split(',').map((d) => parseFloat(d)));
    expect(tip[0]).toBeGreaterThanOrEqual(0.12);
    expect(tip[0]).toBeLessThanOrEqual(0.18);
  });

  test('the tooltip goes away when the pointer leaves', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Offer A · Base-pay increase/ }).hover();
    await expect(page.locator(COMPARE_TIP)).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(page.locator('#panel-compare .chart-tooltip')).toBeHidden();
    await expect(page.locator('#panel-compare rect.seg.is-active')).toHaveCount(0);
  });

  test('a mouse click does not leave the tooltip stuck open', async ({ page }) => {
    await page.goto('/');
    const segment = page.getByRole('button', { name: /Offer A · Base-pay increase/ });
    await segment.click();
    await page.mouse.move(2, 2);
    await expect(page.locator('#panel-compare .chart-tooltip')).toBeHidden();
  });

  test('shows no percentage when the total is not a valid denominator', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('group', { name: /Offer A/ }).getByLabel('Bonus payment date').fill('');

    await page.getByRole('button', { name: /Offer A · Base-pay increase/ }).hover();
    const tip = page.locator(COMPARE_TIP);
    await expect(tip).toContainText('$45,000.00');
    await expect(tip).not.toContainText('%');
  });

  test('names an excluded component instead of showing it as zero', async ({ page }) => {
    await page.goto('/');
    const offerA = page.getByRole('group', { name: /Offer A/ });
    await offerA.locator('summary', { hasText: 'Overtime assumptions' }).click();
    await offerA.getByLabel(/Do not model overtime/).check();

    // Nothing is drawn or offered for the excluded component...
    await expect(page.getByRole('button', { name: /Offer A · Overtime increase/ })).toHaveCount(0);

    // ...and the offer's summary tooltip says so in words.
    await page.getByRole('button', { name: /Offer A — all components/ }).hover();
    const tip = page.locator(COMPARE_TIP);
    await expect(tip).toContainText('Overtime increase: Excluded');
    await expect(tip).not.toContainText('Overtime increase: $0.00');
  });

  test('names a missing component and an unavailable total, never zero', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('group', { name: /Offer A/ }).getByLabel('Bonus payment date').fill('');

    await page.getByRole('button', { name: /Offer A — all components/ }).hover();
    const tip = page.locator(COMPARE_TIP);
    await expect(tip).toContainText('Total this fiscal year: not available');
    await expect(tip).toContainText('One-time bonus: Missing');
    await expect(tip).not.toContainText('One-time bonus: $0.00');
  });

  test('a genuine zero is still shown as $0.00', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('group', { name: /Offer A/ })
      .getByLabel('One-time bonus per eligible employee')
      .fill('0');
    await page.getByRole('button', { name: /Offer A — all components/ }).hover();
    await expect(page.locator(COMPARE_TIP)).toContainText('One-time bonus: $0.00');
  });

  test('keyboard focus shows the same information, moves with arrows, and dismisses with Escape', async ({
    page,
  }) => {
    await page.goto('/');
    const first = page.getByRole('button', { name: /Offer A — all components/ });
    await tabTo(page, first);

    const tip = page.locator(COMPARE_TIP);
    await expect(tip).toContainText('Offer A — all components');
    await expect(tip).toContainText('Base-pay increase: $45,000.00');

    // Focus indicator is real and meaningful.
    await expect(first).toHaveCSS('outline-style', 'solid');
    await expect(first).toHaveCSS('outline-width', '3px');

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /Offer A · Base-pay increase/ })).toBeFocused();
    await expect(tip).toContainText('Offer A · Base-pay increase');
    await expect(tip).toContainText('$45,000.00');

    await page.keyboard.press('End');
    await expect(page.locator('#panel-compare .chart-target').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#panel-compare .chart-target').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#panel-compare .chart-tooltip')).toBeHidden();
    await expect(page.locator('#panel-compare .chart-target').first()).toBeFocused();
  });

  test('the points are one tab stop, so the chart is not a keyboard trap', async ({ page }) => {
    await page.goto('/');
    await tabTo(page, page.getByRole('button', { name: /Offer A — all components/ }));
    await page.keyboard.press('Tab');
    const stillInside = await page.evaluate(
      () => document.activeElement?.closest('.chart-overlay') !== null,
    );
    expect(stillInside).toBe(false);
  });

  test('keeps the chart image label and legend as text equivalents', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('img', { name: /Stacked bar chart/ })).toHaveAttribute(
      'aria-label',
      /total \$73,276\.00/,
    );
    await expect(page.getByRole('list', { name: 'Chart legend with exact amounts' })).toContainText(
      'A: $45,000.00',
    );
  });
});

test.describe('overtime chart', () => {
  test('hover shows the month, the measure and Needs review for a flagged month', async ({ page }) => {
    await openOvertime(page);
    await page.getByRole('button', { name: /^February 2026\./ }).hover();

    const tip = page.locator(OVERTIME_TIP);
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('February 2026');
    await expect(tip).toContainText('Overtime hours per month: 663.5 hours');
    await expect(tip).toContainText('Needs review');
    // The budget is a dollar figure and does not belong on an hours chart.
    await expect(tip).not.toContainText('budget');

    await expect(page.locator('#panel-overtime .chart__halo.is-active')).toHaveCount(1);
    await expect(page.locator('#panel-overtime .chart__guide')).toHaveCount(1);
  });

  test('an ordinary month has no Needs review badge', async ({ page }) => {
    await openOvertime(page);
    await page.getByRole('button', { name: /^July 2024\./ }).hover();
    const tip = page.locator(OVERTIME_TIP);
    await expect(tip).toContainText('July 2024');
    await expect(tip).toContainText('402.8 hours');
    await expect(tip).not.toContainText('Needs review');
  });

  test('the tooltip follows the selected measure and its units', async ({ page }) => {
    await openOvertime(page);

    await page.getByLabel('Show', { exact: true }).selectOption('dollars');
    await page.getByRole('button', { name: /^February 2026\./ }).hover();
    let tip = page.locator(OVERTIME_TIP);
    await expect(tip).toContainText('Overtime dollars per month: $34,163.87');
    await expect(tip).toContainText('Monthly overtime budget: $22,000.00');
    await expect(tip).toContainText('Needs review');

    await page.getByLabel('Show', { exact: true }).selectOption('effective');
    await page.getByRole('button', { name: /^February 2026\./ }).hover();
    tip = page.locator(OVERTIME_TIP);
    await expect(tip).toContainText('Effective overtime hourly cost: $51.49');
    await expect(tip).not.toContainText('Monthly overtime budget');

    await page.getByLabel('Show', { exact: true }).selectOption('variance');
    await page.getByRole('button', { name: /^February 2026\./ }).hover();
    await expect(page.locator(OVERTIME_TIP)).toContainText('+$12,163.87');
  });

  test('keyboard reaches every month, with one tab stop', async ({ page }) => {
    await openOvertime(page);
    const first = page.locator('#panel-overtime .chart-target').first();
    await tabTo(page, first);

    const tip = page.locator(OVERTIME_TIP);
    await expect(tip).toContainText('July 2024');

    await page.keyboard.press('ArrowRight');
    await expect(tip).toContainText('August 2024');
    await page.keyboard.press('End');
    await expect(tip).toContainText('June 2026');
    await page.keyboard.press('ArrowLeft');
    await expect(tip).toContainText('May 2026');

    await page.keyboard.press('Escape');
    await expect(page.locator('#panel-overtime .chart-tooltip')).toBeHidden();

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.chart-overlay') !== null)).toBe(false);
  });

  test('a month with no value says so in words and is never shown as zero', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Which table').selectOption('overtime_records');
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
    await page.getByRole('button', { name: /^February 2026\./ }).hover();

    const tip = page.locator(OVERTIME_TIP);
    await expect(tip).toContainText('February 2026');
    await expect(tip).toContainText('Missing — no recorded value');
    await expect(tip).not.toContainText('0.0 hours');
    await expect(tip).not.toContainText('$0');
    await expect(page.locator('#panel-overtime line.chart__gap.is-active')).toHaveCount(1);

    await page.getByLabel('Show', { exact: true }).selectOption('effective');
    await page.getByRole('button', { name: /^February 2026\./ }).hover();
    await expect(page.locator(OVERTIME_TIP)).toContainText('Not enough comparable data');
  });
});

test.describe('stated-versus-calculated chart', () => {
  test('shows each bar with its value, a valid percentage and the signed difference', async ({ page }) => {
    await openStated(page);

    await page.getByRole('button', { name: /^Stated\./ }).hover();
    let tip = page.locator(STATED_TIP);
    await expect(tip).toContainText('$45,000.00');
    await expect(tip).toContainText('64.3% of the calculated amount');
    await expect(tip).toContainText('Difference (stated − calculated): -$25,000.00');

    await page.getByRole('button', { name: /^Calculated\./ }).hover();
    tip = page.locator(STATED_TIP);
    await expect(tip).toContainText('$70,000.00');
    await expect(tip).toContainText('Difference (stated − calculated): -$25,000.00');
    // The calculated amount is the denominator, so it gets no percentage of itself.
    await expect(tip).not.toContainText('%');
  });

  test('offers no interactive bars when the claim cannot be verified', async ({ page }) => {
    await openStated(page);
    await page.getByLabel('Load a fictional example').selectOption('CLAIM-3');
    await expect(page.getByRole('status')).toContainText('Cannot verify');
    await expect(page.locator('#panel-stated .chart-target')).toHaveCount(0);
    await expect(page.locator('#panel-stated .chart-tooltip')).toHaveCount(0);
  });

  test('keyboard moves between the two bars', async ({ page }) => {
    await openStated(page);
    const stated = page.getByRole('button', { name: /^Stated\./ });
    await tabTo(page, stated);
    await expect(page.locator(STATED_TIP)).toContainText('64.3% of the calculated amount');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /^Calculated\./ })).toBeFocused();
    await expect(page.locator(STATED_TIP)).toContainText('$70,000.00');
  });
});

test.describe('tooltip placement', () => {
  async function assertInsideViewport(page: Page, tipSelector: string) {
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport');
    const box = await page.locator(tipSelector).boundingBox();
    if (!box) throw new Error('tooltip has no box');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);

    const noSidewaysScroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1,
    );
    expect(noSidewaysScroll).toBe(true);
  }

  test('stays inside a wide viewport at both ends of the overtime chart', async ({ page }) => {
    await openOvertime(page);
    await page.locator('#panel-overtime .chart-target').first().hover();
    await assertInsideViewport(page, OVERTIME_TIP);
    await page.locator('#panel-overtime .chart-target').last().hover();
    await assertInsideViewport(page, OVERTIME_TIP);
  });

  test.describe('narrow screen', () => {
    test.use({ viewport: { width: 380, height: 800 } });

    test('stays inside a phone-width viewport at both ends of each chart', async ({ page }) => {
      await openOvertime(page);
      await page.locator('#panel-overtime .chart-target').first().hover();
      await assertInsideViewport(page, OVERTIME_TIP);
      await page.locator('#panel-overtime .chart-target').last().hover();
      await assertInsideViewport(page, OVERTIME_TIP);

      await page.getByRole('tab', { name: 'Compare proposals' }).click();
      await page.getByRole('button', { name: /Offer A · Base-pay increase/ }).hover();
      await assertInsideViewport(page, COMPARE_TIP);
      await page.locator('#panel-compare .chart-target').last().hover();
      await assertInsideViewport(page, COMPARE_TIP);

      await page.getByRole('tab', { name: 'Check a stated cost' }).click();
      await page.getByRole('button', { name: /^Calculated\./ }).hover();
      await assertInsideViewport(page, STATED_TIP);
    });
  });

  test('never intercepts the pointer, so it cannot block a control', async ({ page }) => {
    await openOvertime(page);
    await page.locator('#panel-overtime .chart-target').nth(12).hover();
    const tip = page.locator(OVERTIME_TIP);
    await expect(tip).toBeVisible();

    expect(await tip.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    const blocked = await tip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && hit.closest('.chart-tooltip') !== null;
    });
    expect(blocked).toBe(false);
  });
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('tap pins the tooltip; tapping it again or elsewhere dismisses it', async ({ page }) => {
    await page.goto('/');
    const a = page.getByRole('button', { name: /Offer A · Base-pay increase/ });
    const b = page.getByRole('button', { name: /Offer B · Base-pay increase/ });
    const tip = page.locator(COMPARE_TIP);

    await a.tap();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('$45,000.00');

    await b.tap();
    await expect(tip).toContainText('Offer B · Base-pay increase');
    await expect(tip).toContainText('$62,500.00');

    await b.tap();
    await expect(page.locator('#panel-compare .chart-tooltip')).toBeHidden();

    await a.tap();
    await expect(tip).toBeVisible();
    await page.locator('#panel-compare h2').tap();
    await expect(page.locator('#panel-compare .chart-tooltip')).toBeHidden();
  });

  test('tapping an overtime month shows the month, measure and review status', async ({ page }) => {
    await openOvertime(page);
    await page.getByRole('button', { name: /^February 2026\./ }).tap();
    const tip = page.locator(OVERTIME_TIP);
    await expect(tip).toContainText('February 2026');
    await expect(tip).toContainText('663.5 hours');
    await expect(tip).toContainText('Needs review');
  });

  test('tapping a stated-cost bar shows its value and the difference', async ({ page }) => {
    await openStated(page);
    await page.getByRole('button', { name: /^Stated\./ }).tap();
    const tip = page.locator(STATED_TIP);
    await expect(tip).toContainText('$45,000.00');
    await expect(tip).toContainText('-$25,000.00');
  });
});

test.describe('motion, print and accessibility', () => {
  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const seg = await page
      .locator('#panel-compare rect.seg')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(seg)).toBe(0);
    const tip = await page
      .locator('#panel-compare .chart-tooltip')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(tip)).toBe(0);

    await openOvertime(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const halo = await page
      .locator('#panel-overtime .chart__halo')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(halo)).toBe(0);
  });

  test('hides tooltips and the interaction layer in print', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Offer A · Base-pay increase/ }).hover();
    await expect(page.locator(COMPARE_TIP)).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    const display = await page.evaluate(() => ({
      tooltip: getComputedStyle(document.querySelector('#panel-compare .chart-tooltip') as Element).display,
      overlay: getComputedStyle(document.querySelector('#panel-compare .chart-overlay') as Element).display,
    }));
    expect(display).toEqual({ tooltip: 'none', overlay: 'none' });
  });

  test('has no detectable accessibility violations with a tooltip open on each chart', async ({ page }) => {
    await page.goto('/');

    const scan = async (view: string) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
        .join('\n');
      expect(summary, view).toBe('');
    };

    await page.getByRole('button', { name: /Offer A · Base-pay increase/ }).hover();
    await expect(page.locator(COMPARE_TIP)).toBeVisible();
    await expect(page.locator(COMPARE_TIP)).toHaveCSS('opacity', '1');
    await scan('compare');

    await page.getByRole('tab', { name: 'Review overtime' }).click();
    await page.getByRole('button', { name: /^February 2026\./ }).hover();
    await expect(page.locator(OVERTIME_TIP)).toHaveCSS('opacity', '1');
    await scan('overtime');

    await page.getByRole('tab', { name: 'Check a stated cost' }).click();
    await page.getByRole('button', { name: /^Stated\./ }).hover();
    await expect(page.locator(STATED_TIP)).toHaveCSS('opacity', '1');
    await scan('stated');
  });
});
