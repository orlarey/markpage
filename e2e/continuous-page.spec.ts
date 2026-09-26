import { expect, test, type Page } from './fixtures';

/**
 * The continuous (unpaginated) preview is ONE long page: `::: background`
 * blocks apply to the whole sheet — `at` / `size` from 0 to 1 over its full
 * width and height — and the header / footer sit at its two ends.
 */

async function openContinuous(page: Page, body: string, paginated = false): Promise<void> {
  await page.addInitScript(
    (p) => localStorage.setItem('markpage:preview-paginated', p ? '1' : '0'),
    paginated
  );
  const url = 'https://example.test/longue.md';
  await page.route(url, (r) =>
    r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, body })
  );
  await page.goto(`/?src=${encodeURIComponent(url)}`);
  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  const sheet = paginated ? '.pagedjs_page' : '.mp-continuous-sheet';
  await expect(page.locator(`#preview-pane ${sheet}`).first()).toBeVisible();
}

const LONG = Array.from(
  { length: 30 },
  (_, i) => `Paragraphe ${i}, assez long pour étirer la feuille bien au-delà d'une page.`
).join('\n\n');

/** `sel`'s box as fractions of the sheet (0..1 across and down). */
async function onSheet(page: Page, sel: string) {
  return page.evaluate((s) => {
    const sheet = document
      .querySelector('#preview-pane .mp-continuous-sheet')!
      .getBoundingClientRect();
    const r = document.querySelector(`#preview-pane ${s}`)!.getBoundingClientRect();
    return {
      left: (r.left - sheet.left) / sheet.width,
      right: (r.right - sheet.left) / sheet.width,
      top: (r.top - sheet.top) / sheet.height,
      bottom: (r.bottom - sheet.top) / sheet.height,
      sheetH: sheet.height,
      sheetW: sheet.width,
    };
  }, sel);
}

test('backdrops cover the whole sheet, positioned over its full height', async ({ page }) => {
  await openContinuous(
    page,
    `::: background fill=#f4f1ea\n:::\n\n::: background at=1,1 size=0.2\nFIN\n:::\n\n# Titre\n\n${LONG}\n`
  );
  const fill = await onSheet(page, '.mp-bg-item.mp-bg-full');
  expect(fill.sheetH).toBeGreaterThan(fill.sheetW * 1.5); // a long sheet
  expect([fill.left, fill.top, fill.right, fill.bottom].map((v) => Math.round(v * 100))).toEqual([
    0, 0, 100, 100,
  ]);
  // at=1,1: the minipage's bottom-right corner on the sheet's.
  const corner = await onSheet(page, '.mp-bg-item:not(.mp-bg-full)');
  expect(corner.right).toBeCloseTo(1, 2);
  expect(corner.bottom).toBeCloseTo(1, 2);
  // Behind the text: the paragraphs still get the clicks.
  await expect(page.locator('#preview-pane .mp-bg-layer')).toHaveCSS('z-index', '-1');
});

test('the cascade on one page: an empty block clears what came before', async ({ page }) => {
  await openContinuous(
    page,
    `::: background fill=#ff0000\n:::\n\n::: background\n:::\n\n# Titre\n\nTexte.\n`
  );
  await expect(page.locator('#preview-pane h1')).toBeVisible();
  await expect(page.locator('#preview-pane .mp-bg-layer')).toHaveCount(0);
});

test('the header sits at the top of the sheet, the footer at its bottom', async ({ page }) => {
  // Note A4 (the default style) has the folio in its footer; the fence gives a header.
  await openContinuous(
    page,
    `\`\`\`header\nGauche | Milieu | Droite\n\`\`\`\n\n# Titre\n\n${LONG}\n`
  );
  const header = page.locator('#preview-pane .mp-sheet-header');
  await expect(header).toHaveText(/Gauche\s*Milieu\s*Droite/);
  await expect(page.locator('#preview-pane .mp-sheet-footer')).toHaveText('1');
  // In the margins, around ALL the text: above the first heading, below the
  // last paragraph.
  const top = await onSheet(page, '.mp-sheet-header');
  const bottom = await onSheet(page, '.mp-sheet-footer');
  const first = await onSheet(page, 'h1');
  const last = await onSheet(page, '.mp-continuous-sheet > p:last-of-type');
  expect(top.bottom).toBeLessThan(first.top);
  expect(bottom.top).toBeGreaterThan(last.bottom);
});

