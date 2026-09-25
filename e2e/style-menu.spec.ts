import { expect, test } from './fixtures';

/**
 * The Style menu checks the style the document is rendered with — the default
 * (Note A4) when the front-matter names none.
 */

const DOC = 'https://example.test/sans-style.md';

test('a document without document-style shows the default style checked', async ({ page }) => {
  await page.route(DOC, (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: '# Sans front matter\n',
    })
  );
  await page.goto(`/?src=${encodeURIComponent(DOC)}`);
  await expect(page.locator('.cm-content')).toContainText('Sans front matter');
  await page.getByRole('button', { name: /^Style/ }).click();
  const menu = page.locator('#document-style-menu');
  await expect(menu.locator('.cm-context-item.active')).toHaveCount(1);
  await expect(menu.locator('.cm-context-item.active')).toContainText('Note');
  await expect(menu.locator('.cm-context-item.active')).toContainText('A4');
});
