import { expect, test, type BrowserContext, type Page } from './fixtures';

/**
 * Purpose: A stored GitHub token that GitHub now rejects (expired, revoked).
 *   It used to be kept for good — nothing in the app could replace it — and to
 *   fail obscurely: the repo read "hors-ligne", and opening a document left a
 *   blank "about:blank" tab in front while an alert "Erreur GitHub (HTTP 401)"
 *   waited, unseen, in the tab behind (Chrome does not show an alert raised by
 *   a background tab). Now: the repo says the token is refused and offers to
 *   replace it; a failed open closes its placeholder tab FIRST and asks for a
 *   new token in the tab the user is brought back to; File ▸ Open has a
 *   "Jeton GitHub…" command.
 *   GitHub's API is stubbed and token-aware: OLD is rejected once `expired`.
 */

const OLD = 'github_pat_11OLD00' + 'a'.repeat(80);
const NEW = 'github_pat_11NEW00' + 'b'.repeat(80);

interface Api {
  expired: boolean; // OLD → 401 everywhere
  refuseRead: boolean; // OLD → 401 on file contents only (listing still works)
}

async function stubGithub(context: BrowserContext, api: Api): Promise<void> {
  const tree = {
    sha: 't1',
    truncated: false,
    tree: [
      { path: 'notes', type: 'tree', sha: 'n', mode: '040000' },
      { path: 'notes/LE-REGIME-FIGE.md', type: 'blob', sha: 'x', mode: '100644', size: 20 },
    ],
  };
  await context.route('https://api.github.com/**', (route) => {
    const u = route.request().url();
    const token = (route.request().headers().authorization ?? '').replace(/^Bearer /, '');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const refused = () => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' });
    if (token === OLD && api.expired) return refused();
    if (u.endsWith('/user')) return json({ login: 'yann-test' });
    if (/\/repos\/orlarey\/faust-migration$/.test(u)) return json({ private: true });
    if (/git\/ref\/heads\/main$/.test(u)) return json({ object: { sha: 'c1' } });
    if (/git\/commits\/c1$/.test(u)) return json({ tree: { sha: 't1' } });
    if (/git\/trees\/t1\?recursive=1$/.test(u)) return json(tree);
    if (/\/contents\//.test(u)) {
      if (token === OLD && api.refuseRead) return refused();
      return json({ type: 'file', encoding: 'base64', content: btoa('# Le regime fige\n\nDu texte.\n'), sha: 'x', size: 28 });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
}

async function openBrowser(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await expect(page.locator('.vb-overlay')).toBeVisible();
}

/** Mount orlarey/faust-migration@main with the OLD token, then reload. */
async function mountWithOldToken(page: Page, nativeDialogs: string[]): Promise<void> {
  const answers = ['orlarey/faust-migration', 'main'];
  page.on('dialog', (d) => {
    if (d.type() === 'prompt') void d.accept(answers.shift());
    else {
      nativeDialogs.push(`${d.type()}: ${d.message()}`);
      void d.accept();
    }
  });
  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  // A real document in this tab, so that opening another one takes a new tab.
  await page.locator('.cm-content').click();
  await page.keyboard.type('du texte');
  await openBrowser(page);
  await page.getByText('Monter un dépôt…').click();
  await page.locator('.mp-token-input').fill(OLD);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.vb-list')).toContainText('orlarey/faust-migration@main');
  await page.keyboard.press('Escape');
}

test('expired token: the repo says so and the token can be replaced', async ({ page, context }) => {
  test.setTimeout(120_000);
  const api: Api = { expired: false, refuseRead: false };
  await stubGithub(context, api);
  const native: string[] = [];
  await mountWithOldToken(page, native);

  api.expired = true;
  await page.reload();
  await page.locator('.cm-content').waitFor();
  await openBrowser(page);
  const row = page.locator('.vb-vol-row', { hasText: 'orlarey/faust-migration@main' });
  await expect(row).toContainText('jeton GitHub refusé'); // not "hors-ligne"
  await row.getByRole('button', { name: 'Remplacer le jeton…' }).click();

  const dialog = page.locator('#mp-token-dialog');
  await expect(dialog.locator('.mp-token-refused')).toContainText('GitHub refuse le jeton enregistré');
  await dialog.locator('.mp-token-input').fill(NEW);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.mp-notice')).toContainText('Jeton GitHub remplacé');

  // The browser is rebuilt with the new token: the repo lists again.
  const fresh = page.locator('.vb-vol-row', { hasText: 'orlarey/faust-migration@main' });
  await expect(fresh).not.toContainText('refusé');
  await fresh.locator('.vb-row-name').click();
  await expect(page.locator('.vb-list')).toContainText('notes');
  expect(native).toEqual([]);
});

test('expired token: a refused open closes its tab and asks for a new token here', async ({ page, context }) => {
  test.setTimeout(120_000);
  const api: Api = { expired: false, refuseRead: false };
  await stubGithub(context, api);
  const native: string[] = [];
  await mountWithOldToken(page, native);

  api.refuseRead = true; // the listing works, the read is refused
  await openBrowser(page);
  await page.locator('.vb-vol-row .vb-row-name', { hasText: 'orlarey/faust-migration@main' }).click();
  await page.locator('.vb-row-name', { hasText: 'notes' }).click();
  const opened = context.waitForEvent('page');
  await page.locator('.vb-row-name', { hasText: 'LE-REGIME-FIGE.md' }).click();
  const tab = await opened;

  // The placeholder is closed — no blank tab left in front —, no native alert
  // waits behind it, and this tab asks for a new token, saying why.
  await expect.poll(() => tab.isClosed(), { timeout: 15_000 }).toBe(true);
  const dialog = page.locator('#mp-token-dialog');
  await expect(dialog.locator('.mp-token-refused')).toBeVisible();
  expect(native).toEqual([]);

  // With a new token, the same document opens.
  await dialog.locator('.mp-token-input').fill(NEW);
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.mp-notice')).toContainText('Recommencez');
  // Open resumes in the folder visited last: the file is right there.
  await openBrowser(page);
  const reopened = context.waitForEvent('page');
  await page.locator('.vb-row-name', { hasText: 'LE-REGIME-FIGE.md' }).click();
  const doc = await reopened;
  await expect(doc).toHaveURL(/\?doc=/, { timeout: 15_000 });
  await expect(doc.locator('.cm-content')).toContainText('Du texte.');
});

test('open: the new tab says what it is opening, and File ▸ Open has a token command', async ({ page, context }) => {
  test.setTimeout(120_000);
  const api: Api = { expired: false, refuseRead: false };
  await stubGithub(context, api);
  await mountWithOldToken(page, []);

  await openBrowser(page);
  await page.getByRole('button', { name: 'Jeton GitHub…' }).click();
  await expect(page.locator('#mp-token-dialog')).toBeVisible();
  await expect(page.locator('#mp-token-dialog .mp-token-refused')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Hold the file read: the placeholder shows what is coming meanwhile.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await context.route('https://api.github.com/**/contents/**', async (route) => {
    await held;
    await route.fallback();
  });
  await page.locator('.vb-vol-row .vb-row-name', { hasText: 'orlarey/faust-migration@main' }).click();
  await page.locator('.vb-row-name', { hasText: 'notes' }).click();
  const opened = context.waitForEvent('page');
  await page.locator('.vb-row-name', { hasText: 'LE-REGIME-FIGE.md' }).click();
  const tab = await opened;
  await expect(tab.locator('body')).toContainText('Ouverture de « LE-REGIME-FIGE.md »…');
  release();
  await expect(tab).toHaveURL(/\?doc=/, { timeout: 15_000 });
});
