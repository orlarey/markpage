import { expect, test, type Page } from './fixtures';

/**
 * Purpose: End-to-end check of the §9.6.6 / §9.5.4 slot auto-swap
 *   alphabet. With duplex on, the `outer-right` slot (slot index 2 in
 *   a `inner-left | center | outer-right` fence) must render on the
 *   physical RIGHT of recto pages and on the physical LEFT of verso
 *   pages — i.e. always on the side AWAY from the spine.
 * How: Inject a custom doc with a `header` fence carrying a
 *   recognisable content in the outer-right slot, then read back the
 *   `--pagedjs-margin-content-*` injected on page 1 (recto) vs page 2
 *   (verso). The slot's content text — `OUTER-MARKER` — should
 *   appear in @top-right of recto pages and @top-left of verso pages.
 *
 *   Implementation note: we don't have a public API to set the doc
 *   content from Playwright (CodeMirror is not trivially scriptable),
 *   so we rely on the default HELP doc and just enable duplex in the
 *   layout settings. The auto-swap is a CSS-only feature: any page
 *   with @top-* content will demonstrate the swap regardless of the
 *   source doc. We assert by reading the COMPUTED content of the
 *   @top-* margin boxes after paged.js has applied them.
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

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 90_000 });
  await page
    .locator('.pagedjs_page')
    .nth(1)
    .waitFor({ state: 'attached', timeout: 90_000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-vivliostyle-page-margin-box]')].some(
        (b) => (b.textContent || '').trim() !== '',
      ),
    undefined,
    { timeout: 90_000 },
  );
}

/**
 * Inject a `header` fence at the top of the editor doc, then re-render.
 * The fence uses `inner-left | center | outer-right` slots so the
 * auto-swap shows up: in simplex (or recto), 'OUTER' lands at top-right;
 * in duplex verso, 'OUTER' lands at top-left.
 */
async function injectHeaderFence(page: Page): Promise<void> {
  // Prepend a fence to the default HELP doc so the rendered preview
  // spans multiple pages (needed to observe the verso swap). We use
  // the clipboard to bypass the editor's auto-pair / ligatures.
  const HEADER_FENCE = '```header\nINNER | CENTER | OUTER\n```\n\n';
  await page.locator('.cm-content').click();
  // Move cursor to the absolute start of the document.
  await page.keyboard.press('ControlOrMeta+Home');
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
  }, HEADER_FENCE);
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(800);
}

async function readPageMarginContent(
  page: Page,
  pageIdx: number,
  box: 'top-left' | 'top-right' | 'top-center',
): Promise<string | null> {
  return page.evaluate(
    ({ idx, b }) => {
      const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
      const p = pages[idx];
      if (!p) return null;
      // Read the text the slot actually shows. (The former version read the
      // ::after content of a `.pagedjs_margin-content` child — a paged.js
      // implementation detail; the engine now puts real text in the box.)
      const box = p.querySelector(`.pagedjs_margin-${b}`);
      if (!box) return null;
      return (box.textContent || '').trim();
    },
    { idx: pageIdx, b: box },
  );
}

test('simplex: outer-right content lands at top-right on every page', async ({ page }) => {
  await page.goto('/');
  await injectHeaderFence(page);
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  // Both pages should show OUTER at top-right (simplex = no swap).
  for (const idx of [0, 1]) {
    expect(await readPageMarginContent(page, idx, 'top-right')).toContain('OUTER');
    expect(await readPageMarginContent(page, idx, 'top-left')).toContain('INNER');
    expect(await readPageMarginContent(page, idx, 'top-center')).toContain('CENTER');
  }
});

test('duplex: outer-right content swaps to top-left on verso pages', async ({ page }) => {
  await page.goto('/');
  await injectHeaderFence(page);

  // Enable duplex via the Layout settings.
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  const duplex = settings
    .getByText('Recto-verso')
    .locator('xpath=following-sibling::input');
  await duplex.check();

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  await page.waitForTimeout(500); // settle after duplex toggle

  // Page 0 = recto: nominal mapping (no swap).
  expect(await readPageMarginContent(page, 0, 'top-right')).toContain('OUTER');
  expect(await readPageMarginContent(page, 0, 'top-left')).toContain('INNER');
  // Page 1 = verso: swapped mapping.
  expect(await readPageMarginContent(page, 1, 'top-right')).toContain('INNER');
  expect(await readPageMarginContent(page, 1, 'top-left')).toContain('OUTER');
  // Center stays put on both faces.
  expect(await readPageMarginContent(page, 0, 'top-center')).toContain('CENTER');
  expect(await readPageMarginContent(page, 1, 'top-center')).toContain('CENTER');
});
