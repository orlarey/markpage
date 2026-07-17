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

  const indentState = await page.evaluate(() => ({
    spacers: document.querySelectorAll(
      '.pagedjs_page_content .mp-first-line-indent',
    ).length,
    continuationSpacers: document.querySelectorAll(
      '.pagedjs_page_content p[data-split-from] .mp-first-line-indent',
    ).length,
  }));
  expect(indentState.spacers).toBeGreaterThan(0);
  expect(indentState.continuationSpacers).toBe(0);

  const overflow = await page.locator('.pagedjs_page_content').evaluateAll(
    (contents) => contents.some(
      (content) => content.scrollHeight > content.clientHeight + 1,
    ),
  );
  expect(overflow).toBe(false);
});
