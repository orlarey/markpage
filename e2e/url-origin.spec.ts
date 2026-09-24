import { expect, test, type Page } from './fixtures';

/**
 * `?url=` / `?src=` — a document whose origin is a URL (url-origin.ts); the
 * tests use `src` (Vite's dev server reserves `?url`). The remote site
 * is simulated with a route; its CORS header decides whether markpage may read.
 */

const DOC_URL = 'https://example.test/notes/doc.md';

async function serveDoc(page: Page, body: string, cors = true): Promise<void> {
  await page.route(DOC_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/markdown',
      headers: cors ? { 'Access-Control-Allow-Origin': '*' } : {},
      body,
    }),
  );
}

const editor = (page: Page) => page.locator('.cm-content');
const docParam = (page: Page) => new URL(page.url()).searchParams.get('doc');

test('opens a document from its URL, as a copy that remembers its origin', async ({ page }) => {
  await serveDoc(page, '# Depuis le web\n\n![logo](img/logo.png)\n');
  await page.goto(`/?src=${encodeURIComponent(DOC_URL)}`);
  await expect(editor(page)).toContainText('Depuis le web');
  // The origin chip names the host and folder; ?url= stays in the address bar.
  await expect(page.locator('#toolbar')).toContainText('example.test ▸ notes/');
  expect(new URL(page.url()).searchParams.get('src')).toBe(DOC_URL);
  // Relative images resolve against the document's URL.
  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  await expect(page.locator('#preview-pane img').first()).toHaveAttribute(
    'src',
    'https://example.test/notes/img/logo.png',
  );
});

test('reopening the URL reuses the copy: refreshed if untouched, kept if edited', async ({
  context,
}) => {
  const first = await context.newPage();
  await serveDoc(first, 'Version 1');
  await first.goto(`/?src=${encodeURIComponent(DOC_URL)}`);
  await expect(editor(first)).toContainText('Version 1');
  const uuid = docParam(first);
  await first.close();

  // Untouched local copy + a newer remote → refreshed silently, same document.
  const second = await context.newPage();
  await serveDoc(second, 'Version 2');
  await second.goto(`/?src=${encodeURIComponent(DOC_URL)}`);
  await expect(editor(second)).toContainText('Version 2');
  expect(docParam(second)).toBe(uuid);

  // Edit locally, then the remote moves on: the local copy is kept, and said so.
  await editor(second).click();
  await second.keyboard.press('ControlOrMeta+End');
  await second.keyboard.type(' — ma note');
  await second.waitForTimeout(600); // autosave
  await second.close();
  const third = await context.newPage();
  await serveDoc(third, 'Version 3');
  await third.goto(`/?src=${encodeURIComponent(DOC_URL)}`);
  await expect(editor(third)).toContainText('Version 2 — ma note');
  await expect(third.locator('#mp-url')).toContainText('copie locale');
  expect(docParam(third)).toBe(uuid);
});

test('a document that cannot be read says so', async ({ page }) => {
  // Unreachable, or refused by the site (CORS): both surface as a failed fetch.
  await page.route(DOC_URL, (route) => route.abort('failed'));
  await page.goto(`/?src=${encodeURIComponent(DOC_URL)}`);
  await expect(page.locator('#mp-url')).toContainText("n’autorise pas");
  // An HTTP error names its status.
  await page.unroute(DOC_URL);
  await page.route(DOC_URL, (route) => route.fulfill({ status: 404, body: 'nope' }));
  await page.goto(`/?src=${encodeURIComponent(DOC_URL)}`);
  await expect(page.locator('#mp-url')).toContainText('HTTP 404');
});

test('?open= names a volume that is not mounted: says so', async ({ page }) => {
  await page.goto('/?open=projets/rapport.md');
  await expect(page.locator('.mp-notice')).toContainText('« projets/rapport.md »');
});
