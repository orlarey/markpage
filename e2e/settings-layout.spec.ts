import { expect, test, type Page } from '@playwright/test';

/**
 * Purpose: Exercise the new "Mise en page" rail section (SPEC §9.5 /
 *   §9.6 / §9.7 Sub-phase A.2). Asserts the section appears, exposes
 *   the five layout levers plus the preset dropdown, the marginMode
 *   selector gates the two measure inputs, and the preset dropdown
 *   round-trips (applying a preset then reading it back).
 * How: Opens the Settings detached window via the toolbar button, then
 *   navigates to the Layout rail entry. All assertions run against the
 *   popup `Page` Playwright surfaces as a context event.
 */

async function openLayoutSection(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('button.menu-trigger', { hasText: 'Réglages' }).click();
  const settingsPage = await popupPromise;
  await settingsPage.waitForLoadState();
  // Rail entries are buttons with the section label as text content.
  await settingsPage.getByRole('button', { name: 'Mise en page', exact: true }).click();
  return settingsPage;
}

test('Layout section renders the six expected controls plus the preset dropdown', async ({ page }) => {
  await page.goto('/');
  const settings = await openLayoutSection(page);

  // Preset dropdown
  await expect(settings.locator('select').filter({ hasText: 'Personnalisé' }))
    .toBeVisible();
  // Five lever inputs by their labels
  for (const label of [
    'Mode des marges',
    'Mesure du texte (caractères / ligne)',
    'Mesure de la live area (caractères / ligne)',
    'Recto-verso',
    'Saut avant chapitre',
    'Position des notes',
  ]) {
    await expect(settings.getByText(label)).toBeVisible();
  }
});

test('marginMode = manual disables the two measure inputs', async ({ page }) => {
  await page.goto('/');
  const settings = await openLayoutSection(page);

  // The default profile ships with marginMode='manual'. Both measure
  // inputs must therefore be disabled.
  const measure = settings
    .getByText('Mesure du texte (caractères / ligne)')
    .locator('xpath=following-sibling::input');
  const liveArea = settings
    .getByText('Mesure de la live area (caractères / ligne)')
    .locator('xpath=following-sibling::input');
  await expect(measure).toBeDisabled();
  await expect(liveArea).toBeDisabled();

  // Flipping marginMode → 'derived' enables both.
  const modeSelect = settings
    .getByText('Mode des marges')
    .locator('xpath=following-sibling::select');
  await modeSelect.selectOption('derived');
  await expect(measure).toBeEnabled();
  await expect(liveArea).toBeEnabled();
});

test('Selecting the "Édition critique" preset wires every lever to its bundle', async ({ page }) => {
  await page.goto('/');
  const settings = await openLayoutSection(page);

  const presetSelect = settings.locator('select').first();
  await presetSelect.selectOption({ label: 'Édition critique' });

  // Layout section refreshes after a preset is applied. The section is
  // still in view — we re-read its inputs.
  const measure = settings
    .getByText('Mesure du texte (caractères / ligne)')
    .locator('xpath=following-sibling::input');
  const liveArea = settings
    .getByText('Mesure de la live area (caractères / ligne)')
    .locator('xpath=following-sibling::input');
  const duplex = settings
    .getByText('Recto-verso')
    .locator('xpath=following-sibling::input');
  const chapterBreak = settings
    .getByText('Saut avant chapitre')
    .locator('xpath=following-sibling::select');
  const notes = settings
    .getByText('Position des notes')
    .locator('xpath=following-sibling::select');

  await expect(measure).toHaveValue('52');
  await expect(liveArea).toHaveValue('85');
  await expect(duplex).toBeChecked();
  await expect(chapterBreak).toHaveValue('next-recto');
  await expect(notes).toHaveValue('side');
});

test('Invalid configuration surfaces an inline error (liveAreaChars ≤ measureChars)', async ({ page }) => {
  await page.goto('/');
  const settings = await openLayoutSection(page);

  // Move into 'derived' mode so the measures are interactive.
  await settings
    .getByText('Mode des marges')
    .locator('xpath=following-sibling::select')
    .selectOption('derived');

  // Force liveArea ≤ measure (the hard invariant of §9.6.3).
  const measure = settings
    .getByText('Mesure du texte (caractères / ligne)')
    .locator('xpath=following-sibling::input');
  const liveArea = settings
    .getByText('Mesure de la live area (caractères / ligne)')
    .locator('xpath=following-sibling::input');
  await measure.fill('70');
  await measure.blur();
  await liveArea.fill('60');
  await liveArea.blur();

  await expect(settings.locator('.field-error')).toContainText(
    'doit être strictement supérieur',
  );
});
