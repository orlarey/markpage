import { test, expect } from '@playwright/test';

/**
 * Regression (atelier ↔ render): the style vocabulary the atelier writes must
 * survive a `document-type` recipe. A document carrying `document-type` flattens
 * through the document stack, whose profile patch rewrites every per-element
 * colour and font — and used to clobber the vocabulary, so the atelier changed
 * the YAML but not the render. buildPreviewDom now re-asserts the vocabulary
 * AFTER the stack patch, so the atelier's colour + font win over the recipe.
 *
 * Here: `color-crans: "corps:1,4"` at hue 0 paints the body a muted red
 * (rgb(97, 79, 79)) instead of the recipe's near-black, and `font-pair:
 * technique` sets the body font to Roboto instead of the recipe's Inter.
 */
test('vocabulary (colour + font-pair) wins over a document-type recipe', async ({
  page,
}) => {
  const doc = [
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

  // Load the doc + show the preview in continuous mode (heading/paragraph sit
  // directly under #preview-pane, no pagination), independent of UI locale.
  await page.addInitScript((md) => {
    try {
      localStorage.setItem('markpage:doc', md);
      localStorage.setItem('markpage:preview-visible', '1');
      localStorage.setItem('markpage:preview-paginated', '0');
    } catch {
      /* ignore */
    }
  }, doc);
  await page.goto('/');

  const body = page.locator('#preview-pane p').first();
  await expect(body).toBeVisible();

  // Colour axis: the derived vocabulary colour, not the recipe's near-black.
  await expect
    .poll(() => body.evaluate((el) => getComputedStyle(el).color))
    .toBe('rgb(97, 79, 79)');

  // Font axis: the pairing's family leads the stack, not the recipe default.
  await expect
    .poll(() => body.evaluate((el) => getComputedStyle(el).fontFamily))
    .toMatch(/^Roboto\b/);
});
