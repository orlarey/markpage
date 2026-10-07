import { expect, test } from './fixtures';

/**
 * Ouvrir un fichier…: the `.md` opens in a tab of its own, linked in place.
 * In real Chrome the picker leaves no click to ask for write access with:
 * asking right away threw, and the new tab stayed `about:blank`. Write access
 * is now asked at the first Save; an open that fails closes its tab.
 */

const BODY = '# Fichier local\n\nOuvert depuis le disque.\n';

test('a file picked on disk opens in its own tab, though write access is not granted yet', async ({
  page,
  context,
}) => {
  await page.addInitScript((body) => {
    // As Chrome after the picker: write access not granted, and no gesture
    // left to ask for it with.
    const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
    proto['queryPermission'] = async () => 'prompt';
    proto['requestPermission'] = async () => {
      throw new DOMException('User activation is required to request permissions.', 'SecurityError');
    };
    (window as unknown as { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> }).showOpenFilePicker =
      async () => {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle('local.md', { create: true });
        const w = await fh.createWritable();
        await w.write(body);
        await w.close();
        return [fh];
      };
  }, BODY);
  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  const opened = context.waitForEvent('page');
  await page.getByText('Ouvrir un fichier…').click();
  const tab = await opened;
  await expect(tab).toHaveURL(/\?doc=/, { timeout: 15_000 });
  await expect(tab.locator('.cm-content')).toContainText('Ouvert depuis le disque.');
  // Linked in place: the origin chip names the file.
  await expect(tab.locator('#toolbar')).toContainText('local.md');
});

test('an open that fails closes its tab and says why', async ({ page, context }) => {
  await page.addInitScript(() => {
    (window as unknown as { showOpenFilePicker: () => Promise<unknown[]> }).showOpenFilePicker = async () => [
      {
        kind: 'file',
        name: 'casse.md',
        getFile: async () => {
          throw new Error('fichier illisible');
        },
        isSameEntry: async () => false,
      },
    ];
  });
  await page.goto('/');
  await page.locator('.cm-content').waitFor();
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  const opened = context.waitForEvent('page');
  await page.getByText('Ouvrir un fichier…').click();
  const tab = await opened;
  await expect.poll(() => tab.isClosed(), { timeout: 10_000 }).toBe(true);
  await expect(page.locator('.mp-notice')).toContainText('fichier illisible');
});
