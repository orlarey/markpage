import { expect, test, type Page } from './fixtures';

/**
 * Purpose: End-to-end verification that toggling `duplex` in the
 *   Settings UI mirrors the page margins on even pages — the
 *   user-visible effect of §9.5.2.
 * How: Set asymmetric margins (20mm left, 50mm right) so the mirror
 *   is observable, open the preview, and inspect the `.pagedjs_page_content`
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
  // The popup opens on the « Essentiel » single-page form; the rail with the
  // per-domain items only exists in « Avancé ».
  await settingsPage.getByRole('button', { name: 'Avancé', exact: true }).click();
  return settingsPage;
}

/** Select « Manuel (4 sliders) » so the four mm margin inputs become editable.
 *  The app's default marginMode is 'derived', which disables them — a spec that
 *  fills them without switching first just times out on a disabled input. */
async function selectManualMargins(settings: Page): Promise<void> {
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings
    .getByText('Mode des marges', { exact: true })
    .locator('xpath=following-sibling::select')
    .selectOption({ label: 'Manuel (4 sliders)' });
}

async function setAsymmetricMargins(settings: Page): Promise<void> {
  await selectManualMargins(settings);
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

/** The content area's left inset for the first N pages, as a FRACTION of the
 *  page width. The preview is rendered at a fit-to-width zoom, so absolute
 *  pixels are meaningless here: a 20 mm inset on A4 is 0.0952 of the page
 *  whatever the zoom, but 75.6 px only at 1:1. */
async function readAreaOffsetRatios(page: Page, n: number): Promise<number[]> {
  return page.evaluate((count) => {
    const pages = Array.from(document.querySelectorAll('.pagedjs_page')).slice(
      0,
      count,
    );
    return pages.map((p) => {
      const area = p.querySelector(
        '.pagedjs_page_content',
      ) as HTMLElement | null;
      const aRect = area?.getBoundingClientRect();
      const pRect = p.getBoundingClientRect();
      if (!aRect || !pRect || pRect.width === 0) return NaN;
      return (aRect.left - pRect.left) / pRect.width;
    });
  }, n);
}

/** 20 mm and 50 mm as fractions of A4's 210 mm width. */
const INSET_20MM = 20 / 210;
const INSET_50MM = 50 / 210;
const TOLERANCE = 0.02;

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 90_000 });
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
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  const offsets = await readAreaOffsetRatios(page, 2);
  // Both pages carry the same 20 mm left inset — simplex never mirrors.
  expect(offsets[0]).toBeCloseTo(INSET_20MM, 2);
  expect(Math.abs(offsets[0] - offsets[1])).toBeLessThan(TOLERANCE);
});

test('duplex mirrors the page-2 content area to the verso position', async ({
  page,
}) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await setAsymmetricMargins(settings);

  // Enable duplex.
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  const duplexCheckbox = settings
    .getByText('Recto-verso')
    .locator('xpath=following-sibling::input');
  await duplexCheckbox.check();

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  const offsets = await readAreaOffsetRatios(page, 2);
  // Page 1 (recto) keeps the nominal 20 mm left margin…
  expect(offsets[0]).toBeCloseTo(INSET_20MM, 2);
  // …while page 2 (verso) mirrors it: its left inset becomes the 50 mm right
  // margin. That swap is the whole point of duplex.
  expect(offsets[1]).toBeCloseTo(INSET_50MM, 2);
});
