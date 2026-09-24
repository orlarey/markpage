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

async function newDoc(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Fichier ▾' }).click();
  await page.getByRole('button', { name: 'Nouveau document' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.type(text);
}

const fileNames = (page: Page) =>
  page.locator('.vb-row[data-type="file"] .vb-row-name').allTextContents();

test('Récents lists the documents opened last, current one excluded', async ({ page }) => {
  await page.goto('/');
  await newDoc(page, 'Premier');
  await newDoc(page, 'Second');

  await openBrowser(page);
  await page.locator('.vb-vol-row', { hasText: 'Récents' }).locator('.vb-row-name-btn').click();
  // Current doc (the second "Sans titre") is excluded; the other two remain,
  // most recent first, each with its origin and a date.
  const rows = page.locator('.vb-row[data-type="file"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('.vb-row-detail')).toHaveText('Bibliothèque');
  await expect(rows.first().locator('.vb-row-date')).not.toBeEmpty();
  // Récents keep their order: no Name / Date toggle there.
  await expect(page.locator('.vb-sort')).toBeHidden();

  // Opening one switches to it.
  await rows.first().locator('.vb-row-name-btn').click();
  await expect(page.locator('.vb-panel')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('Premier');
});

test('the Name / Date toggle orders the library and is remembered', async ({ page }) => {
  await page.goto('/');
  // Rename-free setup: three docs, created in order → distinct mtimes.
  await newDoc(page, 'a');
  await newDoc(page, 'b');
  await openBrowser(page);
  await page.locator('.vb-vol-row', { hasText: 'Bibliothèque' }).locator('.vb-row-name-btn').click();

  const toggle = page.locator('.vb-sort');
  await expect(toggle).toBeVisible();
  await toggle.getByRole('button', { name: 'Date' }).click();
  await expect(toggle.locator('.vb-sort-btn.active')).toHaveText('Date');
  const byDate = await fileNames(page);
  await toggle.getByRole('button', { name: 'Nom' }).click();
  const byName = await fileNames(page);
  expect([...byName].sort((x, y) => x.localeCompare(y, 'fr'))).toEqual(byName);
  expect(byDate.length).toBe(byName.length);

  // Remembered across reopenings.
  await toggle.getByRole('button', { name: 'Date' }).click();
  await page.keyboard.press('Escape');
  await openBrowser(page);
  await expect(page.locator('.vb-sort .vb-sort-btn.active')).toHaveText('Date');
});
