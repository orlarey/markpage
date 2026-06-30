import { test, expect } from '@playwright/test';

/**
 * "Nouveau à partir de…" (STACK-SPEC §3.4): picking a library document creates a
 * new one whose front-matter `extends` the chosen layer.
 */
test('Nouveau à partir de… creates a doc that extends the chosen layer', async ({ page }) => {
  await page.goto('/');

  const fichier = page.getByRole('button', { name: /Fichier/ });
  const fileMenu = page.locator('#file-menu');

  // Create a second document so the first becomes a pickable "other" layer.
  await fichier.click();
  await fileMenu.getByText('Nouveau document', { exact: true }).click();

  // Now open "Nouveau à partir de…" and pick the first listed document.
  await fichier.click();
  await fileMenu.getByText('Nouveau à partir de…', { exact: true }).click();

  const modal = page.locator('#new-from-overlay');
  await expect(modal).toBeVisible();
  await modal.locator('.file-menu-item').first().click();

  // The new document's source should carry the extends key.
  await expect
    .poll(() => page.locator('.cm-content').innerText())
    .toContain('extends:');
});
