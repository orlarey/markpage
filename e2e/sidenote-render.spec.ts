import { expect, test, type Page } from './fixtures';

/**
 * Purpose: End-to-end verification that the three `notes.position`
 *   modes wire the right rendering:
 *     - 'foot' (default): the engine's native `float: footnote` moves each
 *       `.sidenote` to the foot of the page carrying its anchor.
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
  // The popup opens on the « Essentiel » single-page form; the rail with the
  // per-domain items only exists in « Avancé ».
  await settingsPage.getByRole('button', { name: 'Avancé', exact: true }).click();
  return settingsPage;
}

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 90_000 });
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached', timeout: 90_000 });
  // Pagination is complete once the note body has been placed on a page.
  await page.waitForFunction(
    () => document.querySelectorAll('.pagedjs_page .sidenote').length > 0,
    null,
    { timeout: 90_000 },
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

test('foot mode (default): the note body sits at the foot of the page carrying its anchor', async ({ page }) => {
  await page.goto('/');
  await injectFootnoteDoc(page);
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  // The note is rendered exactly once — placed on a page, not also left
  // behind at the document tail.
  expect(await page.locator('.sidenote').count()).toBe(1);

  // It sits on the SAME page as its anchor, and BELOW the anchor's
  // paragraph: that pair is what "footnote" means, and it is what the
  // former `.pagedjs_footnote_area` selector was standing in for.
  const r = await page.evaluate(() => {
    const note = document.querySelector('.sidenote');
    if (!note) return null;
    // Anchor the assertion on the anchor PARAGRAPH's text rather than on a
    // call-marker selector: the engine generates the call itself, so any
    // selector for it is an engine internal.
    const host = [...document.querySelectorAll('p')].find((p) =>
      (p.textContent || '').includes('A line with a footnote anchor'),
    );
    if (!host) return null;
    const notePage = note.closest('.pagedjs_page');
    return {
      samePage: notePage !== null && notePage === host.closest('.pagedjs_page'),
      below: note.getBoundingClientRect().top > host.getBoundingClientRect().top,
    };
  });
  expect(r).not.toBeNull();
  expect(r!.samePage).toBe(true);
  expect(r!.below).toBe(true);
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

  // The note is rendered once, in the gutter — not duplicated at the
  // document tail.
  expect(await page.locator('.sidenote').count()).toBe(1);

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
