import { test, expect } from '@playwright/test';

/**
 * Regression (atelier ↔ render): the style vocabulary the atelier writes must
 * survive a `document-type` recipe AND survive its own re-write. A document
 * carrying `document-type` flattens through the document stack, whose profile
 * patch rewrites every per-element colour and font.
 *
 * Two bugs this guards, both surfacing as "the YAML changed but the render
 * didn't move":
 *  1. buildPreviewDom applied the stack patch AFTER the vocabulary, clobbering
 *     it — the render never showed the atelier's colour/font.
 *  2. In continuous mode the settings-from-frontmatter pass re-injected the
 *     stylesheet from the recipe-only settings, so editing one axis (a colour)
 *     dropped the other (the fonts). This needs a real front-matter EDIT to
 *     reproduce — the early static render looks fine.
 *
 * Body colour: `color-crans: "corps:1,4"` at hue 0 → rgb(97, 79, 79) (a muted
 * red, not the recipe's near-black). Body font: `font-pair: technique` → Roboto
 * (not the recipe's Inter).
 */
test('a colour edit keeps the font-pair in the continuous preview', async ({
  page,
}) => {
  // Continuous mode (heading/paragraph sit directly under #preview-pane).
  const base = [
    '---',
    'document-type: report',
    'font-pair: technique',
    '---',
    '# Titre',
    '',
    'Paragraphe de corps.',
  ].join('\n');

  await page.addInitScript((md) => {
    try {
      localStorage.setItem('markpage:doc', md);
      localStorage.setItem('markpage:preview-visible', '1');
      localStorage.setItem('markpage:preview-paginated', '0');
    } catch {
      /* ignore */
    }
  }, base);
  await page.goto('/');

  const body = page.locator('#preview-pane p').first();
  await expect(body).toBeVisible();

  // Phase 1: the pairing font is in effect (no colour yet).
  await page.waitForTimeout(400);
  await expect
    .poll(() => body.evaluate((el) => getComputedStyle(el).fontFamily))
    .toMatch(/^Roboto\b/);

  // Phase 2: edit the FRONT-MATTER to add the colour axis — the same shape of
  // change the atelier makes. This fires the settings-from-frontmatter pass,
  // which used to re-inject the recipe stylesheet and drop the font.
  const withColour = [
    '---',
    'document-type: report',
    'font-pair: technique',
    'color-hue: 0',
    'color-crans: "corps:1,4"',
    '---',
    '# Titre',
    '',
    'Paragraphe de corps.',
  ].join('\n');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(async (t) => navigator.clipboard.writeText(t), withColour);
  await page.keyboard.press('ControlOrMeta+v');

  // Let the render (120 ms) AND the settings-from-frontmatter pass (180 ms) both
  // settle, so we test the final state, not the transient one.
  await page.waitForTimeout(800);

  // The colour landed…
  await expect(body).toHaveCSS('color', 'rgb(97, 79, 79)');
  // …AND the font did NOT revert to the recipe default.
  await expect
    .poll(() => body.evaluate((el) => getComputedStyle(el).fontFamily))
    .toMatch(/^Roboto\b/);
});
