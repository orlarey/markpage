import { expect, test } from './fixtures';

/**
 * Purpose: The GitHub token is asked for in a real dialog (ui/token-dialog.ts),
 *   not a native prompt() whose text can be neither clicked nor selected — the
 *   address of GitHub's token page had to be retyped by hand. The link is a
 *   real one, pre-filled for markpage; a rejected token says so and can be
 *   corrected; an accepted one is stored (the repo then mounts).
 */

test('github token: a dialog with a clickable, pre-filled link; invalid then valid', async ({ page }) => {
  let accept = false;
  await page.route('https://api.github.com/**', (route) => {
    const u = route.request().url();
    if (u.endsWith('/user')) {
      return accept
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"login":"yann-test"}' })
        : route.fulfill({ status: 401, body: '{}' });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });
  const answers = ['orlarey/faust-migration', 'main'];
  const prompts: string[] = [];
  page.on('dialog', (d) => {
    prompts.push(d.message());
    void d.accept(d.type() === 'prompt' ? answers.shift() : undefined);
  });

  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await page.getByText('Monter un dépôt…').click();

  const dialog = page.locator('#mp-token-dialog');
  await expect(dialog).toBeVisible();
  // No native prompt carried the token request.
  expect(prompts).toEqual([]);

  // A real link, opening GitHub's form pre-filled, in a new tab.
  const link = dialog.getByRole('link', { name: 'Créer un jeton sur GitHub' });
  const href = (await link.getAttribute('href')) ?? '';
  expect(href.startsWith('https://github.com/settings/personal-access-tokens/new?')).toBe(true);
  expect(new URL(href).searchParams.get('contents')).toBe('write');
  expect(new URL(href).searchParams.get('name')).toBe('markpage');
  expect(await link.getAttribute('target')).toBe('_blank');
  expect(await link.getAttribute('rel')).toContain('noopener');

  // The field hides what is pasted.
  const input = dialog.locator('.mp-token-input');
  expect(await input.getAttribute('type')).toBe('password');

  // A rejected token: said inline, the dialog stays.
  await input.fill('not-a-token');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dialog.locator('.mp-token-error')).toHaveText('Jeton invalide ou expiré');
  await expect(dialog).toBeVisible();

  // An accepted one: stored, and the mount goes on (repo, then branch).
  accept = true;
  await input.fill('github_pat_11TEST0' + 'x'.repeat(80));
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => prompts.length).toBe(2);
  await expect(page.locator('.vb-list')).toContainText('orlarey/faust-migration@main');
});

test('github token: Escape cancels and stores nothing', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await page.getByText('Monter un dépôt…').click();
  await expect(page.locator('#mp-token-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mp-token-dialog')).toHaveCount(0);
  // Asked again next time: nothing was stored.
  await page.getByText('Monter un dépôt…').click();
  await expect(page.locator('#mp-token-dialog')).toBeVisible();
});
