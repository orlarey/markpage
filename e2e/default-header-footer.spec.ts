import { expect, test, type Page } from './fixtures';

/**
 * Purpose: The header / footer string fields in Réglages → Page act as
 *   defaults injected as invisible fence sentinels at the top of the
 *   document. A real ```header / ```footer fence later in the doc
 *   replaces the matching band (per the SPEC §26.5 cascade rules); the
 *   other band still uses the default.
 *
 *   Assertions are black-box: they read the TEXT each margin slot ends up
 *   showing, on EVERY page. The previous version inspected paged.js
 *   internals instead — the `.pagedjs_margin-content` child, the
 *   `hasContent` class, and the unresolved `counter(page)` declaration —
 *   which the Vivliostyle engine neither produces nor needs (it resolves
 *   the counter into real text). Checking one box on one page also let a
 *   real regression through: the running bands were dropping off every
 *   page that began inside a fragmented paragraph, which is why these
 *   tests now sweep all pages.
 */

async function openSettings(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('button.menu-trigger', { hasText: 'Réglages' }).click();
  const settingsPage = await popupPromise;
  await settingsPage.waitForLoadState();
  // The popup opens on the « Essentiel » single-page form; the rail with the
  // per-domain items (including « Page ») only exists in « Avancé ».
  await settingsPage
    .getByRole('button', { name: 'Avancé', exact: true })
    .click();
  return settingsPage;
}

async function waitForRender(page: Page): Promise<void> {
  await page
    .locator('.pagedjs_pages')
    .waitFor({ state: 'attached', timeout: 90_000 });
  await page
    .locator('.pagedjs_page')
    .first()
    .waitFor({ state: 'attached', timeout: 90_000 });
  // Margin boxes are filled by the paginator, a beat after the first page
  // container exists.
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-vivliostyle-page-margin-box]')].some(
        (b) => (b.textContent || '').trim() !== '',
      ),
    undefined,
    { timeout: 90_000 },
  );
}

/** The text shown in `slot` on every page, in page order. */
async function slotTextPerPage(page: Page, slot: string): Promise<string[]> {
  return page.evaluate(
    (s) =>
      [...document.querySelectorAll('.pagedjs_page')].map((pg) =>
        (pg.querySelector(`.pagedjs_margin-${s}`)?.textContent || '').trim(),
      ),
    slot,
  );
}

test('the default footer ` | {page} | ` numbers every page in the bottom-center', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  const footers = await slotTextPerPage(page, 'bottom-center');
  expect(footers.length).toBeGreaterThan(0);
  // Resolved counters, not the `counter(page)` declaration: page N shows N.
  expect(footers).toEqual(footers.map((_, i) => String(i + 1)));
});

test('a custom default header from settings shows on every page', async ({
  page,
}) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings
    .getByText('En-tête par défaut')
    .locator('xpath=following-sibling::input')
    .fill(' | | Mon en-tête');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  const headers = await slotTextPerPage(page, 'top-right');
  expect(headers.length).toBeGreaterThan(0);
  expect(headers).toEqual(headers.map(() => 'Mon en-tête'));
});

test('an in-doc ```header fence overrides the default header but keeps the default footer', async ({
  page,
}) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings
    .getByText('En-tête par défaut')
    .locator('xpath=following-sibling::input')
    .fill(' | | Défaut');
  // A doc whose in-source header fence overrides only the header band — the
  // default footer (page counter) must still come through via the cascade.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(
    async (t) => navigator.clipboard.writeText(t),
    '```header\n | | Section override\n```\n\n# Test\n\nBody.\n',
  );
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(400);
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);

  const headers = await slotTextPerPage(page, 'top-right');
  const footers = await slotTextPerPage(page, 'bottom-center');
  expect(headers[0]).toBe('Section override');
  expect(headers).not.toContain('Défaut');
  expect(footers[0]).toBe('1');
});
