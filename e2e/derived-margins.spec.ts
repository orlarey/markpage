import { expect, test, type Page } from '@playwright/test';

/**
 * Purpose: End-to-end verification that switching `marginMode` to
 *   'derived' propagates the Van de Graaf canonical margins to the
 *   rendered preview — i.e. paged.js lays out pages with the text
 *   block at the position dictated by `measureChars` and the body
 *   font, not by the four manual sliders.
 * How: Use the "Rapport" preset (which enables marginMode='derived'
 *   with measureChars=66, liveAreaChars=85 — the canonical example
 *   from SPEC §9.6) and inspect the .pagedjs_area horizontal offset
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
  return settingsPage;
}

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 30_000 });
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached' });
}

async function readPage1Geometry(page: Page) {
  return page.evaluate(() => {
    const p = document.querySelector('.pagedjs_page') as HTMLElement | null;
    if (!p) return null;
    const area = p.querySelector('.pagedjs_area') as HTMLElement | null;
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

test('manual mode (default) keeps the user margins on the preview', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  const g = await readPage1Geometry(page);
  expect(g).not.toBeNull();
  // Default margins are 35 mm left/right on A4 (210 mm), so the text
  // block is 140 mm wide. At 96 DPI: 35 mm ≈ 132.3 px, 140 mm ≈ 529.1 px.
  expect(g!.leftOffsetPx).toBeGreaterThan(125);
  expect(g!.leftOffsetPx).toBeLessThan(140);
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
