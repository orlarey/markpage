import { expect, test, type Page } from './fixtures';

/**
 * The file browser resumes where the user was (the current doc's origin folder,
 * else the last folder visited, remembered across sessions). In e2e only the
 * Bibliothèque is mounted: entering it must be remembered, and the Corbeille —
 * never a place to resume in — maps back to the Bibliothèque's root.
 */

async function openBrowser(page: Page): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+o');
  await page.locator('.vb-panel').waitFor();
}

async function closeBrowser(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('.vb-panel')).toHaveCount(0);
}

const crumbs = (page: Page) =>
  page.locator('.vb-crumbs .vb-crumb').allTextContents();

test('the browser reopens in the last folder visited', async ({ page }) => {
  await page.goto('/');

  // First open: the common root (nothing remembered, library doc).
  await openBrowser(page);
  expect(await crumbs(page)).toEqual(['markpage']);

  // Enter the Bibliothèque, close, reopen → back inside it.
  await page.locator('.vb-vol-row', { hasText: 'Bibliothèque' }).locator('.vb-row-name-btn').click();
  await expect.poll(() => crumbs(page)).toEqual(['markpage', 'Bibliothèque']);
  await closeBrowser(page);
  await openBrowser(page);
  await expect.poll(() => crumbs(page)).toEqual(['markpage', 'Bibliothèque']);

  // Survives a reload (remembered across sessions).
  await closeBrowser(page);
  await page.reload();
  await openBrowser(page);
  await expect.poll(() => crumbs(page)).toEqual(['markpage', 'Bibliothèque']);

  // The Corbeille is not remembered as such: reopening lands on the library
  // root. It only shows once something is in it — trash a second document.
  await closeBrowser(page);
  await page.getByRole('button', { name: 'Fichier ▾' }).click();
  await page.getByRole('button', { name: 'Nouveau document' }).click();
  await openBrowser(page);
  const rows = page.locator('.vb-row[data-type="file"]');
  await expect(rows).toHaveCount(2);
  await rows.first().locator('.vb-row-action.delete').click();
  await page.locator('.vb-row', { hasText: 'Corbeille' }).locator('.vb-row-name-btn').click();
  await expect.poll(() => crumbs(page)).toEqual(['markpage', 'Bibliothèque', 'Corbeille']);
  await closeBrowser(page);
  await openBrowser(page);
  await expect.poll(() => crumbs(page)).toEqual(['markpage', 'Bibliothèque']);

  // Back to the root is remembered too.
  await page.locator('.vb-crumb', { hasText: 'markpage' }).click();
  await closeBrowser(page);
  await openBrowser(page);
  await expect.poll(() => crumbs(page)).toEqual(['markpage']);
});
