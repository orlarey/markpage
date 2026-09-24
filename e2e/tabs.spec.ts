import { expect, test, type Page } from './fixtures';

/**
 * One document per tab (tab-presence.ts): opening a document gives it a new
 * tab unless this one holds an empty, unmodified document; a document already
 * open elsewhere is pointed to, not duplicated; a second tab on the same
 * document (duplicated tab, typed URL) is read-only until it takes it over —
 * and a read-only tab never writes.
 */

const editorText = (page: Page) => page.locator('.cm-content');

async function newDocument(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fichier ▾' }).click();
  await page.getByRole('button', { name: 'Nouveau document' }).click();
}

/** Run `action` on `page` and return the tab it opens. */
async function opensTab(page: Page, action: () => Promise<void>): Promise<Page> {
  const [tab] = await Promise.all([page.context().waitForEvent('page'), action()]);
  await tab.waitForURL(/\?doc=/);
  await tab.locator('.cm-content').waitFor();
  return tab;
}

const docParam = (page: Page) => new URL(page.url()).searchParams.get('doc');

async function typeIn(page: Page, text: string): Promise<void> {
  await editorText(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

test('New opens a new tab; an empty unmodified tab is reused', async ({ page }) => {
  await page.goto('/');
  // The help document is not empty → New opens its own tab.
  const tab = await opensTab(page, () => newDocument(page));
  await expect(tab).toHaveTitle(/Sans titre/);
  const first = docParam(tab);
  // That tab holds an empty, unmodified document → New reuses it.
  const pagesBefore = page.context().pages().length;
  await newDocument(tab);
  await expect.poll(() => docParam(tab)).not.toBe(first);
  expect(page.context().pages().length).toBe(pagesBefore);
});

test('a document open in another tab is pointed to, not reopened', async ({ page }) => {
  await page.goto('/');
  const helpId = docParam(page);
  const tab = await opensTab(page, () => newDocument(page));
  await typeIn(tab, 'Brouillon');

  // From the second tab, open the help document (held by the first tab).
  const pagesBefore = page.context().pages().length;
  await tab.keyboard.press('ControlOrMeta+o');
  await tab.locator('.vb-vol-row', { hasText: 'Bibliothèque' }).locator('.vb-row-name-btn').click();
  await tab.locator('.vb-row', { hasText: 'Aide' }).locator('.vb-row-name-btn').click();
  await expect(tab.locator('.mp-notice')).toContainText('déjà ouvert dans un autre onglet');
  expect(page.context().pages().length).toBe(pagesBefore);
  expect(docParam(tab)).not.toBe(helpId);
});

test('a second tab on the same document is read-only until it takes it over', async ({
  page,
}) => {
  await page.goto('/');
  // A short document (the editor only renders the lines in view).
  const owner = await opensTab(page, () => newDocument(page));
  const docId = docParam(owner);
  await typeIn(owner, 'Premier onglet.');

  // A duplicated tab / a typed URL on the same document.
  const dup = await page.context().newPage();
  await dup.goto(`/?doc=${docId}`);
  await dup.locator('.cm-content').waitFor();
  const banner = dup.locator('#mp-readonly');
  await expect(banner).toContainText('lecture seule');
  await expect(editorText(dup)).toHaveAttribute('contenteditable', 'false');

  // The owner's latest work reaches the read-only copy.
  await expect(editorText(dup)).toContainText('Premier onglet.');

  // Take it over: editable here, read-only in the first tab.
  await banner.getByRole('button', { name: 'Le modifier ici' }).click();
  await expect(banner).toHaveCount(0);
  await expect(editorText(dup)).toHaveAttribute('contenteditable', 'true');
  await expect(owner.locator('#mp-readonly')).toContainText('repris dans un autre onglet');
  await expect(editorText(owner)).toHaveAttribute('contenteditable', 'false');

  // Edits land from the new owner; the former owner writes nothing.
  await typeIn(dup, '\nDeuxième onglet.');
  const fresh = await page.context().newPage();
  await dup.waitForTimeout(600); // autosave debounce
  await dup.close(); // release the lock so a third tab can own it
  await fresh.goto(`/?doc=${docId}`);
  await expect(editorText(fresh)).toContainText('Deuxième onglet.');
  await expect(editorText(fresh)).toContainText('Premier onglet.');
});

test('a write from another tab never drops what this tab created (shared index)', async ({
  page,
}) => {
  await page.goto('/');
  // Tab 1 (help) has loaded the index. Tab 2 then creates a document itself:
  // New from a tab holding text runs createDoc IN that tab.
  const tab2 = await opensTab(page, () => newDocument(page));
  await typeIn(tab2, 'deux');
  await opensTab(tab2, () => newDocument(tab2)); // created by tab 2
  // Tab 1 writes the index from its own (older) copy — an autosave…
  await typeIn(page, 'x');
  await page.waitForTimeout(600); // autosave debounce
  // …and both documents created elsewhere are still in the library.
  await page.keyboard.press('ControlOrMeta+o');
  await page.locator('.vb-vol-row', { hasText: 'Bibliothèque' }).locator('.vb-row-name-btn').click();
  await expect(page.locator('.vb-row', { hasText: 'Sans titre' })).toHaveCount(2);
});
