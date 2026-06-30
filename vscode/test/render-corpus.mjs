/**
 * render-corpus.mjs — automated render check for the VS Code preview webview.
 *
 * Drives the extension's real webview bundle (dist/webview.{js,css} +
 * media/preview.css, in #markpage-preview.markpage — exactly what test-harness.html
 * loads) over every tests/corpus/*.md, in PAGINATED mode, and asserts that the
 * render is healthy. It also injects a simulation of VS Code's dark default
 * webview styles, so theme-bleed regressions (e.g. the ```text dark-bar bug) are
 * caught too. Screenshots land in vscode/test/__shots__/ for manual review.
 *
 * Run:  npm run test:render   (builds first)   — exits non-zero on any failure,
 * so it can gate `vsce publish` in the release workflow.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CORPUS = join(REPO, 'tests', 'corpus');
const SHOTS = join(HERE, '__shots__');

if (!existsSync(join(REPO, 'vscode', 'dist', 'webview.js'))) {
  console.error('✗ dist/webview.js missing — run `node esbuild.mjs --production` first.');
  process.exit(2);
}
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

// --- tiny static file server rooted at the repo (serves vscode/ + tests/) ----
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.map': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff',
};
const server = createServer((req, res) => {
  try {
    const path = join(REPO, decodeURIComponent(req.url.split('?')[0]));
    const body = readFileSync(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

// VS Code injects dark default styles into a dark-theme webview; reproduce the
// bits that have bled into the render before (textPreformat code background,
// the dark canvas) so our overrides are actually exercised.
const VSCODE_DARK = `
  :root { color-scheme: dark; }
  body { background: #1e1e1e; color: #cccccc; }
  code { background-color: #2d2d2d; color: #d4d4d4; }
  pre  { background-color: #1e1e1e; }
`;

const docs = readdirSync(CORPUS).filter((f) => f.endsWith('.md')).sort();
const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: 'dark' });
// VS Code default-style simulation, injected before the bundle's CSS loads.
await page.addInitScript((css) => {
  const s = document.createElement('style');
  s.id = '_vscodeDefaultsSim';
  s.textContent = css;
  document.documentElement.prepend(s);
}, VSCODE_DARK);

const consoleErrors = [];
page.on('console', (m) => {
  // Network 404s (e.g. an intentionally-missing image testing graceful
  // degradation) are not render bugs — only flag real JS console errors.
  if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) {
    consoleErrors.push(m.text());
  }
});

await page.goto(`${BASE}/vscode/test-harness.html`);

for (const file of docs) {
  const name = file.replace(/\.md$/, '');
  const md = readFileSync(join(CORPUS, file), 'utf8');
  consoleErrors.length = 0;

  await page.evaluate(
    ({ md, baseUri }) =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'render', md, baseUri, paginated: true } }),
      ),
    { md, baseUri: `${BASE}/tests/corpus/` },
  );
  // Wait for paged.js + hydrate.
  await page
    .locator('#markpage-preview .pagedjs_page')
    .first()
    .waitFor({ state: 'attached', timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(800);

  // ---- assertions (only fire when the construct is present) ----------------
  const issues = await page.evaluate(() => {
    const out = [];
    const pv = document.getElementById('markpage-preview');
    const fill = (el) => (el ? getComputedStyle(el).fill : '');
    const isBlack = (c) => c === 'rgb(0, 0, 0)' || c === '#000' || c === 'black';

    // bda boxes must be outlined (fill:none), never solid black (the .markpage bug).
    pv.querySelectorAll('.bda-svg .bda-box').forEach((b) => {
      if (isBlack(fill(b))) out.push('bda box has black fill (missing .markpage / blocks CSS)');
    });
    // EBNF railroad rects must be light, not the library's black/green default.
    pv.querySelectorAll('svg.railroad-diagram rect').forEach((r) => {
      if (isBlack(fill(r))) out.push('railroad rect has black fill (missing ebnf CSS)');
    });
    // Admonitions must carry their coloured left border (not unstyled).
    pv.querySelectorAll('.admonition').forEach((a) => {
      const cs = getComputedStyle(a);
      if (parseFloat(cs.borderLeftWidth) < 2) out.push('admonition has no left border (unstyled)');
    });
    // ```text / unknown-language code must not inherit VS Code's dark code bg.
    pv.querySelectorAll('pre code:not(.hljs)').forEach((c) => {
      const bg = getComputedStyle(c).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent')
        out.push(`unknown-language code has a background (${bg}) — VS Code dark bleed`);
    });
    // Nothing should render with the dark page background bleeding through.
    if (getComputedStyle(pv).backgroundColor === 'rgb(30, 30, 30)')
      out.push('preview background is the VS Code dark canvas (paper theme not applied)');
    return out;
  });

  if (consoleErrors.length) issues.push(`console error: ${consoleErrors[0]}`);

  await page.locator('#markpage-preview').screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});

  if (issues.length) {
    failures.push({ name, issues });
    console.log(`  ✗ ${name}`);
    issues.forEach((i) => console.log(`      ${i}`));
  } else {
    console.log(`  ✓ ${name}`);
  }
}

// ---- document-stack check: a var(--token) + dotted styles.* key must apply --
{
  const md = ['---', '--brand: "#0b3d91"', 'styles.h2.color: var(--brand)', '---', '## Sub', '', 'Body.'].join('\n');
  await page.evaluate(
    (m) =>
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'render', md: m, baseUri: '', paginated: false } }),
      ),
    md,
  );
  await page.waitForTimeout(800);
  const color = await page.evaluate(() => {
    const h2 = document.querySelector('#markpage-preview h2');
    return h2 ? getComputedStyle(h2).color : null;
  });
  if (color === 'rgb(11, 61, 145)') {
    console.log('  ✓ stack-tokens (var(--brand) → #0b3d91)');
  } else {
    failures.push({ name: 'stack-tokens', issues: [`h2 colour is ${color}, expected rgb(11, 61, 145)`] });
    console.log(`  ✗ stack-tokens — h2 colour is ${color}`);
  }
}

await browser.close();
server.close();

console.log(`\n${docs.length - failures.length}/${docs.length} corpus docs rendered cleanly in the webview.`);
console.log(`Screenshots: ${SHOTS}`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} doc(s) with render issues — see above.`);
  process.exit(1);
}
console.log('✓ all good.');
