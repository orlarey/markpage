import { expect, test } from './fixtures';

/**
 * Purpose: In a GitHub repo the browser had no Name / Date toggle: the git
 *   tree it lists carries no dates. The last-commit date of the folder's
 *   markdown files now comes through one GraphQL request (github.ts,
 *   getLastCommitDates): the list shows at once, by name; when the dates
 *   arrive, each file shows its date and the toggle appears.
 *   GitHub's API is stubbed; the GraphQL answer is held to observe "before".
 */

const DATES: Record<string, string> = {
  'notes/ANCIEN.md': '2026-01-05T09:00:00Z',
  'notes/RECENT.md': '2026-11-24T18:30:00Z',
  'notes/MILIEU.md': '2026-06-10T12:00:00Z',
};

test('repo: files get their last-commit date, and the Name / Date sort', async ({ page }) => {
  test.setTimeout(120_000);
  const tree = {
    sha: 't1',
    truncated: false,
    tree: [
      { path: 'notes', type: 'tree', sha: 'n', mode: '040000' },
      ...Object.keys(DATES).map((p) => ({ path: p, type: 'blob', sha: p, mode: '100644', size: 10 })),
      { path: 'notes/donnees.tsv', type: 'blob', sha: 'd', mode: '100644', size: 10 },
    ],
  };
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  const asked: string[] = [];
  await page.route('https://api.github.com/**', async (route) => {
    const u = route.request().url();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.endsWith('/user')) return json({ login: 'yann-test' });
    if (/\/repos\/orlarey\/faust-migration$/.test(u)) return json({ private: true });
    if (/git\/ref\/heads\/main$/.test(u)) return json({ object: { sha: 'c1' } });
    if (/git\/commits\/c1$/.test(u)) return json({ tree: { sha: 't1' } });
    if (/git\/trees\/t1\?recursive=1$/.test(u)) return json(tree);
    if (u.endsWith('/graphql')) {
      const { query } = route.request().postDataJSON() as { query: string };
      asked.push(query);
      await held;
      const target: Record<string, unknown> = {};
      for (const m of query.matchAll(/(f\d+):history\(first:1,path:"([^"]+)"\)/g)) {
        target[m[1]!] = { nodes: [{ committedDate: DATES[m[2]!] }] };
      }
      return json({ data: { repository: { ref: { target } } } });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  const answers = ['orlarey/faust-migration', 'main'];
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? answers.shift() : undefined));

  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await page.getByText('Monter un dépôt…').click();
  await page.locator('.mp-token-input').fill('github_pat_11TEST0' + 'x'.repeat(80));
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('.vb-vol-row .vb-row-name', { hasText: 'orlarey/faust-migration@main' }).click();
  await page.locator('.vb-row-name', { hasText: 'notes' }).click();

  // Before the dates: the list is there at once, by name, without the toggle.
  const names = page.locator('.vb-list .vb-row-name');
  await expect(names).toHaveText(['ANCIEN.md', 'donnees.tsv', 'MILIEU.md', 'RECENT.md']);
  await expect(page.locator('.vb-sort')).toBeHidden();
  await expect(page.locator('.vb-row-date')).toHaveCount(0);

  // One request, for the three markdown files (not the .tsv, not the folder).
  await expect.poll(() => asked.length).toBe(1);
  expect((asked[0]!.match(/history\(/g) ?? []).length).toBe(3);

  // The dates arrive: each markdown file shows its date, the toggle appears.
  release();
  await expect(page.locator('.vb-row-date')).toHaveCount(3);
  await expect(page.locator('.vb-sort')).toBeVisible();

  // By date: most recent first; the undated file after the dated ones.
  await page.locator('.vb-sort [data-sort="date"]').click();
  await expect(names).toHaveText(['RECENT.md', 'MILIEU.md', 'ANCIEN.md', 'donnees.tsv']);
  await page.locator('.vb-sort [data-sort="name"]').click();
  await expect(names).toHaveText(['ANCIEN.md', 'donnees.tsv', 'MILIEU.md', 'RECENT.md']);

  // Leaving and coming back does not ask GitHub again.
  await page.locator('.vb-crumbs').getByText('orlarey/faust-migration@main').click();
  await page.locator('.vb-row-name', { hasText: 'notes' }).click();
  await expect(page.locator('.vb-row-date')).toHaveCount(3);
  expect(asked.length).toBe(1);
});

test('repo: without dates (GitHub refuses the request) the list still works', async ({ page }) => {
  const tree = { sha: 't1', truncated: false, tree: [{ path: 'A.md', type: 'blob', sha: 'a', mode: '100644', size: 1 }] };
  await page.route('https://api.github.com/**', (route) => {
    const u = route.request().url();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.endsWith('/user')) return json({ login: 'yann-test' });
    if (/git\/ref\/heads\/main$/.test(u)) return json({ object: { sha: 'c1' } });
    if (/git\/commits\/c1$/.test(u)) return json({ tree: { sha: 't1' } });
    if (/git\/trees\/t1\?recursive=1$/.test(u)) return json(tree);
    if (u.endsWith('/graphql')) return route.fulfill({ status: 403, body: '{"message":"Resource not accessible"}' });
    return route.fulfill({ status: 404, body: '{}' });
  });
  const answers = ['orlarey/faust-migration', 'main'];
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? answers.shift() : undefined));
  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await page.getByText('Monter un dépôt…').click();
  await page.locator('.mp-token-input').fill('github_pat_11TEST0' + 'x'.repeat(80));
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('.vb-vol-row .vb-row-name', { hasText: 'orlarey/faust-migration@main' }).click();
  await expect(page.locator('.vb-list .vb-row-name')).toHaveText(['A.md']);
  await page.waitForTimeout(1500);
  await expect(page.locator('.vb-list .vb-row-name')).toHaveText(['A.md']);
  await expect(page.locator('.vb-sort')).toBeHidden();
  await expect(page.locator('#mp-token-dialog')).toHaveCount(0);
});
