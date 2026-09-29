import { expect, test, type Page } from './fixtures';

/**
 * The share button: a published document is shared by its address (the link
 * follows its updates), any other by a copy carried in the link; either way
 * the link opens in Lire, in pages or not as the sender had it — for that
 * opening only, the recipient's own choices untouched.
 */

const DOC = 'https://example.test/partage.md';

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

const share = async (page: Page): Promise<string> => {
  await page.getByRole('button', { name: 'Copier le lien de partage', exact: true }).click();
  await expect(page.locator('#mp-share')).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
};

test('a document opened from a URL is shared by its address', async ({ page }) => {
  await page.route(DOC, (r) =>
    r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, body: '# Partage\n\nTexte publié.\n' }),
  );
  await page.goto(`/?src=${encodeURIComponent(DOC)}`);
  await page.locator('.cm-content').waitFor({ state: 'attached' });
  const link = new URL(await share(page));
  expect(link.searchParams.get('src')).toBe(DOC);
  expect(link.searchParams.get('import')).toBeNull();
  expect(link.searchParams.get('view')).toBe('read');
  expect(link.searchParams.get('pages')).toBe('1');
  await expect(page.locator('#mp-share')).toContainText('dernière version');
});

test('a local document is shared as a copy, which opens in Lire without changing the reader’s choices', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('markpage:preview-paginated', '0');
    localStorage.setItem('markpage:preview-visible', '1');
    localStorage.setItem('markpage:preview-layout', 'split');
  });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('# Note locale\n\nUn texte à partager.\n');
  const link = new URL(await share(page));
  expect(link.searchParams.get('import')).not.toBeNull();
  expect(link.searchParams.get('view')).toBe('read');
  expect(link.searchParams.get('pages')).toBe('0');

  // The recipient (here, the same browser): Lire, the shared text.
  const other = await context.newPage();
  await other.goto(link.pathname + link.search);
  await expect(other.locator('#panes')).toHaveAttribute('data-view', 'read');
  await expect(other.locator('#preview-pane p', { hasText: 'Un texte à partager.' })).toBeVisible();
  expect(new URL(other.url()).searchParams.get('view')).toBeNull();
  // …and their own view is still side by side.
  expect(await other.evaluate(() => localStorage.getItem('markpage:preview-layout'))).toBe('split');
});
