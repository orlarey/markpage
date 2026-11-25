import { join } from 'node:path';
import { expect, test } from './fixtures';

/**
 * Purpose: The GitHub token travels from one device to another by QR code
 *   (src/github-transfer.ts). Both halves, in the real app:
 *   1. receiving: markpage opened at `/#gh-token=…` takes the token out of the
 *      address at once, names the GitHub account in its confirmation, and
 *      stores the token;
 *   2. sending: File ▸ Open ▸ "Transférer le jeton GitHub…" shows a QR code
 *      that DECODES (jsQR, in the page) to exactly that transfer address.
 *   GitHub's API is stubbed: the token is fake, its account "yann-test".
 */

const TOKEN = 'github_pat_11TEST0000_fake0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

test('github token: received from a QR link, then shown as a QR that decodes back', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('https://api.github.com/user', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ login: 'yann-test' }) }),
  );
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });

  // 1. Receiving.
  await page.goto(`/#gh-token=${encodeURIComponent(TOKEN)}`);
  await page.locator('.cm-content').waitFor();
  await expect(page.locator('.mp-notice')).toContainText('yann-test', { timeout: 15_000 });
  expect(dialogs.join('\n')).toContain('yann-test');
  expect(page.url()).not.toContain('gh-token');
  expect(page.url()).not.toContain(TOKEN);
  const history = await page.evaluate(() => window.history.length);
  expect(history).toBeGreaterThan(0);

  // 2. Sending.
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await page.getByText('Transférer le jeton GitHub…').click();
  const qr = page.locator('#mp-token-transfer .mp-token-transfer-qr svg');
  await expect(qr).toBeVisible();
  // The token itself is never printed on screen.
  await expect(page.locator('#mp-token-transfer')).not.toContainText(TOKEN);

  await page.addScriptTag({ path: join(process.cwd(), 'node_modules/jsqr/dist/jsQR.js') });
  const decoded = await page.evaluate(async () => {
    const svg = document.querySelector('#mp-token-transfer .mp-token-transfer-qr svg') as SVGSVGElement;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const size = 600;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size);
    const jsQR = (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR;
    return jsQR(data.data, size, size)?.data ?? null;
  });
  const origin = new URL(page.url()).origin;
  expect(decoded).toBe(`${origin}/#gh-token=${encodeURIComponent(TOKEN)}`);

  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(page.locator('#mp-token-transfer')).toHaveCount(0);
});

test('github token: a link carrying a rejected token stores nothing', async ({ page }) => {
  await page.route('https://api.github.com/user', (route) => route.fulfill({ status: 401, body: '{}' }));
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await page.goto('/#gh-token=not-a-token');
  await page.locator('.cm-content').waitFor();
  await expect.poll(() => dialogs.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(page.url()).not.toContain('gh-token');
  // Nothing stored: File ▸ Open offers no transfer.
  await page.getByRole('button', { name: /Fichier/ }).first().click();
  await page.getByText('Ouvrir…', { exact: true }).click();
  await expect(page.getByText('Ouvrir un fichier…')).toBeVisible();
  await expect(page.getByText('Transférer le jeton GitHub…')).toHaveCount(0);
});
