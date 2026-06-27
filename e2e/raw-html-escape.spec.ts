import { expect, test } from './fixtures';

/**
 * Purpose: End-to-end XSS smoke check. Pasting raw HTML into the
 *   editor must not execute as live HTML in either the fluid preview
 *   or the paginated preview — the marked-config `html` renderer
 *   override (introduced in 0.16.1) escapes all `html` / inline-html
 *   tokens so they land as inert text. This test catches a regression
 *   where, say, an extension upgrade or a config change reverts the
 *   default marked behaviour and silently re-enables raw HTML.
 *
 *   `dialog` handler asserts that NO `alert(...)` call ever fires; if
 *   the page accidentally executes the script, the test fails loud.
 */

test('raw <script> in the editor does not execute in the fluid preview', async ({ page }) => {
  let alertFired = false;
  page.on('dialog', async (d) => {
    alertFired = true;
    await d.dismiss();
  });

  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(
    async (t) => navigator.clipboard.writeText(t),
    '# Test\n\n<script>window.__xss=1;alert(1)</script>\n',
  );
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(500);

  // Fluid preview: no real <script>, no global side effect, no dialog.
  const r = await page.evaluate(() => ({
    hasScript: document.querySelector('#preview-pane script') !== null,
    xssMark: (window as unknown as { __xss?: number }).__xss,
  }));
  expect(r.hasScript).toBe(false);
  expect(r.xssMark).toBeUndefined();
  expect(alertFired).toBe(false);
});

test('raw <script> survives the paginated preview as inert text', async ({ page }) => {
  let alertFired = false;
  page.on('dialog', async (d) => {
    alertFired = true;
    await d.dismiss();
  });

  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(
    async (t) => navigator.clipboard.writeText(t),
    '# Doc\n\n<script>alert(1)</script>\n',
  );
  await page.keyboard.press('ControlOrMeta+v');
  await page.waitForTimeout(400);
  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await page.locator('.pagedjs_page').first().waitFor();
  await page.waitForTimeout(1000);

  const r = await page.evaluate(() => ({
    pagedHasScript: document.querySelector('.pagedjs_page script') !== null,
    // Look for the escaped marker anywhere in the rendered DOM —
    // paged.js may split content across nodes, so search the whole
    // `.pagedjs_pages` tree rather than the first .pagedjs_page_content.
    pagedTextHasMarker:
      document
        .querySelector('.pagedjs_pages')
        ?.textContent?.includes('alert(1)') ?? false,
  }));
  expect(r.pagedHasScript).toBe(false);
  expect(r.pagedTextHasMarker).toBe(true);
  expect(alertFired).toBe(false);
});
