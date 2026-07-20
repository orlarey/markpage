import { expect, test, type Page } from './fixtures';

/**
 * Purpose: End-to-end check of the §9.7.5 margin-figure rendering.
 *   Asserts that an image written `![alt](url){.margin}` ends up:
 *     - in the default layout: rendered inline (the `{.margin}` class
 *       is harmless without the sidenote infrastructure activated);
 *     - in side mode (Édition critique preset): positioned in the
 *       outer gutter, sharing the same absolute layout as the
 *       `.sidenote` spans.
 * How: Inject a small doc with one `{.margin}` image at the top of the
 *   editor (we use a tiny inline `data:` URL so the test doesn't
 *   depend on the network), then read back the rendered `<img.margin>`
 *   bounding rect and compare to the paragraph that hosts it.
 */

// A 1×1 black PNG, base64. Lets the test render an actual <img> with
// real layout dimensions without hitting the filesystem or network.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=';

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

async function injectMarginFigureDoc(page: Page): Promise<void> {
  // Tag the alt with `MP_MARGIN_FIG` so we can identify our image
  // among the other images on the rendered page (showcase, etc.).
  const PREFIX = `Some text mentioning a figure: ![MP_MARGIN_FIG](${PIXEL_PNG}){.margin}.\n\n`;
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.evaluate(async (t) => {
    await navigator.clipboard.writeText(t);
  }, PREFIX);
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(600);
}

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 90_000 });
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached', timeout: 90_000 });
  // Wait for at least one of our tagged figures to be attached.
  await page.waitForFunction(
    () => document.querySelectorAll('img.margin[alt="MP_MARGIN_FIG"]').length > 0,
    null,
    { timeout: 30_000 },
  );
}

test('default mode: the margin image renders inline (no absolute layout)', async ({ page }) => {
  await page.goto('/');
  await injectMarginFigureDoc(page);
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  const computed = await page
    .locator('img.margin[alt="MP_MARGIN_FIG"]')
    .first()
    .evaluate((el) => getComputedStyle(el).position);
  // Inline default: no `position: absolute` rule applied.
  expect(computed).toBe('static');
});

test("side mode: img.margin is positioned absolute in the outer gutter", async ({ page }) => {
  await page.goto('/');
  await injectMarginFigureDoc(page);

  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings.getByText('Préréglage').locator('xpath=following-sibling::select').selectOption({ label: 'Édition critique' });

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  await page.waitForTimeout(700);

  // The image is now positioned absolute.
  const position = await page
    .locator('.pagedjs_right_page img.margin[alt="MP_MARGIN_FIG"]')
    .first()
    .evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('absolute');

  // It lands to the right of its host paragraph (in the outer gutter).
  const geometry = await page.evaluate(() => {
    const img = document.querySelector(
      '.pagedjs_right_page img.margin[alt="MP_MARGIN_FIG"]',
    );
    if (!img) return null;
    const host = img.closest('p, li, blockquote');
    if (!host) return null;
    const imgRect = img.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    return { imgLeft: imgRect.left, hostRight: hostRect.right };
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.imgLeft).toBeGreaterThan(geometry!.hostRight);
});
