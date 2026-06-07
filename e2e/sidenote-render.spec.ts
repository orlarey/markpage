import { expect, test, type Page } from '@playwright/test';

/**
 * Purpose: End-to-end verification that the `notes.position: 'side'`
 *   layout actually places sidenote spans in the outer gutter of the
 *   live area at the height of their anchor (SPEC §9.7 — Tufte-CSS
 *   approach). Cross-checks two facts:
 *     1. In default `foot` mode, sidenote spans are present in the
 *        DOM but invisible (display: none).
 *     2. In `side` mode (via the "Édition critique" preset), the
 *        section.footnotes is hidden, the sidenote is visible and
 *        positioned to the right of its containing paragraph (or
 *        to the left on a verso page if duplex is on).
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
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached' });
  // The doc-tail section.footnotes only attaches once paged.js has
  // flowed all the content — wait until pagination is complete.
  await page.waitForFunction(
    () => document.querySelectorAll('section.footnotes').length > 0,
    null,
    { timeout: 30_000 },
  );
}

/** Inject a small doc with a footnote at the start of the editor so we
 *  can drive the sidenote layout without depending on whatever the HELP
 *  doc happens to have. Prepended to the existing content (we keep the
 *  default doc around so the preview spans multiple pages and we have
 *  a real live area to measure against). */
async function injectFootnoteDoc(page: Page): Promise<void> {
  const PREFIX =
    'A line with a footnote anchor[^a].\n\n' +
    '[^a]: This is the sidenote body, short.\n\n';
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.evaluate(async (t) => {
    await navigator.clipboard.writeText(t);
  }, PREFIX);
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(600);
}

test('foot mode: sidenote spans are present in the DOM but hidden', async ({ page }) => {
  await page.goto('/');
  await injectFootnoteDoc(page);
  await page.locator('button.preview-toggle').click();
  await waitForRender(page);

  // The sidenote span exists (footnoteRef renderer emits it always).
  const present = await page.locator('.sidenote').count();
  expect(present).toBeGreaterThan(0);

  // It's display: none.
  const display = await page
    .locator('.sidenote')
    .first()
    .evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe('none');

  // The document-tail section.footnotes IS visible.
  const sec = page.locator('section.footnotes');
  expect(await sec.count()).toBeGreaterThan(0);
  const secDisplay = await sec.first().evaluate((el) => getComputedStyle(el).display);
  expect(secDisplay).not.toBe('none');
});

test("side mode (Édition critique preset): sidenote visible at right of its anchor's paragraph", async ({
  page,
}) => {
  await page.goto('/');
  await injectFootnoteDoc(page);

  // Apply the "Édition critique" preset which bundles
  //   marginMode='derived', measureChars=52, liveAreaChars=85,
  //   duplex=true, chapterBreak='next-recto', notes.position='side'.
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings.getByText('Préréglage').locator('xpath=following-sibling::select').selectOption({ label: 'Édition critique' });

  await page.locator('button.preview-toggle').click();
  await waitForRender(page);
  await page.waitForTimeout(700);

  // Sidenote is now visible.
  const display = await page
    .locator('.sidenote')
    .first()
    .evaluate((el) => getComputedStyle(el).display);
  expect(display).not.toBe('none');

  // section.footnotes is hidden in side mode.
  const sec = page.locator('section.footnotes');
  const secDisplay = await sec.first().evaluate((el) => getComputedStyle(el).display);
  expect(secDisplay).toBe('none');

  // Position check: on a recto page (page 0), the sidenote sits to
  // the right of its anchor's containing paragraph. Read the sidenote
  // and the host paragraph; assert the sidenote's left edge is past
  // the paragraph's right edge.
  const geometry = await page.evaluate(() => {
    const sn = document.querySelector('.pagedjs_right_page .sidenote');
    if (!sn) return null;
    const host = sn.closest('p, li, blockquote');
    if (!host) return null;
    const snRect = sn.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    return {
      snLeft: snRect.left,
      hostRight: hostRect.right,
      gap: snRect.left - hostRect.right,
    };
  });
  expect(geometry).not.toBeNull();
  // Sidenote left edge must be to the RIGHT of the paragraph's right
  // edge (positive gap), i.e. landed in the outer gutter.
  expect(geometry!.gap).toBeGreaterThan(0);
});
