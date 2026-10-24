/** Narrow-viewport layout: body content must not scroll sideways. */
import { expect, test } from '@playwright/test';

test.describe('narrow screen', () => {
  for (const view of ['Compare proposals', 'Review overtime', 'Check a stated cost'] as const) {
    test(`${view} fits a 380px viewport without horizontal page scroll`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('tab', { name: view }).click();

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      // Wide data tables scroll inside their own container, not the page.
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('wide tables scroll within their own container', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Review overtime' }).click();

    const wrap = page.locator('.table-wrap').first();
    const scrollable = await wrap.evaluate((el) => getComputedStyle(el).overflowX);
    expect(scrollable).toBe('auto');
  });

  test('the three tabs remain reachable', async ({ page }) => {
    await page.goto('/');
    for (const view of ['Compare proposals', 'Review overtime', 'Check a stated cost'] as const) {
      await expect(page.getByRole('tab', { name: view })).toBeVisible();
    }
  });
});
