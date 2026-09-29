import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

import { expect, test, type Page } from './fixtures';

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
const { LocalDocServer, markpageUrlFor } = createRequire(import.meta.url)(
  bundled
) as typeof import('../vscode/src/local-server-core');

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
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
  );
  const options = {
    allowedOrigins: () => new Set([APP]),
    bufferText: () => undefined,
  };

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

/** A local file opened from "VS Code", in a fresh page. */
async function openLocal(page: Page, text: string) {
  const file = join(await mkdtemp(join(tmpdir(), 'mp-vs-')), 'note.md');
  await writeFile(file, text);
  const server = new LocalDocServer({
    allowedOrigins: () => new Set([APP]),
    bufferText: () => undefined,
  });
  await page.goto(markpageUrlFor(APP, await server.share(file)));
  await expect(page.locator('.cm-content')).toContainText(text.trim());
  return { file, server };
}

async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

test('the local file is edited in place: Save writes it, VS Code edits come in', async ({
  page,
}) => {
  const { file, server } = await openLocal(page, 'Version VS Code');
  await expect(page.locator('#toolbar')).toContainText('VS Code ▸');

  // Save in markpage → the file on disk.
  await typeAtEnd(page, ' + markpage');
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => readFile(file, 'utf8')).toBe('Version VS Code + markpage');

  // Edited in VS Code (saved) → markpage takes it (nothing changed here).
  await writeFile(file, 'Réécrit dans VS Code');
  await expect(page.locator('.cm-content')).toContainText('Réécrit dans VS Code', {
    timeout: 8000,
  });
  server.stop();
});

test('changed on both sides: a conflict, nothing overwritten until the user chooses', async ({
  page,
}) => {
  const { file, server } = await openLocal(page, 'Base');
  await typeAtEnd(page, ' + markpage');
  await writeFile(file, 'Base + VS Code');
  const chip = page.locator('.doc-origin');
  await expect(chip).toHaveClass(/conflict/, { timeout: 8000 });
  await expect(page.locator('.cm-content')).toContainText('Base + markpage');

  // Save refuses to overwrite.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#mp-url')).toContainText('a changé dans VS Code');
  expect(await readFile(file, 'utf8')).toBe('Base + VS Code');

  // Keep mine: overwrite, on the user's say-so.
  await chip.click();
  await page.getByText('Garder ma version').click();
  await expect.poll(() => readFile(file, 'utf8')).toBe('Base + markpage');
  await expect(chip).not.toHaveClass(/conflict/);
  server.stop();
});

test('VS Code closed: Save keeps the work in markpage and says so', async ({ page }) => {
  const { file, server } = await openLocal(page, 'Avant');
  server.stop();
  await typeAtEnd(page, ' après');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#mp-url')).toContainText('VS Code ne répond pas');
  expect(await readFile(file, 'utf8')).toBe('Avant');
});

test('a reload keeps the mode and the place: same text, same height, changed lines flashed', async ({
  page,
}) => {
  const sections = (prefix: string, word: string, n: number) =>
    Array.from({ length: n }, (_, i) => `## ${prefix} ${i}\n\n${word} ${i}.\n`).join('\n');
  const body = sections('Section', 'Texte', 60);
  // Opened by hand: the editor only draws the lines in view, so the whole
  // text cannot be checked on screen.
  const file = join(await mkdtemp(join(tmpdir(), 'mp-vs-')), 'long.md');
  await writeFile(file, body);
  const server = new LocalDocServer({ allowedOrigins: () => new Set([APP]), bufferText: () => undefined });
  await page.goto(markpageUrlFor(APP, await server.share(file)));
  await expect(page.locator('.cm-content')).toContainText('Section 0');
  // Pages mode (the fixtures' preference), the caret on a line mid-document.
  await page.getByRole('button', { name: 'Aperçu' }).first().click();
  await expect(page.locator('#preview-pane .pagedjs_page').first()).toBeVisible({ timeout: 60_000 });
  const scroller = page.locator('.cm-scroller');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight * 0.6;
  });
  await page.waitForTimeout(500);
  const lineY = (text: string) =>
    page.evaluate((t) => {
      const s = document.querySelector('.cm-scroller')!.getBoundingClientRect();
      const l = [...document.querySelectorAll('.cm-line')].find((e) => (e.textContent ?? '').trim() === t);
      return l ? l.getBoundingClientRect().top - s.top : null;
    }, text);
  const previewY = (text: string) =>
    page.evaluate((t) => {
      const pane = document.querySelector('#preview-pane')!.getBoundingClientRect();
      const p = [...document.querySelectorAll('#preview-pane p')].find((e) => (e.textContent ?? '').trim() === t);
      return p ? p.getBoundingClientRect().top - pane.top : null;
    }, text);
  const target = await page.evaluate(() => {
    const s = document.querySelector('.cm-scroller')!.getBoundingClientRect();
    const l = [...document.querySelectorAll('.cm-line')].find((e) => {
      const r = e.getBoundingClientRect();
      return r.top > s.top + s.height * 0.4 && /^Texte \d+\.$/.test((e.textContent ?? '').trim());
    })!;
    const r = l.getBoundingClientRect();
    return { text: (l.textContent ?? '').trim(), x: r.left + 20, y: r.top + r.height / 2 };
  });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);
  const before = await lineY(target.text);
  expect(before).not.toBeNull();

  // Elsewhere, ten sections appear ABOVE: the auto-pull reloads.
  await writeFile(file, `${sections('Nouvelle', 'Nouveau', 10)}\n${body}`);
  await expect(page.locator('#mp-notice')).toContainText('rechargé', { timeout: 15_000 });
  await expect(page.locator('#preview-pane .pagedjs_page').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  // Same text, same height, in the editor and in the pages.
  expect(Math.abs((await lineY(target.text))! - before!)).toBeLessThan(10);
  const p = await previewY(target.text);
  expect(p).not.toBeNull();
  expect(Math.abs(p! - before!)).toBeLessThan(30);

  // A change on screen is flashed.
  const next = (await readFile(file, 'utf8')).replace(`${target.text}\n`, `${target.text} Modifié.\n`);
  await writeFile(file, next);
  await expect(page.locator('.cm-mp-changed').first()).toBeAttached({ timeout: 15_000 });
  server.stop();
});
