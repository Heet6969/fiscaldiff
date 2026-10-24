/** Display-brand checks: title, header, tagline, report, export, attribution. */
import { expect, test } from '@playwright/test';

const TAGLINE = 'Understand workforce costs. Explain every difference.';

test.describe('branding', () => {
  test('the browser title renders correctly, with no encoding damage', async ({ page }) => {
    await page.goto('/');
    // Read from the browser itself, not from terminal output.
    const title = await page.title();
    expect(title).toBe('CivicVariance — Workforce budget impact (synthetic demo data)');
    expect(title).not.toMatch(/â|Â|Ã|�/);
    expect(title).not.toContain('FiscalDiff');
  });

  test('the header shows the name, tagline, synthetic label and the three views', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'CivicVariance — workforce budget impact',
    );
    await expect(page.locator('.site-header')).toContainText(TAGLINE);
    await expect(page.getByTestId('synthetic-badge')).toHaveText(/Synthetic demo data/);

    for (const view of ['Compare proposals', 'Review overtime', 'Check a stated cost']) {
      await page.getByRole('tab', { name: view }).click();
      await expect(page.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }
  });

  test('the footer keeps the event attribution', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer').last()).toContainText(
      'Built at Sundai — Hackachusetts 2026.',
    );
  });

  test('the printable report uses the new name and keeps its labels', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open printable summary' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'CivicVariance — workforce budget impact summary',
    );
    await expect(page.getByText(TAGLINE)).toBeVisible();
    await expect(page.getByText('CivicVariance — prototype, synthetic data only')).toBeVisible();
    await expect(page.getByText(/All figures below are fictional/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('FiscalDiff');
  });

  test('the CSV export carries the new name', async ({ page }) => {
    await page.goto('/');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export calculation breakdown (CSV)' }).click();
    const file = await download;

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');

    expect(text.split('\n')[0]).toBe('CivicVariance — calculation breakdown');
    expect(text).toContain(TAGLINE);
    expect(text).toContain('Synthetic demo data');
    expect(text).not.toContain('FiscalDiff');
  });
});
