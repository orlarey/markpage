import { expect, test } from './fixtures';

/**
 * Purpose: Smoke-test the debug-guides overlay — the Vue ▸ Guides menu item
 *   and the Cmd/Ctrl+Shift+G shortcut both toggle the `.debug-layout` class
 *   on #preview-pane, which surfaces the page / live-area outlines and the
 *   page-diagonal SVG overlays injected on every `.pagedjs_pagebox`.
 */

// Open the Vue menu and click its "Guides" item (the standalone toolbar
// button moved into the Vue dropdown in the toolbar rationalization).
async function toggleGuidesViaMenu(page: import('@playwright/test').Page) {
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Guides' }).click();
}

test('the Vue ▸ Guides item toggles the .debug-layout class on #preview-pane', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached' });

  const previewPane = page.locator('#preview-pane');

  // Off by default.
  await expect(previewPane).not.toHaveClass(/debug-layout/);

  // Toggle on.
  await toggleGuidesViaMenu(page);
  await expect(previewPane).toHaveClass(/debug-layout/);

  // Toggle off again.
  await toggleGuidesViaMenu(page);
  await expect(previewPane).not.toHaveClass(/debug-layout/);
});

test('Cmd/Ctrl+Shift+G fires the same guides toggle', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached' });

  const previewPane = page.locator('#preview-pane');
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await expect(previewPane).toHaveClass(/debug-layout/);
});

test('the SVG diagonals overlay is injected on every .pagedjs_pagebox', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached' });
  // Wait until injectGuidesSvg has run (it's called after
  // previewer.preview() resolves). Asserting equality once both
  // counts are stable is the cleanest signal.
  await page.waitForFunction(() => {
    const pages = document.querySelectorAll('.pagedjs_pagebox').length;
    const svgs = document.querySelectorAll('.pagedjs_pagebox > svg.mp-guides-overlay').length;
    return pages > 0 && pages === svgs;
  }, null, { timeout: 30_000 });

  const pagedCount = await page.locator('.pagedjs_pagebox').count();
  const svgCount = await page.locator('.pagedjs_pagebox > svg.mp-guides-overlay').count();
  expect(svgCount).toBe(pagedCount);
  // Each SVG has the two diagonal lines.
  const lineCount = await page
    .locator('.pagedjs_pagebox > svg.mp-guides-overlay line')
    .count();
  expect(lineCount).toBe(2 * pagedCount);
});
