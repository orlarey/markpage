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

  await page.screenshot({ path: 'test-results/_vivlio2.png' });
  const r = await page.evaluate(() => {
    const containers = [...document.querySelectorAll('[data-vivliostyle-page-container]')] as HTMLElement[];
    const txt = containers.map((c) => c.textContent || '').join(' ').replace(/\s+/g, ' ');
    const markers = ['Cette spécification décrit', 'Le moteur reçoit exclusivement',
      'Sur une partie acyclique', 'Les objectifs sont les suivants',
      'Le système distingue cinq éléments', 'Point fixe local par file de travail',
      'Un premier prototype header-only', 'Une politique minimale pourrait suivre',
      'Quel standard C++ minimal'];
    const order = markers.map((m) => txt.indexOf(m));
    const tocAfter = getComputedStyle(
      document.querySelector('nav.toc-plus .toc-entry a[href]')!, '::after').content;
    return {
      pages: containers.length,
      missing: markers.filter((m) => !txt.includes(m)),
      orderOK: order.every((v, i) => i === 0 || v > order[i - 1]!),
      overflowing: containers.filter((c) =>
        c.scrollWidth > c.clientWidth + 2 || c.scrollHeight > c.clientHeight + 2).length,
      stacked: containers.length > 1 &&
        containers[1]!.getBoundingClientRect().top > containers[0]!.getBoundingClientRect().top + 100,
      allVisible: containers.every((c) => getComputedStyle(c).display !== 'none'),
      hasPagedjsClass: containers.every((c) => c.classList.contains('pagedjs_page')),
      tocHasUnresolved: txt.includes('??'),
      tocAfterSample: tocAfter.slice(0, 40),
      // The cover carries no running content by design, so start at page 2.
      footerNumbers: containers.slice(1, 5).every((c, k) => {
        const i = k + 1;
        const r2 = c.getBoundingClientRect();
        return [...c.querySelectorAll('*')].some((el) => {
          const b = el.getBoundingClientRect();
          return b.height > 0 && b.top > r2.bottom - 300 &&
            el.children.length === 0 && (el.textContent || '').trim() === String(i + 1);
        });
      }),
    };
  });

  expect(r.missing).toEqual([]);
  expect(r.orderOK).toBe(true);
  expect(r.overflowing).toBe(0);
  // ~18-19 pages expected; the box-sizing regression exploded this to 440+.
  expect(r.pages).toBeGreaterThan(10);
  expect(r.pages).toBeLessThan(40);
  expect(r.stacked).toBe(true);
  expect(r.allVisible).toBe(true);
  expect(r.hasPagedjsClass).toBe(true);
  expect(r.tocHasUnresolved).toBe(false);
  expect(r.footerNumbers).toBe(true);
});
