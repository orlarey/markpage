import { expect, test, type Page } from './fixtures';

/**
 * Purpose: End-to-end verification that switching `marginMode` to
 *   'derived' propagates the Van de Graaf canonical margins to the
 *   rendered preview — i.e. paged.js lays out pages with the text
 *   block at the position dictated by `measureChars` and the body
 *   font, not by the four manual sliders.
 * How: Use the "Rapport" preset (which enables marginMode='derived'
 *   with measureChars=66, liveAreaChars=85 — the canonical example
 *   from SPEC §9.6) and inspect the .pagedjs_page_content horizontal offset
 *   on page 1. The text block width should match 66 × canvas-
 *   measured charWidth, leaving the inner margin at ~ (210 − text) / 3.
 *
 *   With a real canvas the chromium font fallback is close enough to
 *   the 0.5 em heuristic that the inner margin lands in [20, 40] mm
 *   on A4 / 11 pt, which is well above the manual default of 35 mm
 *   for the right side, so the test is not just a no-op.
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
}

async function readPage1Geometry(page: Page) {
  return page.evaluate(() => {
    const p = document.querySelector('.pagedjs_page') as HTMLElement | null;
    if (!p) return null;
    const area = p.querySelector('.pagedjs_page_content') as HTMLElement | null;
    const pRect = p.getBoundingClientRect();
    const aRect = area?.getBoundingClientRect();
    return aRect && pRect
      ? {
          leftOffsetPx: aRect.left - pRect.left,
          widthPx: aRect.width,
          pageWidthPx: pRect.width,
        }
      : null;
  });
}

test('manual mode honours the four mm margins on the preview', async ({
  page,
}) => {
  await page.goto('/');
  // marginMode is 'derived' by default now (it changed with the settings /
  // recipe work), so manual mode has to be SELECTED before its four mm
  // sliders mean anything — they are disabled otherwise.
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings
    .getByText('Mode des marges', { exact: true })
    .locator('xpath=following-sibling::select')
    .selectOption('manual');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  const g = await readPage1Geometry(page);
  expect(g).not.toBeNull();
  // Compare RATIOS, never absolute px: the preview applies a fit-to-width
  // zoom (--mp-fit-zoom), so a pixel budget silently depends on the pane
  // width. Manual margins are 35 mm on A4 (210 mm) = 16.7%.
  const leftRatio = g!.leftOffsetPx / g!.pageWidthPx;
  expect(leftRatio).toBeGreaterThan(0.15);
  expect(leftRatio).toBeLessThan(0.185);
});

test('derived mode (Rapport preset) yields canonical asymmetric margins', async ({
  page,
}) => {
  await page.goto('/');
  // Apply the "Rapport" preset which sets marginMode='derived',
  // measureChars=66, liveAreaChars=85, duplex=false, chapterBreak='none',
  // notes.position='foot'.
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  const presetSelect = settings.getByText('Préréglage').locator('xpath=following-sibling::select');
  await presetSelect.selectOption({ label: 'Rapport' });

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  // Give paged.js a moment after the settings change to repaginate.
  await page.waitForTimeout(500);

  const g = await readPage1Geometry(page);
  expect(g).not.toBeNull();

  // The Van de Graaf canonical text block places the inner margin and
  // the outer margin in the ratio 1:2 (§9.6.4) — strictly different.
  // This is the signature of derived mode: manual default is 35/35
  // (symmetric), derived gives inner < outer regardless of font.
  const leftOffsetPx = g!.leftOffsetPx;
  const rightOffsetPx = g!.pageWidthPx - leftOffsetPx - g!.widthPx;
  // Inner (= left on the recto, default treatment) must be strictly
  // smaller than outer.
  expect(leftOffsetPx).toBeLessThan(rightOffsetPx);
  // The ratio target is 2 (outer / inner). Loose tolerance because of
  // sub-pixel rounding and the canvas-measured charWidth diverging
  // from the 0.5 em heuristic on whatever font is actually loaded.
  expect(rightOffsetPx / leftOffsetPx).toBeGreaterThan(1.5);
  expect(rightOffsetPx / leftOffsetPx).toBeLessThan(2.5);
});
