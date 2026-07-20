import { expect, test, type Page } from './fixtures';

/**
 * Purpose: The header / footer string fields in Réglages → Page act as
 *   defaults injected as invisible fence sentinels at the top of the
 *   document. A real ```header / ```footer fence later in the doc
 *   replaces the matching band (per the SPEC §26.5 cascade rules); the
 *   other band still uses the default.
 *
 *   These tests open the settings popup, write into the two fields,
 *   then verify the running content actually renders in the margin
 *   boxes. The default in DEFAULT_SETTINGS is a centered `{page}`
 *   counter in the bottom-center slot — covered by the smoke check.
 */

async function openSettings(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('button.menu-trigger', { hasText: 'Réglages' }).click();
  const settingsPage = await popupPromise;
  await settingsPage.waitForLoadState();
  return settingsPage;
}

async function waitForRender(page: Page): Promise<void> {
  await page.locator('.pagedjs_pages').waitFor({ state: 'attached', timeout: 90_000 });
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached', timeout: 90_000 });
}

test("default footer ` | {page} | ` puts the page counter in the bottom-center on every page", async ({ page }) => {
  await page.goto('/');
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await waitForRender(page);
  // The default footer (DEFAULT_SETTINGS.footer = ' | {page} | ') emits
  // `content: counter(page)` on .pagedjs_margin-bottom-center via the
  // synthesised fence pipeline. getComputedStyle returns the literal
  // `counter(page)` (not the resolved value), but paged.js's polish
  // adds `hasContent` to the box when a non-empty content rule is
  // emitted — so we verify both: the rule is in the cascade AND the
  // box was tagged with content.
  const r = await page.evaluate(() => {
    const box = document.querySelector('.pagedjs_margin-bottom-center');
    const inner = box?.querySelector('.pagedjs_margin-content');
    const c = inner ? getComputedStyle(inner, '::after').content : null;
    return { hasContent: box?.classList.contains('hasContent') ?? false, content: c };
  });
  expect(r.hasContent).toBe(true);
  expect(r.content).toMatch(/counter\(page\)/);
});

test('custom default header from settings shows on every page', async ({ page }) => {
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

  const r = await page.evaluate(() => {
    const tr = document.querySelector(
      '.pagedjs_margin-top-right .pagedjs_margin-content',
    );
    const c = tr ? getComputedStyle(tr, '::after').content : null;
    return c?.replace(/^"(.*)"$/, '$1') ?? null;
  });
  expect(r).toBe('Mon en-tête');
});

test('an in-doc ```header fence overrides the default header but keeps the default footer', async ({ page }) => {
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Page', exact: true }).click();
  await settings
    .getByText('En-tête par défaut')
    .locator('xpath=following-sibling::input')
    .fill(' | | Défaut');
  // Inject a doc with an in-source header fence that overrides only
  // the header band — the default footer (page counter) should still
  // come through via the cascade.
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
  // The cover (= first mp-section page after the synth + real fences)
  // shows the fence-supplied header AND the default footer counter.
  const r = await page.evaluate(() => {
    const pg = document.querySelectorAll('.pagedjs_page')[0];
    const tr = pg.querySelector('.pagedjs_margin-top-right .pagedjs_margin-content');
    const bc = pg.querySelector('.pagedjs_margin-bottom-center .pagedjs_margin-content');
    const strip = (s: string | null) => (s ? s.replace(/^"(.*)"$/, '$1') : null);
    return {
      header: tr ? strip(getComputedStyle(tr, '::after').content) : null,
      footer: bc ? strip(getComputedStyle(bc, '::after').content) : null,
    };
  });
  expect(r.header).toBe('Section override');
  // Footer still resolves to the default page counter (per cascade,
  // unchanged by the header-only fence).
  expect(r.footer).toMatch(/counter\(page\)/);
});
