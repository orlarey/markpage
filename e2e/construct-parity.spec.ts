import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from './fixtures';

/**
 * Construct parity — the guard for the class of bug the Vivliostyle migration
 * kept producing.
 *
 * The paginated preview does NOT lay out the app's DOM: it hands a STANDALONE
 * document to the engine. That document is an impoverished environment — it
 * only gets the stylesheets and DOM we deliberately put in it — and the engine
 * additionally rewrites what it lays out (absolutising hrefs, stamping inline
 * styles). Every regression so far was a construct that renders fine in the
 * continuous preview and degrades in the paginated one: mermaid labels clipped,
 * math reduced to empty boxes, an `adt` collapsed onto a single line.
 *
 * So the assertion is DIFFERENTIAL, never absolute: render the same fixture in
 * both modes and require the paginated one not to degrade. No golden pixel
 * values (they would break on every legitimate style change) — only invariants
 * that separate "rendered" from "broken".
 */

const FIXTURE = readFileSync(join(process.cwd(), 'e2e/fixtures/constructs.md'), 'utf8');

// One selector per construct. `inference` is absent on purpose: its renderer
// emits a `.math-block`, so it is covered by `math`.
const CONSTRUCTS: Record<string, string> = {
  adt: '.adt-block',
  algorithm: 'figure.captioned table',
  bda: 'svg.bda-svg',
  category: 'svg.category-svg, .category-svg-wrap svg',
  chart: '.chart-block',
  csv: 'table',
  diff: '.diff-block',
  ebnf: '.ebnf-block, .railroad-wrap svg',
  math: '.math-block',
  mathInline: '.math-inline',
  mermaid: '.mermaid-block',
  tree: '.tree-block, .tree-svg-wrap',
  admonition: '.admonition',
  deflist: 'dl:not(.adt-block)',
  table: 'table',
};

interface Measure {
  found: boolean;
  h: number;
  brokenRefs: number;
  clipped: number;
}

async function measure(page: Page, sel: Record<string, string>): Promise<Record<string, Measure>> {
  return page.evaluate((selectors) => {
    const out: Record<string, Measure> = {};
    for (const [name, s] of Object.entries(selectors)) {
      const el = document.querySelector('#preview-pane')?.querySelector(s) ?? null;
      if (!el) {
        out[name] = { found: false, h: 0, brokenRefs: 0, clipped: 0 };
        continue;
      }
      // The element may BE the svg (bda, category) or contain one.
      const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
      let brokenRefs = 0;
      let clipped = 0;
      if (svg) {
        for (const u of svg.querySelectorAll('use')) {
          const href = u.getAttribute('xlink:href') ?? u.getAttribute('href') ?? '';
          // A glyph reference must stay a local fragment resolving inside its
          // own svg; the engine absolutising it to http://host/#id silently
          // empties the formula.
          const local = href.startsWith('#') && svg.querySelector(`[id="${href.slice(1)}"]`);
          if (!local) brokenRefs += 1;
        }
        for (const fo of svg.querySelectorAll('foreignObject')) {
          const inner = fo.firstElementChild;
          if (inner && inner.getBoundingClientRect().height > fo.getBoundingClientRect().height + 1) {
            clipped += 1;
          }
        }
      }
      out[name] = {
        found: true,
        h: Math.round(el.getBoundingClientRect().height),
        brokenRefs,
        clipped,
      };
    }
    return out;
  }, sel);
}

async function render(page: Page, paginated: boolean): Promise<Record<string, Measure>> {
  await page.addInitScript(
    ([md, flag]) => {
      localStorage.setItem('markpage:doc', md as string);
      localStorage.setItem('markpage:preview-visible', '1');
      localStorage.setItem('markpage:preview-paginated', flag as string);
    },
    [FIXTURE, paginated ? '1' : '0'],
  );
  await page.goto('/');
  if (paginated) {
    await page.locator('[data-vivliostyle-page-container]').first().waitFor({ timeout: 60_000 });
  }
  await page.waitForTimeout(10_000); // mermaid + MathJax + chart hydration
  return measure(page, CONSTRUCTS);
}

test('every construct survives pagination', async ({ page, browser }) => {
  const continuous = await render(page, false);

  const ctx = await browser.newContext();
  const paged = await ctx.newPage();
  const paginated = await render(paged, true);
  await ctx.close();

  const failures: string[] = [];
  for (const [name, ref] of Object.entries(continuous)) {
    const got = paginated[name]!;
    if (!ref.found) {
      failures.push(`${name}: absent even from the continuous render — fixture gap`);
      continue;
    }
    if (!got.found) failures.push(`${name}: disappeared when paginated`);
    if (got.brokenRefs > 0) failures.push(`${name}: ${got.brokenRefs} broken <use> refs (empty glyphs)`);
    if (got.clipped > 0) failures.push(`${name}: ${got.clipped} clipped foreignObject labels`);
    // Pagination legitimately reflows (narrower text block), so compare
    // loosely: this catches a collapse (adt 63px -> 15px), not a reflow.
    if (ref.h > 0 && Math.abs(got.h - ref.h) / ref.h > 0.4) {
      failures.push(`${name}: height ${ref.h} -> ${got.h}`);
    }
  }
  expect(failures, failures.join(' | ')).toEqual([]);
});
