import { expect, test, type Page } from './fixtures';

/**
 * Purpose: End-to-end verification that the three `notes.position`
 *   modes wire the right rendering:
 *     - 'foot' (default): paged.js's `float: footnote` moves each
 *       `.sidenote` into the per-page `.pagedjs_footnote_area`; the
 *       document-tail `section.footnotes` is hidden.
 *     - 'side' (Édition critique preset): the `.sidenote` span sits
 *       absolutely in the outer gutter at the height of its anchor;
 *       the body `.footnote-ref` superscript stays visible (back-link
 *       anchor) and the document-tail section is hidden.
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
  // Pagination is complete when paged.js has flowed the trailing
  // section.footnotes into the DOM — even in foot/side modes where
  // we hide it visually, it's still inserted by the chunker.
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

test('foot mode (default): sidenote lands in the per-page .pagedjs_footnote_area, document-tail section is hidden', async ({ page }) => {
  await page.goto('/');
  await injectFootnoteDoc(page);
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  // paged.js consumed `float: footnote` and moved the .sidenote
  // element into the page's footnote area. Wait for that to happen.
  await page.waitForFunction(
    () => document.querySelectorAll('.pagedjs_footnote_area .sidenote').length > 0,
    null,
    { timeout: 30_000 },
  );

  const inFootArea = await page.locator('.pagedjs_footnote_area .sidenote').count();
  expect(inFootArea).toBeGreaterThan(0);

  // The footnote element sits on the SAME page as its anchor (paged.js
  // pairs the footnote-call and the moved element per page).
  const sameAsAnchor = await page.evaluate(() => {
    const foot = document.querySelector('.pagedjs_footnote_area .sidenote');
    const call = document.querySelector('[data-footnote-call]');
    if (!foot || !call) return false;
    const footPage = foot.closest('.pagedjs_page');
    const callPage = call.closest('.pagedjs_page');
    return footPage !== null && footPage === callPage;
  });
  expect(sameAsAnchor).toBe(true);

  // The document-tail section.footnotes is hidden (paged.js is
  // authoritative for the body in foot mode).
  const sec = page.locator('section.footnotes');
  expect(await sec.count()).toBeGreaterThan(0);
  const secDisplay = await sec.first().evaluate((el) => getComputedStyle(el).display);
  expect(secDisplay).toBe('none');
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

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
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

  // Body anchor superscript stays visible in side mode (it's the
  // back-link to the sidenote — Tufte convention shows the number
  // both as the in-body anchor AND at the start of the note).
  const refDisplay = await page
    .locator('.footnote-ref')
    .first()
    .evaluate((el) => getComputedStyle(el).display);
  expect(refDisplay).not.toBe('none');

  // The in-sidenote `.sidenote-num` superscript carries the SAME
  // number as the body anchor.
  const numsMatch = await page.evaluate(() => {
    const sup = document.querySelector('.footnote-ref');
    const sideNum = document.querySelector('.sidenote .sidenote-num');
    if (!sup || !sideNum) return null;
    return { body: sup.textContent?.trim(), side: sideNum.textContent?.trim() };
  });
  expect(numsMatch).not.toBeNull();
  expect(numsMatch!.body).toBe(numsMatch!.side);

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
