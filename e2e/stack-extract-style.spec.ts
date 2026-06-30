import { test, expect } from '@playwright/test';

/**
 * "Extraire un style" (STACK-SPEC §3.4, the B→C bridge): the document's style
 * front-matter (tokens, dotted styles.* keys) moves into a new reusable layer,
 * and the document is re-parented to it via `extends`, keeping its metadata.
 */
test('Extraire un style moves style keys out and re-parents the document', async ({ page }) => {
  await page.goto('/');

  const doc = [
    '---',
    'title: Lettre',
    '--brand: "#0b3d91"',
    'styles.h2.color: var(--brand)',
    '---',
    '## Sub',
    '',
    'Body.',
  ].join('\n');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(async (t) => navigator.clipboard.writeText(t), doc);
  await page.keyboard.press('ControlOrMeta+v');

  await page.getByRole('button', { name: /Fichier/ }).click();
  await page.locator('#file-menu').getByText('Extraire un style…', { exact: true }).click();

  // The document now extends the extracted style, keeps its title, and no longer
  // carries the style keys.
  await expect.poll(() => page.locator('.cm-content').innerText()).toContain('extends:');
  const text = await page.locator('.cm-content').innerText();
  expect(text).toContain('title: Lettre');
  expect(text).not.toContain('--brand');
  expect(text).not.toContain('styles.h2.color');
});
