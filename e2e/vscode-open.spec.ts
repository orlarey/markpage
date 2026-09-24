import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

import { expect, test } from './fixtures';

// The extension's server core lives in another package (vscode/), which the
// test runner doesn't transpile: bundle it here, as the extension build does.
const here = dirname(fileURLToPath(import.meta.url));
const bundled = join(tmpdir(), `mp-local-server-core-${process.pid}.cjs`);
buildSync({
  entryPoints: [join(here, '../vscode/src/local-server-core.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundled,
  logLevel: 'silent',
});
const { LocalDocServer, markpageUrlFor } = createRequire(import.meta.url)(bundled) as typeof import('../vscode/src/local-server-core');

/**
 * "Open in markpage.org" end to end: the VS Code extension's loopback server
 * (its real core) serves a local file; the app opens the link the extension
 * builds — base64url `?src=` — as a URL document, images included. A second
 * session (new port, new token) finds the same library copy.
 */

const APP = 'http://localhost:5173';

test('a local file served by the extension opens in markpage', async ({ context }) => {
  const dir = join(await mkdtemp(join(tmpdir(), 'mp-vs-')), 'Mon projet');
  await mkdir(join(dir, 'img'), { recursive: true });
  const file = join(dir, 'rapport.md');
  await writeFile(file, '# Rapport local\n\n![schéma](img/s.svg)\n');
  await writeFile(
    join(dir, 'img', 's.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
  );
  const options = { allowedOrigins: () => new Set([APP]), bufferText: () => undefined };

  const first = new LocalDocServer(options);
  const page = await context.newPage();
  await page.goto(markpageUrlFor(APP, await first.share(file)));
  await expect(page.locator('.cm-content')).toContainText('Rapport local');
  await expect(page.locator('.doc-title-input')).toHaveValue('rapport.md');
  await expect(page.locator('#toolbar')).toContainText('Mon projet/');
  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  const img = page.locator('#preview-pane img').first();
  await expect(img).toHaveAttribute('src', /^http:\/\/127\.0\.0\.1:\d+\/.+\/img\/s\.svg$/);
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(10);
  const uuid = new URL(page.url()).searchParams.get('doc');
  await page.close();
  first.stop();

  // Another VS Code session: another port and token, the same file → same copy.
  const second = new LocalDocServer(options);
  const again = await context.newPage();
  await again.goto(markpageUrlFor(APP, await second.share(file)));
  await expect(again.locator('.cm-content')).toContainText('Rapport local');
  expect(new URL(again.url()).searchParams.get('doc')).toBe(uuid);
  second.stop();
});
