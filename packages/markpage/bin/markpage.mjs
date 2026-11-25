#!/usr/bin/env node
/********************************* markpage.mjs ********************************
 *
 * Purpose: Render a markpage Markdown document from the command line, with the
 *   SAME pipeline as markpage.org (named style, MathJax, Mermaid, Vivliostyle
 *   pages), and save it as one self-contained HTML page.
 *
 *     markpage html note.md [-o note.html] [--continuous]
 *
 * How: Serve the bundled viewer (dist/viewer) and the document's folder on a
 *   local port, open the viewer in a headless Chromium with the document in
 *   it, wait for the viewer's "rendered" signal, then save the viewer's own
 *   standalone export: the laid-out pages with their CSS, only the fonts they
 *   use and their images inlined — no script, no server needed to read it.
 *   Chromium: --chrome <path>, else $MARKPAGE_CHROME, else Playwright's
 *   browser, else the installed Google Chrome.
 *
 *******************************************************************************/

import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(HERE, '../dist/viewer');

const USAGE = `markpage — render a markpage Markdown document

  markpage html <note.md> [-o <out.html>] [--continuous] [--chrome <path>]

  html          save the rendered document as one self-contained HTML page
  -o, --out     output file (default: <note>.html next to the input)
  --continuous  the continuous view instead of pages
  --chrome      the Chromium / Chrome executable to render with
                (default: $MARKPAGE_CHROME, then Playwright's, then Chrome)
  --scale       device pixel ratio to lay out at (default 2, a HiDPI screen:
                Chrome measures glyphs differently at 1, and the page breaks
                move — LE-REGIME-FIGE: 23 pages at 1, 25 at 1.5 and 2)
  --timeout     seconds to wait for the render (default 180)
`;

function parseArgs(argv) {
  const o = { cmd: argv[0], input: undefined, out: undefined, paginated: true, chrome: process.env.MARKPAGE_CHROME, timeout: 180, scale: 2 };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-o' || a === '--out') o.out = argv[(i += 1)];
    else if (a === '--continuous') o.paginated = false;
    else if (a === '--pages') o.paginated = true;
    else if (a === '--chrome') o.chrome = argv[(i += 1)];
    else if (a === '--timeout') o.timeout = Number(argv[(i += 1)]);
    else if (a === '--scale') o.scale = Number(argv[(i += 1)]);
    else if (a === '-h' || a === '--help') o.cmd = 'help';
    else if (!o.input) o.input = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return o;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

/** A file under `root`, or null when the path escapes it or does not exist. */
async function fileUnder(root, rel) {
  const p = resolve(root, `.${sep}${decodeURIComponent(rel)}`);
  if (p !== root && !p.startsWith(root + sep)) return null;
  try {
    if (!(await stat(p)).isFile()) return null;
    return p;
  } catch {
    return null;
  }
}

/** Serve the viewer at /viewer/ (the page carrying the document) and the
 *  document's folder at /doc/ (its relative images). Loopback only. */
async function serve(pageHtml, docDir) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = null;
    if (url.pathname === '/viewer/' || url.pathname === '/viewer/index.html') {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(pageHtml);
      return;
    }
    if (url.pathname.startsWith('/viewer/')) file = await fileUnder(VIEWER, url.pathname.slice(8));
    else if (url.pathname.startsWith('/doc/')) file = await fileUnder(docDir, url.pathname.slice(5));
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function launchChromium(chromePath) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error('playwright-core is missing: npm install playwright-core');
  }
  const attempts = [];
  if (chromePath) attempts.push({ executablePath: chromePath });
  attempts.push({}, { channel: 'chrome' });
  const errors = [];
  for (const opts of attempts) {
    try {
      return await chromium.launch({ ...opts, args: ['--no-sandbox'] });
    } catch (e) {
      errors.push(String(e).split('\n')[0]);
    }
  }
  throw new Error(`no Chromium found (--chrome <path> or MARKPAGE_CHROME):\n  ${errors.join('\n  ')}`);
}

/** Render `md` (from `docDir`) in the viewer and return the standalone page. */
export async function renderStandalone(md, { docDir, paginated = true, chrome, timeout = 180, scale = 2 } = {}) {
  const template = await readFile(join(VIEWER, 'viewer.html'), 'utf8').catch(() => {
    throw new Error(`viewer not built (${VIEWER}): run npm run build in packages/markpage`);
  });
  let srv;
  let browser;
  try {
    srv = await serve('', docDir);
    // JSON, with "<" escaped: no "</script>" in the document can close the tag.
    const payload = JSON.stringify({ md, paginated, baseUri: `${srv.base}/doc/` }).replaceAll('<', '\\u003c');
    const page0 = template.replace(
      '<script type="application/json" id="markpage-source">{}</script>',
      `<script type="application/json" id="markpage-source">${payload}</script>`,
    );
    srv.server.close();
    srv = await serve(page0, docDir);
    browser = await launchChromium(chrome);
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: scale });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${srv.base}/viewer/`);
    await page.waitForFunction(() => document.documentElement.dataset.mpRendered, null, { timeout: timeout * 1000 });
    const state = await page.evaluate(() => document.documentElement.dataset.mpRendered);
    if (state === 'error') throw new Error(`render failed${errors.length ? `: ${errors[0]}` : ''}`);
    const pages = await page.locator('.pagedjs_page').count();
    const html = await page.evaluate(() => window.markpageStandaloneHtml());
    return { html, pages, errors };
  } finally {
    await browser?.close();
    srv?.server.close();
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.cmd || o.cmd === 'help' || o.cmd === '--help') {
    process.stdout.write(USAGE);
    return;
  }
  if (o.cmd !== 'html') throw new Error(`unknown command: ${o.cmd}\n\n${USAGE}`);
  if (!o.input) throw new Error(`missing input file\n\n${USAGE}`);
  const input = resolve(o.input);
  const md = await readFile(input, 'utf8');
  const out = resolve(o.out ?? join(dirname(input), `${basename(input, extname(input))}.html`));
  const t0 = Date.now();
  const { html, pages } = await renderStandalone(md, {
    docDir: dirname(input),
    paginated: o.paginated,
    chrome: o.chrome,
    timeout: o.timeout,
    scale: o.scale,
  });
  await writeFile(out, html);
  const what = o.paginated ? `${pages} page(s)` : 'continuous view';
  process.stderr.write(`markpage: ${out} — ${what}, ${(html.length / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`markpage: ${e.message ?? e}\n`);
    process.exit(1);
  });
}
