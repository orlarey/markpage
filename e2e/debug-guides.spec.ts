import { expect, test } from '@playwright/test';

/**
 * Purpose: Smoke-test the debug-guides overlay — the toolbar button and
 *   the Cmd/Ctrl+Shift+G shortcut both toggle the `.debug-layout` class
 *   on #preview-pane, which surfaces the page / live-area outlines and
 *   the page-diagonal SVG overlays injected on every `.pagedjs_pagebox`.
 */

test('toolbar Guides button toggles the .debug-layout class on #preview-pane', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.preview-toggle').click();
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached' });

  const previewPane = page.locator('#preview-pane');
  const guidesBtn = page.locator('button.guides-toggle');

  // Off by default — class absent, button not pressed.
  await expect(previewPane).not.toHaveClass(/debug-layout/);
  await expect(guidesBtn).toHaveAttribute('aria-pressed', 'false');

  // Click → on.
  await guidesBtn.click();
  await expect(previewPane).toHaveClass(/debug-layout/);
  await expect(guidesBtn).toHaveAttribute('aria-pressed', 'true');

  // Click → off again.
  await guidesBtn.click();
  await expect(previewPane).not.toHaveClass(/debug-layout/);
  await expect(guidesBtn).toHaveAttribute('aria-pressed', 'false');
});

test('Cmd/Ctrl+Shift+G fires the same toggle as the toolbar button', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.preview-toggle').click();
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached' });

  const previewPane = page.locator('#preview-pane');
  const guidesBtn = page.locator('button.guides-toggle');
  await page.keyboard.press('ControlOrMeta+Shift+g');
  await expect(previewPane).toHaveClass(/debug-layout/);
  await expect(guidesBtn).toHaveAttribute('aria-pressed', 'true');
});

test('the SVG diagonals overlay is injected on every .pagedjs_pagebox', async ({ page }) => {
  await page.goto('/');
  await page.locator('button.preview-toggle').click();
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
