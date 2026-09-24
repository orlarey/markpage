/**
 * render-corpus.mjs — automated render check for the VS Code preview webview.
 *
 * Drives the extension's real webview bundle (dist/webview.{js,css} +
 * media/preview.css, in #preview-pane.markpage — exactly what test-harness.html
 * loads) over every tests/corpus/*.md, in PAGINATED mode (Vivliostyle), and asserts that the
 * render is healthy (pages actually produced, no console error — CSP
 * violations included, the harness carries the extension's CSP). It also
 * injects a simulation of VS Code's dark default
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

// A bundle asset (font, chunk, stylesheet) that fails to load is a packaging
// bug — unlike a corpus image missing on purpose, which only 404s under tests/.
const assetErrors = [];
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().includes('/vscode/')) assetErrors.push(`${r.status()} ${r.url()}`);
});

await page.goto(`${BASE}/vscode/test-harness.html`);

for (const file of docs) {
  const name = file.replace(/\.md$/, '');
  const md = readFileSync(join(CORPUS, file), 'utf8');
  consoleErrors.length = 0;

  await page.evaluate(
    ({ md, baseUri }) => {
      // Drop the previous doc's pages so the wait below sees THIS render's.
      document.getElementById('preview-pane').replaceChildren();
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'render', md, baseUri, paginated: true } }),
      );
    },
    { md, baseUri: `${BASE}/tests/corpus/` },
  );
  // Wait for hydrate + Vivliostyle: pages are swapped into the pane (out of the
  // hidden render buffer) only once pagination has finished.
  const paged = await page
    .locator('#preview-pane .pagedjs_page')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(500);

  // ---- assertions (only fire when the construct is present) ----------------
  const issues = await page.evaluate(() => {
    const out = [];
    const pv = document.getElementById('preview-pane');
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
    // Admonitions must be styled — the style decides how (a coloured rule, a
    // tinted box, or both); neither border nor background means unstyled.
    pv.querySelectorAll('.admonition').forEach((a) => {
      const cs = getComputedStyle(a);
      const bordered = parseFloat(cs.borderLeftWidth) > 0;
      const filled = !['rgba(0, 0, 0, 0)', 'transparent'].includes(cs.backgroundColor);
      if (!bordered && !filled) out.push('admonition has neither border nor background (unstyled)');
    });
    // ```text / unknown-language code must not inherit VS Code's dark code bg.
    pv.querySelectorAll('pre code:not(.hljs)').forEach((c) => {
      const bg = getComputedStyle(c).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent')
        out.push(`unknown-language code has a background (${bg}) — VS Code dark bleed`);
    });
    // `::: background` sentinels must be realised as a per-page layer.
    if (pv.querySelector('.mp-bg') && !pv.querySelector('.mp-bg-layer'))
      out.push('::: background present but no backdrop layer (applyBackgrounds not run)');
    // Nothing should render with the dark page background bleeding through.
    if (getComputedStyle(pv).backgroundColor === 'rgb(30, 30, 30)')
      out.push('preview background is the VS Code dark canvas (paper theme not applied)');
    return out;
  });

  if (!paged) issues.push('no page rendered (pagination failed or timed out)');
  if (assetErrors.length) issues.push(`bundle asset failed: ${assetErrors.join(', ')}`);
  assetErrors.length = 0; // after reporting, so load-time failures land on the first doc
  if (consoleErrors.length) issues.push(`console error: ${consoleErrors[0]}`);

  await page.locator('#preview-pane').screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});

  if (issues.length) {
    failures.push({ name, issues });
    console.log(`  ✗ ${name}`);
    issues.forEach((i) => console.log(`      ${i}`));
  } else {
    console.log(`  ✓ ${name}`);
  }
}

// ---- named style: `document-style:` picks the style (ET Book = livre) ------
{
  const probe = async (md) => {
    await page.evaluate(
      (m) =>
        window.dispatchEvent(
          new MessageEvent('message', { data: { type: 'render', md: m, baseUri: '', paginated: false } }),
        ),
      md,
    );
    await page.waitForTimeout(800);
    return page.evaluate(() => {
      const p = document.querySelector('#preview-pane p');
      return p ? getComputedStyle(p).fontFamily : null;
    });
  };
  const dflt = await probe('# T\n\nBody.');
  const livre = await probe('---\ndocument-style: livre-a4\n---\n# T\n\nBody.');
  if (livre && /ET Book/.test(livre) && dflt && !/ET Book/.test(dflt)) {
    console.log(`  ✓ document-style (default: ${dflt.split(',')[0]} · livre-a4: ${livre.split(',')[0]})`);
  } else {
    failures.push({ name: 'document-style', issues: [`default ${dflt} / livre ${livre}`] });
    console.log(`  ✗ document-style — default ${dflt} / livre ${livre}`);
  }
}

// ---- HTML export: self-contained, same pages as the preview ----------------
// The host opens the exported file in the system browser, which can't reach the
// webview's resources: fonts and images must be inlined. Render under livre-a4
// (ET Book is a bundled face, not a Google one) and load the export with the
// local server blocked.
{
  const ex = await browser.newPage();
  await ex.addInitScript(() => {
    window.__posted = [];
    window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__posted.push(m) });
  });
  await ex.goto(`${BASE}/vscode/test-harness.html`);
  const md = `---\ndocument-style: livre-a4\n---\n${readFileSync(join(CORPUS, '07-admonitions.md'), 'utf8')}`;
  await ex.evaluate(
    ({ md, baseUri }) => {
      document.getElementById('preview-pane').replaceChildren();
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'render', md, baseUri, paginated: true } }));
    },
    { md, baseUri: `${BASE}/tests/corpus/` },
  );
  await ex.locator('#preview-pane .pagedjs_page').first().waitFor({ state: 'visible', timeout: 60_000 });
  const previewPages = await ex.locator('#preview-pane .pagedjs_page').count();
  await ex.locator('.mp-toggle', { hasText: 'PDF' }).click();
  await ex.waitForFunction(() => window.__posted.some((m) => m.type === 'exportHtml'), null, { timeout: 60_000 });
  const html = await ex.evaluate(() => window.__posted.find((m) => m.type === 'exportHtml').html);
  const out = await browser.newPage();
  const reached = [];
  await out.route(/127\.0\.0\.1/, (r) => {
    reached.push(r.request().url());
    return r.abort();
  });
  await out.setContent(html, { waitUntil: 'load' });
  await out.evaluate(() => document.fonts.ready);
  const etBook = await out.evaluate(() => document.fonts.check('16px "ET Book"'));
  const pdf = await out.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const issues = [];
  if (pdfPages !== previewPages) issues.push(`printed ${pdfPages} page(s), preview shows ${previewPages}`);
  if (reached.length) issues.push(`export reaches the webview's server: ${reached[0]}`);
  if (!etBook) issues.push('ET Book not embedded in the export');
  if (issues.length) {
    failures.push({ name: 'html-export', issues });
    console.log(`  ✗ html-export — ${issues.join('; ')}`);
  } else {
    console.log(`  ✓ html-export (${pdfPages} page(s), self-contained, fonts embedded)`);
  }
  await ex.close();
  await out.close();
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
