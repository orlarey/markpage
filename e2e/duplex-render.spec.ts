import { expect, test, type Page } from '@playwright/test';

/**
 * Purpose: End-to-end verification that toggling `duplex` in the
 *   Settings UI mirrors the page margins on even pages — the
 *   user-visible effect of §9.5.2.
 * How: Set asymmetric margins (20mm left, 50mm right) so the mirror
 *   is observable, open the preview, and inspect the `.pagedjs_area`
 *   horizontal offset on the first two pages. In simplex it must be
 *   identical (every page is treated as recto); in duplex the verso
 *   page must shift to the mirrored position (offset ≈ 50mm).
 *
 *   Pixel math at the 96 DPI Vite/Chromium default:
 *     20mm × 3.7795 px/mm ≈ 75.6 px
 *     50mm × 3.7795 px/mm ≈ 188.97 px
 *   We assert with a generous tolerance to cover sub-pixel layout
 *   rounding without being so loose the test no longer guards
 *   anything.
 */

async function openSettings(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('button.menu-trigger', { hasText: 'Réglages' }).click();
  const settingsPage = await popupPromise;
  await settingsPage.waitForLoadState();
  return settingsPage;
}

async function setAsymmetricMargins(settings: Page): Promise<void> {
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  const left = settings
    .getByText('Gauche', { exact: true })
    .locator('xpath=following-sibling::input');
  const right = settings
    .getByText('Droite', { exact: true })
    .locator('xpath=following-sibling::input');
  await left.fill('20');
  await left.blur();
  await right.fill('50');
  await right.blur();
}

/** Read `.pagedjs_area.left − .pagedjs_page.left` for the first N pages. */
async function readAreaOffsets(page: Page, n: number): Promise<number[]> {
  return page.evaluate((count) => {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page')).slice(
      0,
      count,
    );
    return pages.map((p) => {
      const area = p.querySelector('.pagedjs_area') as HTMLElement | null;
      const aRect = area?.getBoundingClientRect();
      const pRect = p.getBoundingClientRect();
      return aRect && pRect ? aRect.left - pRect.left : NaN;
    });
  }, n);
}

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 30_000 });
  await page.locator('.pagedjs_page').nth(1).waitFor({
    state: 'attached',
    timeout: 30_000,
  });
}

test('simplex (default) keeps the page-2 content area at the same x as page 1', async ({
  page,
}) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await setAsymmetricMargins(settings);
  await page.locator('button.preview-toggle').click();
  await waitForRender(page);

  const offsets = await readAreaOffsets(page, 2);
  // 20mm ≈ 75.6 px — both pages should be at this offset (within rounding).
  expect(offsets[0]).toBeGreaterThan(60);
  expect(offsets[0]).toBeLessThan(90);
  expect(Math.abs(offsets[0] - offsets[1])).toBeLessThan(2);
});

test('duplex mirrors the page-2 content area to the verso position', async ({
  page,
}) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await setAsymmetricMargins(settings);

  // Enable duplex.
  await settings.getByRole('button', { name: 'Mise en page', exact: true }).click();
  const duplexCheckbox = settings
    .getByText('Recto-verso')
    .locator('xpath=following-sibling::input');
  await duplexCheckbox.check();

  await page.locator('button.preview-toggle').click();
  await waitForRender(page);

  const offsets = await readAreaOffsets(page, 2);
  // Page 1 (recto): nominal margin-left = 20mm → ~76 px.
  expect(offsets[0]).toBeGreaterThan(60);
  expect(offsets[0]).toBeLessThan(90);
  // Page 2 (verso): mirrored margin-left = margin-right = 50mm → ~189 px.
  expect(offsets[1]).toBeGreaterThan(170);
  expect(offsets[1]).toBeLessThan(210);
});
