import { test, expect } from '@playwright/test';

/**
 * Default style for new documents (STACK-SPEC §3.4, Acte 5): once a document is
 * designated as the default style, "Nouveau document" seeds the new one with
 * `extends: <that style>`.
 */
test('a new document extends the designated default style', async ({ page }) => {
  await page.goto('/');

  const fichier = page.getByRole('button', { name: /Fichier/ });
  const menu = page.locator('#file-menu');

  // Designate the current document as the default style.
  await fichier.click();
  await menu.getByText('Définir comme style par défaut', { exact: true }).click();

  // Re-opening the menu now offers to remove it (toggle reflects the state).
  await fichier.click();
  await expect(menu.getByText('Retirer le style par défaut', { exact: true })).toBeVisible();

  // A brand-new document inherits it via extends.
  await menu.getByText('Nouveau document', { exact: true }).click();
  await expect.poll(() => page.locator('.cm-content').innerText()).toContain('extends:');
});
