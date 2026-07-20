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

test('derived mode, single-sided: the canonical block is CENTRED', async ({
  page,
}) => {
  await page.goto('/');
  // "Rapport" sets marginMode='derived', measureChars=66, liveAreaChars=85,
  // duplex=false.
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings
    .getByText('Préréglage')
    .locator('xpath=following-sibling::select')
    .selectOption({ label: 'Rapport' });

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  await page.waitForTimeout(500);

  const g = await readPage1Geometry(page);
  expect(g).not.toBeNull();
  const left = g!.leftOffsetPx;
  const right = g!.pageWidthPx - left - g!.widthPx;

  // This assertion used to demand the 1:2 asymmetry here, and failed. It was
  // wrong, not the app: a single-sided document has no spine, so
  // centerCanonicalHorizontally() centres the canonical rectangles and keeps
  // the classical inner/outer asymmetry for facing pages only. Simplex derived
  // margins are therefore EQUAL by design.
  expect(Math.abs(left - right) / g!.pageWidthPx).toBeLessThan(0.01);

  // Still unmistakably the canon rather than the manual 35 mm default
  // (= 16.7% of A4): the derived block is markedly wider.
  expect(left / g!.pageWidthPx).toBeLessThan(0.14);
});

test('derived mode, duplex: the canon regains its inner/outer asymmetry', async ({
  page,
}) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings
    .getByText('Préréglage')
    .locator('xpath=following-sibling::select')
    .selectOption({ label: 'Rapport' });
  // Facing pages: the spine reappears, and with it the 1:2 canon.
  await settings
    .getByText('Recto-verso')
    .locator('xpath=following-sibling::input')
    .check();

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  await page.waitForTimeout(500);

  const g = await readPage1Geometry(page);
  expect(g).not.toBeNull();
  const inner = g!.leftOffsetPx;
  const outer = g!.pageWidthPx - inner - g!.widthPx;

  // Page 1 is a recto: inner margin (spine side) on the left, strictly
  // smaller than the outer. Loose bounds — the canon is computed from a
  // canvas-measured character width, not from a fixed ratio.
  expect(inner).toBeLessThan(outer);
  expect(outer / inner).toBeGreaterThan(1.5);
  expect(outer / inner).toBeLessThan(2.5);
});
