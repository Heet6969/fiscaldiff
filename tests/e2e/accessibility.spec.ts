/**
 * Automated accessibility checks.
 *
 * These catch machine-detectable problems. They are not a claim of full WCAG
 * conformance, which also needs assistive-technology testing and expert review.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const VIEWS = ['Compare proposals', 'Review overtime', 'Check a stated cost'] as const;

test.describe('accessibility', () => {
  for (const view of VIEWS) {
    test(`${view} has no detectable WCAG A/AA violations`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('tab', { name: view }).click();
      await expect(page.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const summary = results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)
        .join('\n');
      expect(summary, summary).toBe('');
    });
  }

  test('the printable summary has no detectable violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open printable summary' }).click();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const summary = results.violations.map((v) => `${v.id}: ${v.help}`).join('\n');
    expect(summary, summary).toBe('');
  });

  test('import errors are announced and have no detectable violations', async ({ page }) => {
    await page.goto('/');
    await page
      .getByLabel('Import a CSV file')
      .setInputFiles('public/fixtures/invalid-imports/overtime-invalid-date.csv');

    // The table selector defaults to employees, so this file fails on columns.
    await expect(page.getByRole('alert')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const summary = results.violations.map((v) => `${v.id}: ${v.help}`).join('\n');
    expect(summary, summary).toBe('');
  });

  test('tabs are operable with the keyboard and move focus', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: 'Compare proposals' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Review overtime' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Review overtime' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Check a stated cost' })).toBeFocused();

    // Wraps around.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Compare proposals' })).toBeFocused();

    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Check a stated cost' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Compare proposals' })).toBeFocused();
  });

  test('the whole form is reachable by keyboard with a visible focus ring', async ({ page }) => {
    await page.goto('/');

    const raise = page.getByRole('group', { name: /Offer A/ }).getByLabel('Base-pay raise (percent)');
    await raise.focus();
    await expect(raise).toBeFocused();

    const outline = await raise.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    // Tabbing forward reaches the next control rather than a dead end.
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'A', 'SUMMARY']).toContain(focusedTag);
  });

  test('every input has an accessible name', async ({ page }) => {
    await page.goto('/');

    for (const view of VIEWS) {
      await page.getByRole('tab', { name: view }).click();
      const unnamed = await page.evaluate(() => {
        const controls = Array.from(
          document.querySelectorAll('input, select, textarea'),
        ) as HTMLElement[];
        return controls
          .filter((el) => {
            if (el.getAttribute('type') === 'hidden') return false;
            const id = el.getAttribute('id');
            const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
            const aria =
              el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby') ?? '';
            return !hasLabel && aria.trim() === '' && !el.closest('label');
          })
          .map((el) => `${el.tagName}#${el.id || '(no id)'}`);
      });
      expect(unnamed, `${view}: ${unnamed.join(', ')}`).toEqual([]);
    }
  });

  test('a validation message is tied to its input', async ({ page }) => {
    await page.goto('/');

    const bonus = page
      .getByRole('group', { name: /Offer A/ })
      .getByLabel('One-time bonus per eligible employee');
    await bonus.fill('oops');

    await expect(bonus).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await bonus.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const ids = (describedBy ?? '').split(' ').filter(Boolean);
    const texts = await Promise.all(ids.map((id) => page.locator(`#${id}`).innerText()));
    expect(texts.join(' ')).toMatch(/Enter a dollar amount/);
  });

  test('status meaning is carried by text, not colour alone', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();

    const flag = page.locator('.flag').first();
    await expect(flag.locator('.flag__status')).toHaveText('Needs review');
    await expect(flag).toContainText('Threshold:');
    await expect(flag).toContainText('Comparison:');
  });

  test('incomplete-input warnings are visible rather than collapsed', async ({ page }) => {
    await page.goto('/');

    await page
      .getByRole('group', { name: /Offer A/ })
      .getByLabel('Bonus payment date')
      .fill('');

    const notice = page.getByRole('note', { name: /Partial estimate/ });
    await expect(notice).toBeVisible();

    // Not inside a collapsed disclosure.
    const insideClosedDetails = await notice.evaluate((el) => {
      const details = el.closest('details');
      return details ? !details.open : false;
    });
    expect(insideClosedDetails).toBe(false);
  });

  test('detailed assumptions start collapsed', async ({ page }) => {
    await page.goto('/');
    const disclosure = page.locator('details.disclosure').first();
    await expect(disclosure).not.toHaveAttribute('open', '');
  });
});
