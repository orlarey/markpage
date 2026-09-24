import { expect, test, type Page } from './fixtures';

/**
 * The file browser's Récents (documents opened last, whatever their source) and
 * its Name / Date toggle. In e2e the Bibliothèque is the only mounted volume.
 */

async function openBrowser(page: Page): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+o');
  await page.locator('.vb-panel').waitFor();
}

/** New document (it opens in its own tab — the current one holds text), typed
 *  into; returns that tab. */
async function newDoc(page: Page, text: string): Promise<Page> {
  const [tab] = await Promise.all([
    page.context().waitForEvent('page'),
    (async () => {
      await page.getByRole('button', { name: 'Fichier ▾' }).click();
      await page.getByRole('button', { name: 'Nouveau document' }).click();
    })(),
  ]);
  await tab.waitForURL(/\?doc=/);
  await tab.locator('.cm-content').click();
  await tab.keyboard.type(text);
  return tab;
}

const fileNames = (page: Page) =>
  page.locator('.vb-row[data-type="file"] .vb-row-name').allTextContents();

test('Récents lists the documents opened last, current one excluded', async ({ page }) => {
  await page.goto('/');
  const first = await newDoc(page, 'Premier');
  const second = await newDoc(first, 'Second');
  // Close the first document's tab: it can then be reopened from Récents.
  await first.close();

  await openBrowser(second);
  await second.locator('.vb-vol-row', { hasText: 'Récents' }).locator('.vb-row-name-btn').click();
  // The current doc (Second) is excluded; the first one and the help remain,
  // most recent first, each with its origin and a date.
  const rows = second.locator('.vb-row[data-type="file"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('.vb-row-detail')).toHaveText('Bibliothèque');
  await expect(rows.first().locator('.vb-row-date')).not.toBeEmpty();
  // Récents keep their order: no Name / Date toggle there.
  await expect(second.locator('.vb-sort')).toBeHidden();

  // Opening it gives it its own tab (the current one holds text).
  const [reopened] = await Promise.all([
    second.context().waitForEvent('page'),
    rows.first().locator('.vb-row-name-btn').click(),
  ]);
  await reopened.waitForURL(/\?doc=/);
  await expect(reopened.locator('.cm-content')).toContainText('Premier');
});

test('the Name / Date toggle orders the library and is remembered', async ({ page }) => {
  await page.goto('/');
  // Two more documents, created in order → distinct mtimes.
  const tab = await newDoc(await newDoc(page, 'a'), 'b');
  await openBrowser(tab);
  await tab.locator('.vb-vol-row', { hasText: 'Bibliothèque' }).locator('.vb-row-name-btn').click();

  const toggle = tab.locator('.vb-sort');
  await expect(toggle).toBeVisible();
  await toggle.getByRole('button', { name: 'Date' }).click();
  await expect(toggle.locator('.vb-sort-btn.active')).toHaveText('Date');
  const byDate = await fileNames(tab);
  await toggle.getByRole('button', { name: 'Nom' }).click();
  const byName = await fileNames(tab);
  expect([...byName].sort((x, y) => x.localeCompare(y, 'fr'))).toEqual(byName);
  expect(byDate.length).toBe(byName.length);

  // Remembered across reopenings.
  await toggle.getByRole('button', { name: 'Date' }).click();
  await tab.keyboard.press('Escape');
  await openBrowser(tab);
  await expect(tab.locator('.vb-sort .vb-sort-btn.active')).toHaveText('Date');
});
