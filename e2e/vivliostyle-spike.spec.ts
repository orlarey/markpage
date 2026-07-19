import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from './fixtures';

// SPIKE (branch vivliostyle) — evaluate Vivliostyle Core as the pagination
// engine. Renders ATTRIBUTE-FIXPOINT-SPEC.md through the app with the engine
// flag on, then asserts the properties the paged.js engine historically broke:
// nothing dropped, reading order intact, nothing painted outside a page.
// NOTE: none of the paged.js mitigation passes run in this mode — that is the
// point of the measurement.
test('vivliostyle engine: complete, ordered, in-bounds pagination', async ({ page }) => {
  const md = readFileSync(join(process.cwd(), 'ATTRIBUTE-FIXPOINT-SPEC.md'), 'utf8');
  await page.addInitScript((t) => {
    localStorage.setItem('markpage:doc', t);
    localStorage.setItem('markpage:preview-paginated', '1');
    localStorage.setItem('markpage:preview-visible', '1');
    localStorage.setItem('markpage:engine', 'vivliostyle');
  }, md);

  await page.goto('/');
  await page.locator('[data-vivliostyle-page-container]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(6000);

  const r = await page.evaluate(() => {
    const containers = [...document.querySelectorAll('[data-vivliostyle-page-container]')] as HTMLElement[];
    const txt = containers.map((c) => c.textContent || '').join(' ').replace(/\s+/g, ' ');
    const markers = ['Cette spécification décrit', 'Le moteur reçoit exclusivement',
      'Sur une partie acyclique', 'Les objectifs sont les suivants',
      'Le système distingue cinq éléments', 'Point fixe local par file de travail',
      'Un premier prototype header-only', 'Une politique minimale pourrait suivre',
      'Quel standard C++ minimal'];
    const order = markers.map((m) => txt.indexOf(m));
    return {
      pages: containers.length,
      missing: markers.filter((m) => !txt.includes(m)),
      orderOK: order.every((v, i) => i === 0 || v > order[i - 1]!),
      overflowing: containers.filter((c) =>
        c.scrollWidth > c.clientWidth + 2 || c.scrollHeight > c.clientHeight + 2).length,
    };
  });

  expect(r.missing).toEqual([]);
  expect(r.orderOK).toBe(true);
  expect(r.overflowing).toBe(0);
  // ~18-19 pages expected; the box-sizing regression exploded this to 440+.
  expect(r.pages).toBeGreaterThan(10);
  expect(r.pages).toBeLessThan(40);
});
