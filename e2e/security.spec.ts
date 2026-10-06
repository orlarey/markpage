import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';

/**
 * A link someone sends must not harm the reader. A hostile document (every
 * construct loaded with script: raw HTML, `javascript:` links, attribute
 * breakouts in labels, MathJax \href, Mermaid click, fences, front matter…)
 * renders inert in both previews; a link naming a remote MCP server does not
 * get to drive the tab.
 */

const DOC = 'https://example.test/hostile.md';
const BODY = readFileSync(new URL('./fixtures/hostile.md', import.meta.url), 'utf8');

/** Anything able to run: handlers, script URLs, script / frame elements. */
const activeParts = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    const risky = /^[\s\u0000-\u001f]*(javascript|vbscript|data:text\/html)/i;
    for (const el of document.querySelectorAll('#preview-pane *')) {
      for (const a of el.attributes) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || n === 'data-t') bad.push(`<${el.tagName} ${n}>`);
        if (risky.test(a.value)) bad.push(`<${el.tagName} ${n}="${a.value.slice(0, 60)}">`);
      }
      if (['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(el.tagName)) bad.push(el.tagName);
    }
    return bad;
  });

for (const pages of [false, true]) {
  test(`a hostile document renders inert (${pages ? 'pages' : 'continuous'})`, async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    await page.route(DOC, (r) => r.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, body: BODY }));
    await page.goto(`/?src=${encodeURIComponent(DOC)}&view=read&pages=${pages ? 1 : 0}`);
    await expect(
      page.locator(pages ? '#preview-pane .pagedjs_page' : '#preview-pane .mp-continuous-sheet').first(),
    ).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3000); // MathJax, Mermaid
    expect(await activeParts(page)).toEqual([]);
    // Hover and click every link: still nothing runs.
    for (const a of await page.locator('#preview-pane a').all()) {
      await a.hover({ force: true, timeout: 2000 }).catch(() => undefined);
      await a.click({ force: true, timeout: 2000 }).catch(() => undefined);
    }
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __x?: unknown }).__x ?? null)).toBeNull();
    expect(dialogs).toEqual([]);
  });
}

test('a link naming a remote MCP server is ignored', async ({ page }) => {
  const sockets: string[] = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  await page.goto('/?mcp=wss://evil.example/ws');
  await page.locator('.cm-content').waitFor();
  await page.waitForTimeout(1000);
  expect(sockets.filter((u) => u.includes('evil.example'))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('markpage-mcp-url'))).toBeNull();
});

test('the net keeps a signature image in the PDF, even an untyped one', async ({ page, context }) => {
  // An image read without a MIME type (from GitHub, say) inlines as
  // data:application/octet-stream — a picture all the same.
  const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    (window as unknown as { print: () => void }).print = () => {
      (window as unknown as { __printed?: boolean }).__printed = true;
    };
  });
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  for (const type of ['image/png', 'application/octet-stream']) {
    await page.evaluate(
      (t) => navigator.clipboard.writeText(t),
      `# Lettre\n\n\`\`\`signature\n![](data:${type};base64,${PNG})\nYann\n\`\`\`\n`,
    );
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+v');
    await page.keyboard.press('ControlOrMeta+p');
    await page.waitForFunction(() => (window as unknown as { __printed?: boolean }).__printed === true);
    const src = await page.evaluate(
      () => document.querySelector('#markpage-print-target .letterhead-signature img')?.getAttribute('src') ?? null,
    );
    expect(src).toMatch(new RegExp(`^data:${type.replace('/', '\\/')};base64,`));
    await page.evaluate(() => {
      (window as unknown as { __printed?: boolean }).__printed = false;
      globalThis.dispatchEvent(new Event('afterprint'));
    });
  }
});
