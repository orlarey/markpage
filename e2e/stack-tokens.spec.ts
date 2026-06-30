import { test, expect } from '@playwright/test';

/**
 * Document-stack wiring (STACK-SPEC): a `var(--token)` reference + a dotted
 * `styles.<el>.<attr>` key in the front-matter must reach the rendered preview —
 * i.e. the leaf's tokens resolve and the dotted style patch is folded into the
 * effective settings. Here `styles.h2.color: var(--brand)` paints the H2 in
 * #0b3d91 = rgb(11, 61, 145). (H2 not H1: markpage promotes the first `# heading`
 * to a `.doc-title`, styled by `styles.title` — a different element.)
 */
test('var(--token) + dotted styles.* apply in the preview', async ({ page }) => {
  // Continuous mode keeps the heading directly under #preview-pane (no paged.js).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('markpage:preview-paginated', '0');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  // Enable the preview pane (off by default).
  await page.getByRole('button', { name: 'Aperçu' }).click();

  const doc = [
    '---',
    '--brand: "#0b3d91"',
    'styles.h2.color: var(--brand)',
    '---',
    '## Sub',
    '',
    'Body text.',
  ].join('\n');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(async (t) => navigator.clipboard.writeText(t), doc);
  await page.keyboard.press('ControlOrMeta+v');

  const h2 = page.locator('#preview-pane h2').first();
  await expect(h2).toBeVisible();
  await expect
    .poll(() => h2.evaluate((el) => getComputedStyle(el).color))
    .toBe('rgb(11, 61, 145)');
});
