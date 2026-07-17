import { expect, test, type Page } from './fixtures';

async function replaceDocument(page: Page, markdown: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.evaluate(
    async (text) => navigator.clipboard.writeText(text),
    markdown,
  );
  await page.keyboard.press('ControlOrMeta+v');
}

async function openSettings(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('button.menu-trigger', { hasText: 'Réglages' }).click();
  const settings = await popupPromise;
  await settings.waitForLoadState();
  return settings;
}

test('essential settings and frontmatter remain strictly aligned', async ({
  page,
}) => {
  await page.goto('/');
  await replaceDocument(page, '# Synchronisation');
  const settings = await openSettings(page);

  const bodySizeField = () =>
    settings.locator('.settings-origin-field', {
      hasText: 'Taille du corps',
    });

  await expect(bodySizeField().locator('.settings-origin')).toHaveText(
    'Par défaut',
  );
  await expect(bodySizeField().locator('input[type="number"]')).toHaveValue(
    '11',
  );

  await bodySizeField().locator('input[type="number"]').fill('9');
  await expect(page.locator('.cm-content')).toContainText('body-size: 9');
  await expect(bodySizeField().locator('.settings-origin')).toHaveText(
    'Variation',
  );

  await replaceDocument(page, '# Synchronisation');

  await expect(bodySizeField().locator('input[type="number"]')).toHaveValue(
    '11',
  );
  await expect(bodySizeField().locator('.settings-origin')).toHaveText(
    'Par défaut',
  );
  await expect(page.locator('.cm-content')).not.toContainText('body-size:');
});

test('changing recipe resets variations as one undoable document edit', async ({
  page,
}) => {
  await page.goto('/');
  await replaceDocument(
    page,
    [
      '---',
      'title: Essai',
      'document-type: book',
      'appearance: classic',
      'body-size: 9',
      'accent: "#7a1f5c"',
      'styles.h1.color: "#ff0000"',
      '---',
      '',
      '# Lettre',
    ].join('\n'),
  );
  const settings = await openSettings(page);
  const modelField = settings.locator('.settings-origin-field', {
    hasText: 'Type de document',
  });
  const bodySizeField = settings.locator('.settings-origin-field', {
    hasText: 'Taille du corps',
  });

  await modelField.locator('select').selectOption('letter');

  await expect(page.locator('.cm-content')).toContainText(
    'document-type: letter',
  );
  await expect(page.locator('.cm-content')).toContainText(
    'appearance: classic',
  );
  await expect(page.locator('.cm-content')).not.toContainText('body-size:');
  await expect(page.locator('.cm-content')).not.toContainText('accent:');
  await expect(page.locator('.cm-content')).not.toContainText(
    'styles.h1.color:',
  );
  await expect(bodySizeField.locator('input[type="number"]')).toHaveValue('11');
  await expect(bodySizeField.locator('.settings-origin')).toHaveText(
    'Par défaut',
  );

  await settings.keyboard.press('ControlOrMeta+z');

  await expect(page.locator('.cm-content')).toContainText('document-type: book');
  await expect(page.locator('.cm-content')).toContainText('body-size: 9');
  await expect(page.locator('.cm-content')).toContainText(
    'styles.h1.color: "#ff0000"',
  );
  await expect(bodySizeField.locator('input[type="number"]')).toHaveValue('9');
  await expect(bodySizeField.locator('.settings-origin')).toHaveText(
    'Variation',
  );

  await settings.keyboard.press('ControlOrMeta+Shift+z');

  await expect(page.locator('.cm-content')).toContainText(
    'document-type: letter',
  );
  await expect(page.locator('.cm-content')).not.toContainText('body-size:');
  await expect(bodySizeField.locator('input[type="number"]')).toHaveValue('11');
});
