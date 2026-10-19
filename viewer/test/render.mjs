/**
 * render.mjs — does the viewer render a page the way a claude.ai Artifact
 * serves it?
 *
 * Two loopback origins stand in for the two hosts of an Artifact:
 *   - the "CDN" serves dist/ under the jsDelivr path the plugin pins
 *     (/npm/@orlarey/markpage-viewer@<version>/dist/);
 *   - the "artifact" origin serves the page that claude-code/scripts/
 *     markpage-page.mjs writes with --artifact, wrapped in the same kind of
 *     skeleton claude.ai adds, under a CSP that mirrors the Artifact contract:
 *     scripts only from the CDN path (no eval), stylesheets from Google Fonts,
 *     fonts from gstatic or data:, images from data: or the page's own files,
 *     no fetch to any other host. The published image files sit next to it.
 *
 * Then, in light and dark, at desktop and phone width: the page renders (sheet,
 * math, inference rules, adt, mermaid, image), with no CSP violation and no
 * console error; Pages paginates. Screenshots go to test/__shots__/.
 *
 * Run: npm test (builds first). Exits non-zero on any failure.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = join(HERE, '..');
const REPO = join(VIEWER, '..');
const SHOTS = join(HERE, '__shots__');
const { version } = JSON.parse(readFileSync(join(VIEWER, 'package.json'), 'utf8'));
const CDN_PREFIX = `/npm/@orlarey/markpage-viewer@${version}/dist/`;

if (!existsSync(join(VIEWER, 'dist', 'viewer.js'))) {
  console.error('✗ dist/viewer.js missing — run `node esbuild.mjs` first.');
  process.exit(2);
}
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
};

function serve(handler) {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const body = handler(decodeURIComponent(req.url.split('?')[0]), res);
      if (body === undefined) {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => ok(server));
  });
}
const send = (res, path, extra = {}) => {
  res.writeHead(200, {
    'Content-Type': MIME[extname(path)] ?? 'application/octet-stream',
    'Access-Control-Allow-Origin': '*', // as jsDelivr: module scripts are CORS
    ...extra,
  });
  res.end(readFileSync(path));
  return true;
};

// ---- the "CDN" -------------------------------------------------------------
const cdn = await serve((url, res) => {
  if (!url.startsWith(CDN_PREFIX)) return undefined;
  const path = join(VIEWER, 'dist', url.slice(CDN_PREFIX.length));
  return existsSync(path) ? send(res, path) : undefined;
});
const CDN = `http://127.0.0.1:${cdn.address().port}`;

// ---- the page, written by the plugin's script ------------------------------
const pageScript = join(REPO, 'claude-code', 'scripts', 'markpage-page.mjs');
const out = join(SHOTS, 'page.html');
const result = JSON.parse(
  execFileSync(
    process.execPath,
    [pageScript, join(HERE, 'sample.md'), '--artifact', '--json', '-o', out,
      '--viewer', `${CDN}${CDN_PREFIX}viewer.js`],
    { cwd: REPO, encoding: 'utf8' },
  ),
);
const fragment = readFileSync(out, 'utf8');

const CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${CDN}/npm/`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
].join('; ');
// The skeleton claude.ai wraps an Artifact page in: charset + viewport, a small
// reset, then the page as written.
const skeleton = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
${fragment}</body></html>`;

const site = await serve((url, res) => {
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(skeleton);
    return true;
  }
  const source = result.files[url.slice(1)]; // an Artifact's published `files`
  return source ? send(res, resolve(REPO, source)) : undefined;
});
const SITE = `http://127.0.0.1:${site.address().port}/`;

// ---- drive it --------------------------------------------------------------
const failures = [];
// CHROMIUM_PATH: a preinstalled browser when Playwright's own build is absent.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

async function check(name, { colorScheme, viewport, pages }) {
  const page = await browser.newPage({ colorScheme, viewport });
  // Offline and deterministic: only the two loopback origins answer. (Google
  // Fonts is allowed by the CSP but not needed: the faces fall back.)
  await page.route('**/*', (route) =>
    route.request().url().startsWith('http://127.0.0.1') ? route.continue() : route.abort(),
  );
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto(SITE);
  const rendered = await page
    .waitForFunction(() => document.documentElement.dataset.markpageRendered, null, { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  if (pages) {
    await page.getByRole('button', { name: 'Pages' }).click();
    await page
      .waitForFunction(() => document.documentElement.dataset.markpageRendered === 'pages', null, { timeout: 60_000 })
      .catch(() => undefined);
  }
  await page.waitForTimeout(800);

  const issues = await page.evaluate((pages) => {
    const out = [];
    const pv = document.getElementById('preview-pane');
    if (!pv || pv.hidden) return ['preview pane missing or hidden'];
    if (!document.querySelector('pre.markpage-source')?.hidden) out.push('source still shown');
    if (pages && !pv.querySelector('.pagedjs_page')) out.push('Pages: no page produced');
    if (!pages && !pv.querySelector('.mp-continuous-sheet')) out.push('no continuous sheet');
    // 4 inference rules + 2 inline + 1 display formula, each a MathJax SVG.
    if (pv.querySelectorAll(':is(.math-inline, .math-block) svg').length < 7)
      out.push('math / inference rules not typeset');
    for (const sel of ['.math-error', '.mermaid-error', '.adt-error']) {
      if (pv.querySelector(sel)) out.push(`render error: ${sel}`);
    }
    if (!pv.querySelector('.adt-lhs')) out.push('adt not rendered');
    if (!pv.querySelector('svg[id^="mermaid"]')) out.push('mermaid not rendered');
    const img = pv.querySelector('img');
    if (!img || !img.complete || img.naturalWidth === 0) out.push('image not loaded');
    const t = document.querySelector('.doc-title, h1')?.textContent ?? '';
    if (!t.includes('PGCD')) out.push(`title missing (${t})`);
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('page scrolls sideways');
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg === 'rgba(0, 0, 0, 0)') out.push('transparent body');
    out.push(...window.__csp.map((v) => `CSP violation: ${v}`));
    return out;
  }, pages);
  if (!rendered) issues.unshift('never rendered (timeout)');
  issues.push(...errors.map((e) => `console: ${e}`));
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  await page.close();
  if (issues.length) failures.push({ name, issues });
  console.log(`  ${issues.length ? '✗' : '✓'} ${name}`);
  issues.forEach((i) => console.log(`      ${i}`));
}

await check('desktop-light-continuous', { colorScheme: 'light', viewport: { width: 1280, height: 900 } });
await check('phone-dark-continuous', { colorScheme: 'dark', viewport: { width: 390, height: 844 } });
await check('desktop-dark-pages', { colorScheme: 'dark', viewport: { width: 1280, height: 900 }, pages: true });

await browser.close();
cdn.close();
site.close();
if (failures.length) {
  console.log(`\n✗ ${failures.length} check(s) failed — screenshots in ${SHOTS}`);
  process.exit(1);
}
console.log(`\n✓ all checks passed — screenshots in ${SHOTS}`);
