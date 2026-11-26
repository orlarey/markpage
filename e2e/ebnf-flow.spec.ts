import { expect, test } from './fixtures';

/**
 * Purpose: A grammar is a sequence of productions. One that fits the column
 *   breaks BETWEEN two productions when it meets the foot of the page — it
 *   used to be one indivisible block: pushed whole to the next page when
 *   short, squeezed onto a single page at a third of its size when long (a
 *   JSON grammar of twenty productions). A production never splits, none is
 *   left alone at the foot or at the top of a page, and the `=` signs stay
 *   aligned — on a page and from one page to the next.
 */

const RULES = 22;

function longGrammar(): string {
  const rules = Array.from(
    { length: RULES },
    (_, i) => `regle_${i} = "a" , ( regle_${(i + 1) % RULES} | "b" | "c" ) , { "d" } ;`,
  );
  return [
    '---',
    'title: Une grammaire longue',
    'document-style: note-a4',
    'language: fr',
    '---',
    '',
    '# La grammaire',
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

// With the names' own face, and without it: the `=` column must not depend
// on the metrics of one font (on CI, where the fallback face was the one
// measured, a column computed from Roboto Mono's advance was 6 px off).
for (const face of ['Roboto Mono', 'a fallback face'] as const) test(`ebnf: a long grammar breaks between productions, aligned on every page (${face})`, async ({ page }) => {
  test.setTimeout(180_000);
  // The font files only: the stylesheets that name them are modules of the app.
  if (face !== 'Roboto Mono') {
    await page.route(/roboto.?mono[^?]*\.(woff2?|ttf|otf)(\?|$)/i, (route) => route.abort());
  }
  await page.addInitScript((t) => {
    localStorage.setItem('markpage:doc', t);
    localStorage.setItem('markpage:preview-visible', '1');
    localStorage.setItem('markpage:preview-paginated', '1');
  }, longGrammar());
  await page.goto('/');
  await page.locator('.pagedjs_page').first().waitFor({ state: 'attached', timeout: 120_000 });
  await expect(page.locator('.pagedjs_page .ebnf-rule')).toHaveCount(RULES, { timeout: 60_000 });

  const pages = await page.evaluate(() =>
    [...document.querySelectorAll('.pagedjs_page')].map((pg) => {
      const area = pg.querySelector('.pagedjs_page_content')!.getBoundingClientRect();
      const rules = [...pg.querySelectorAll<HTMLElement>('.ebnf-rule')];
      return {
        // The name alone — the <dt>'s own text: Vivliostyle lays the generated
        // sizer and ` =` as real elements.
        names: rules.map((r) =>
          [...r.querySelector('dt')!.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent ?? '')
            .join('')
            .trim(),
        ),
        // Where each `=` column ends, relative to the text area.
        equals: rules.map((r) => Math.round(r.querySelector('dt')!.getBoundingClientRect().right - area.left)),
        // A production cut by the page would stick out of the text area.
        outside: rules.filter((r) => {
          const b = r.getBoundingClientRect();
          return b.top < area.top - 1 || b.bottom > area.bottom + 1;
        }).length,
        figurePage: pg.classList.contains('mp-figure-page'),
        // What the alignment depends on, for the report of a failure.
        layout: rules.slice(0, 1).map((r) => {
          const dt = r.querySelector('dt')!;
          const dl = r.closest('dl')!;
          return {
            dtWidths: [...new Set(rules.map((x) => Math.round(x.querySelector('dt')!.getBoundingClientRect().width)))],
            dlLeft: Math.round(dl.getBoundingClientRect().left - area.left),
            dlWidth: Math.round(dl.getBoundingClientRect().width),
            zoom: dl.style.zoom || '1',
            font: getComputedStyle(dt).fontFamily,
            fontSize: getComputedStyle(dt).fontSize,
          };
        }),
      };
    }),
  );
  const withRules = pages.filter((p) => p.names.length > 0);
  // It flows over several pages, at its size: no page given over to it.
  expect(withRules.length).toBeGreaterThan(1);
  expect(pages.some((p) => p.figurePage)).toBe(false);
  // Every production once, in order, none cut.
  expect(withRules.flatMap((p) => p.names)).toEqual(Array.from({ length: RULES }, (_, i) => `regle_${i}`));
  expect(withRules.map((p) => p.outside)).toEqual(withRules.map(() => 0));
  // Never a production alone at the foot or at the top of a page.
  expect(withRules[0]!.names.length).toBeGreaterThan(1);
  expect(withRules.at(-1)!.names.length).toBeGreaterThan(1);
  // One `=` column, the same on every page (to the pixel).
  const columns = new Set(withRules.flatMap((p) => p.equals));
  expect(
    Math.max(...columns) - Math.min(...columns),
    JSON.stringify(withRules.map((p) => ({ n: p.names.length, equals: [...new Set(p.equals)], ...p.layout[0] }))),
  ).toBeLessThanOrEqual(1);
});
