import { expect, test } from '@playwright/test';

/**
 * Purpose: Render-regression net for every block fence, in the real app
 *   pipeline (marked-config → async math/mermaid passes → paged.js → the
 *   @markpage/blocks `.markpage` styles). Complements the deterministic
 *   markup snapshots in tests/gallery-snapshot.test.ts by also covering the
 *   non-deterministic blocks (math / mermaid / ebnf / inference) and the
 *   actual CSS/layout — catching "a fence stopped rendering" regressions.
 * How: Each showcase entry is rendered standalone by the demo runner
 *   (demo.html?id=…). We assert the fence actually rendered (it didn't
 *   survive as a raw `language-XXX` code block), no renderer error block
 *   leaked, and something visual is present.
 */

// showcase entry id → fence language word it must have rendered.
const CASES: { id: string; lang: string }[] = [
  { id: 'charts', lang: 'chart' },
  { id: 'bda', lang: 'bda' },
  { id: 'category', lang: 'category' },
  { id: 'adt', lang: 'adt' },
  { id: 'diff', lang: 'diff' },
  { id: 'tree', lang: 'tree' },
  { id: 'ebnf', lang: 'ebnf' },
  { id: 'math', lang: 'math' },
  { id: 'mermaid', lang: 'mermaid' },
  { id: 'inference', lang: 'inference' },
  { id: 'mosaic', lang: 'mosaic' },
];

for (const { id, lang } of CASES) {
  test(`block renders in the app pipeline: ${id}`, async ({ page }) => {
    await page.goto(`/demo.html?id=${id}`);
    const pane = page.locator('#preview-pane');
    // paged.js produced at least one page.
    await pane.locator('.pagedjs_page').first().waitFor({ timeout: 30_000 });
    // The fence rendered — it did not survive as a raw fenced code block.
    await expect(pane.locator(`pre code.language-${lang}`)).toHaveCount(0);
    // No renderer error block leaked through.
    await expect(
      pane.locator(
        '.chart-error, .bda-error, .category-error, .adt-error, .mosaic-error',
      ),
    ).toHaveCount(0);
    // The rendered block element is present (target the block classes, not
    // any `svg` — the per-page debug-guides overlay is a 0×0 <svg>).
    await expect(
      pane
        .locator(
          '.chart-svg, .bda-svg, .category-svg, .mermaid-block, .adt-block, ' +
            '.diff-block, .tree-block, .tree-svg-wrap, .ebnf-block, ' +
            '.math-block, .mosaic-row',
        )
        .first(),
    ).toBeVisible({ timeout: 30_000 });
  });
}
