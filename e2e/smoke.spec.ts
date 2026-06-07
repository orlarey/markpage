import { expect, test } from '@playwright/test';

/**
 * Purpose: Smoke test for the end-to-end Playwright setup. Asserts that
 *   the markpage SPA loads and renders its app shell. Acts as the
 *   canary — if THIS test fails, every subsequent e2e test is suspect
 *   because something is wrong with the boot pipeline (Vite dev server,
 *   missing imports, runtime errors during init).
 * How: Open the homepage; assert the editor pane is visible (primary
 *   entry point) and the preview pane exists in the DOM (hidden by
 *   default — it shows when the user clicks 'Voir l'aperçu', so we
 *   only check it's attached, not visible).
 */
test('the app shell loads with the editor visible and the preview attached', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#editor-pane')).toBeVisible();
  // The preview pane is hidden by default; assert it's attached and
  // ready to be toggled visible — that's enough to confirm the SPA
  // structure built correctly.
  await expect(page.locator('#preview-pane')).toBeAttached();
});

test('no uncaught console errors during initial load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  // Give async init (paged.js, MathJax, font load) a moment to settle.
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});
