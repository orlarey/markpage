/**
 * Purpose: Shared Playwright fixtures for the markpage e2e suite.
 * How: Extend the base `test` so every page boots with the live preview in
 *   PAGINATED (A4 / paged.js) mode. The app now defaults the preview to a fast
 *   *continuous* flow (see the floating Aperçu / A4 toggles), but these tests
 *   assert on paged.js output (`.pagedjs_page`, headers, margins, duplex…), so
 *   they opt into pagination via the persisted `markpage:preview-paginated`
 *   pref, set before any app script runs.
 *
 *   Re-exports `expect` and the `Page` type so specs import everything from
 *   here instead of '@playwright/test'.
 */
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('markpage:preview-paginated', '1');
      } catch {
        /* localStorage unavailable — tests that don't need the preview still run */
      }
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';
