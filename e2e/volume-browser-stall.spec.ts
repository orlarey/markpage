import { expect, test, type Page } from './fixtures';

/**
 * Purpose: File ▸ Open and Save As resume in the folder visited last. When that
 *   folder is in a mounted GitHub repo whose requests never answer, both came
 *   up EMPTY — not even the breadcrumb — for as long as the request hung
 *   (Yann's Chrome, a private repo just mounted). The root must show at once;
 *   the remembered folder is entered only if its volume answers in time.
 *   GitHub's API is stubbed; `stall` makes it stop answering.
 */

const REPO = 'repo:orlarey/faust-migration@main';

async function mountRepo(page: Page, stall: { on: boolean }): Promise<void> {
  const tree = {
    sha: 't1',
    truncated: false,
    tree: [
      { path: 'notes', type: 'tree', sha: 'n', mode: '040000' },
      { path: 'notes/LE-REGIME-FIGE.md', type: 'blob', sha: 'x', mode: '100644' },
    ],
  };
  await page.route('https://api.github.com/**', (route) => {
    const u = route.request().url();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.endsWith('/user')) return json({ login: 'orlarey' });
    if (/\/repos\/orlarey\/faust-migration$/.test(u)) return json({ private: true });
    if (stall.on) return; // never answered
    if (/git\/ref\/heads\/main$/.test(u)) return json({ object: { sha: 'c1' } });
    if (/git\/commits\/c1$/.test(u)) return json({ tree: { sha: 't1' } });
    if (/git\/trees\/t1\?recursive=1$/.test(u)) return json(tree);
    return route.fulfill({ status: 404, body: '{}' });
  });
  const answers = ['github_pat_11TEST0' + 'x'.repeat(80), 'orlarey/faust-migration', 'main'];
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? answers.shift() : undefined));
  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await page.getByText('Monter un dépôt…').click();
  await expect(page.locator('.vb-list')).toContainText('orlarey/faust-migration@main');
  await page.keyboard.press('Escape');
  // Remember a folder inside the repo, as a previous visit would.
  await page.evaluate(
    (id) => localStorage.setItem('markpage:browser-location', JSON.stringify({ volumeId: id, path: 'notes' })),
    REPO,
  );
  await page.reload();
  await page.locator('.cm-content').waitFor();
}

async function openFileMenu(page: Page, item: RegExp | string): Promise<void> {
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText(item, { exact: typeof item === 'string' }).first().click();
}

test('open / save as: a stalled repo never leaves the browser empty', async ({ page }) => {
  test.setTimeout(120_000);
  const stall = { on: false };
  await mountRepo(page, stall);
  stall.on = true;

  await openFileMenu(page, 'Ouvrir…');
  // The root at once: breadcrumb and volumes, within a second.
  await expect(page.locator('.vb-crumbs')).toContainText('markpage', { timeout: 1500 });
  await expect(page.locator('.vb-list')).toContainText('Bibliothèque');
  await expect(page.locator('.vb-list')).toContainText('orlarey/faust-migration@main');
  // And it stays usable after the volume's time is up.
  await page.waitForTimeout(5000);
  await expect(page.locator('.vb-list')).toContainText('Bibliothèque');
  await page.keyboard.press('Escape');

  await openFileMenu(page, /Enregistrer sous/);
  await expect(page.locator('.vb-crumbs')).toContainText('markpage', { timeout: 1500 });
  await expect(page.locator('.vb-list')).toContainText('Bibliothèque');
});

test('open / save as: an answering repo still resumes in the remembered folder', async ({ page }) => {
  test.setTimeout(120_000);
  const stall = { on: false };
  await mountRepo(page, stall);

  await openFileMenu(page, 'Ouvrir…');
  await expect(page.locator('.vb-crumbs')).toContainText('notes', { timeout: 5000 });
  await expect(page.locator('.vb-list')).toContainText('LE-REGIME-FIGE.md');
  await page.keyboard.press('Escape');

  await openFileMenu(page, /Enregistrer sous/);
  await expect(page.locator('.vb-crumbs')).toContainText('notes', { timeout: 5000 });
});
