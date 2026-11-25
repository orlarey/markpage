import { expect, test } from './fixtures';

/**
 * Purpose: An oversized figure gets a page of its own and may borrow the
 *   margins (atomic-fit.ts). The folio and the running head must not be
 *   printed over it: that page carries neither, its neighbours keep theirs,
 *   and the numbering goes on (UN-LANGAGE-DE-PATCHS: page 10's folio sat
 *   across its EBNF grammar).
 */

function oversizedGrammar(): string {
  const rules = Array.from(
    { length: 24 },
    (_, i) => `regle_${i} = "a" , ( regle_${(i + 1) % 24} | "b" | "c" ) , { "d" } ;`,
  );
  return [
    '---',
    'title: Page de figure',
    'language: fr',
    '---',
    '',
    'Un paragraphe avant la grammaire.',
    '',
    '```ebnf',
    ...rules,
    '```',
    '',
    'Un paragraphe après la grammaire.',
    '',
  ].join('\n');
}

test('figure page: no folio or running head over an oversized figure', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript((t) => {
    localStorage.setItem('markpage:doc', t);
    localStorage.setItem('markpage:preview-visible', '1');
  }, oversizedGrammar());
  await page.goto('/');
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached', timeout: 120_000 });
  await expect(page.locator('.pagedjs_page.mp-figure-page')).toHaveCount(1, { timeout: 60_000 });

  const pages = await page.evaluate(() =>
    [...document.querySelectorAll('.pagedjs_page')].map((p) => ({
      figure: p.classList.contains('mp-figure-page'),
      visibleRunning: [...p.querySelectorAll('.pagedjs_margin')].filter(
        (m) => (m.textContent ?? '').trim() !== '' && getComputedStyle(m).visibility !== 'hidden',
      ).length,
    })),
  );
  const figure = pages.findIndex((p) => p.figure);
  expect(figure).toBeGreaterThan(0);
  expect(pages[figure]!.visibleRunning, 'running content over the figure').toBe(0);
  // The neighbours keep their folio: only the figure's page is silenced.
  expect(pages[figure - 1]!.visibleRunning).toBeGreaterThan(0);
});
