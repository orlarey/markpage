import { expect, test, type Page } from '@playwright/test';

/**
 * Purpose: Verify the on-screen duplex spread — in duplex mode, the
 *   preview should lay out pages as facing pairs (verso left, recto
 *   right) instead of stacking them vertically.
 * How: Compare the bounding-box `top` of two consecutive pages: in
 *   simplex they're stacked (page 2 strictly below page 1), in duplex
 *   spread they're side-by-side (top values within a few px of each
 *   other for the verso/recto pair on rows 2+).
 */

async function openSettings(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('button.menu-trigger', { hasText: 'Réglages' }).click();
  const settingsPage = await popupPromise;
  await settingsPage.waitForLoadState();
  return settingsPage;
}

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 30_000 });
  // Need at least 3 pages so we have a verso/recto pair (page 0 = cover
  // recto, page 1 = first verso, page 2 = next recto — these two should
  // be side by side in duplex mode).
  await page
    .locator('.pagedjs_page')
    .nth(2)
    .waitFor({ state: 'attached', timeout: 30_000 });
}

async function readPageTops(page: Page, n: number): Promise<number[]> {
  return page.evaluate((count) => {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page')).slice(0, count);
    return pages.map((p) => p.getBoundingClientRect().top);
  }, n);
}

test('simplex (default): pages are stacked vertically', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  const tops = await readPageTops(page, 3);
  // Page 1 strictly below page 0 → stacking, not spread.
  expect(tops[1]).toBeGreaterThan(tops[0]);
  expect(tops[2]).toBeGreaterThan(tops[1]);
});

test('duplex: verso (page 1) and the next recto (page 2) share a row', async ({
  page,
}) => {
  await page.goto('/');
  // Enable duplex.
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  const duplex = settings
    .getByText('Recto-verso')
    .locator('xpath=following-sibling::input');
  await duplex.check();

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  // Settle after the duplex toggle re-paginates.
  await page.waitForTimeout(500);

  const tops = await readPageTops(page, 3);
  // Page 0 (cover) sits alone on the first row.
  // Pages 1 (verso) and 2 (recto) form the second row → their tops
  // should match within a few px (sub-pixel rendering tolerance).
  expect(Math.abs(tops[1] - tops[2])).toBeLessThan(8);
  // And they should both be below page 0.
  expect(tops[1]).toBeGreaterThan(tops[0]);
});
