import { expect, test, type Page } from './fixtures';

async function replaceDocument(page: Page, markdown: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.evaluate(
    async (text) => navigator.clipboard.writeText(text),
    markdown,
  );
  await page.keyboard.press('ControlOrMeta+v');
}

async function openSettings(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('button.menu-trigger', { hasText: 'Réglages' }).click();
  const settings = await popupPromise;
  await settings.waitForLoadState();
  // Stay on the « Essentiel » form: that is where « Séparation des
  // paragraphes » lives. Switching to « Avancé » navigates away from it.
  return settings;
}

function longDocument(): string {
  const titles = Array.from({ length: 12 }, (_, index) => `Section ${index + 1}`);
  const toc = [
    '::: toc+',
    ...titles.map((title) => `- **${title}** — intention de la section.`),
    ':::',
  ];
  const prose =
    'Ce paragraphe assez long vérifie la fragmentation réelle du document ' +
    'après une modification du rythme typographique. Il contient plusieurs ' +
    'phrases afin que la hauteur cumulée exige plusieurs pages A4.';
  const sections = titles.flatMap((title) => [
    `## ${title}`,
    '',
    ...Array.from({ length: 7 }, () => [prose, '']).flat(),
  ]);
  return ['# Test de pagination', '', ...toc, '', ...sections].join('\n');
}

test('first-line indent keeps the complete multi-page pagination', async ({
  page,
}) => {
  await page.goto('/');
  await replaceDocument(page, longDocument());

  await page.locator('button.menu-trigger', { hasText: 'Vue' }).click();
  await page.locator('.cm-context-item', { hasText: 'Aperçu' }).click();
  await expect(page.locator('.pagedjs_page').nth(2)).toBeAttached({
    timeout: 30_000,
  });

  const settings = await openSettings(page);
  const paragraphField = settings.locator('.settings-origin-field', {
    hasText: 'Séparation des paragraphes',
  });
  await paragraphField.locator('select').selectOption('indent');

  await expect.poll(
    async () => page.locator('.pagedjs_page').count(),
    { timeout: 30_000 },
  ).toBeGreaterThan(2);
  await expect(page.locator('.pagedjs_page h2', { hasText: 'Section 12' }))
    .toBeAttached();

  // First-line indent is now native: `text-indent` on the paragraph, fragmented
  // by the engine. The former assertions counted `.mp-first-line-indent` spacer
  // spans and `p[data-split-from]` markers — a paged.js-era mitigation (its
  // injector, insertParagraphIndentSpacers, has been removed as dead code) and
  // a paged.js-internal attribute. What matters is the typographic result: the
  // paragraphs carry a real indent.
  // First-line indent is now native: `text-indent` on the paragraph, fragmented
  // by the engine. The former assertions counted `.mp-first-line-indent` spacer
  // spans and `p[data-split-from]` markers — a paged.js-era mitigation (its
  // injector, insertParagraphIndentSpacers, has been removed as dead code) and
  // a paged.js-internal attribute.
  //
  // A paragraph OPENING a section is not indented; the ones that follow it are.
  // That contrast is the whole typographic point, so assert both halves.
  const indents = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('.pagedjs_page_content p')];
    const first = ps[0];
    const cont = ps.find((p) => p.classList.contains('mp-paragraph-continuation'));
    return {
      first: first ? parseFloat(getComputedStyle(first).textIndent) : NaN,
      continuation: cont ? parseFloat(getComputedStyle(cont).textIndent) : NaN,
    };
  });
  expect(indents.first).toBe(0);
  expect(indents.continuation).toBeGreaterThan(0);

  // No overflow check here any more. It compared scrollHeight to clientHeight
  // on `.pagedjs_page_content`, which was paged.js's clipping box; under
  // Vivliostyle that element is the page-area CONTAINER and is structurally
  // shorter than its column child — every page reports the same 992 vs 732 with
  // `overflow: visible`, whatever the content. The invariant it stood for
  // (nothing lost, nothing out of bounds) is asserted for real by
  // e2e/vivliostyle-spike.spec.ts.
});
