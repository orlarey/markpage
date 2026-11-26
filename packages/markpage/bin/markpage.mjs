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
import { existsSync, realpathSync } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// $MARKPAGE_VIEWER: another viewer build (development, or checking an older one).
const VIEWER = resolve(process.env.MARKPAGE_VIEWER ?? resolve(HERE, '../dist/viewer'));

const USAGE = `markpage — render a markpage Markdown document

  markpage html  <note.md> [-o <out.html>] [--continuous] [--scale 2]
  markpage pdf   <note.md> [-o <out.pdf>] [--scale 2]
  markpage check <note.md> [--scale 1,2] [--json]
  markpage guide [<word>… | --all]

  html          save the rendered document as one self-contained HTML page
  pdf           save the paginated document as a PDF: the same pages, printed
                by Chromium at the style's page size
  check         check the document: no block in error, no TOC entry without
                its section; and that pagination loses, adds and duplicates no text:
                the pages against the continuous view, word by word and block
                by block, notes and formulas counted, no text a line or more
                outside the text area, no page left mostly empty before more
                text. Exit code 1 on any defect.
  guide         the authoring guide (AI-AUTHORING.md) of this version: alone,
                the list of its sections; with words, the sections they name
                (\`markpage guide ebnf\`, \`markpage guide toc\`); --all, the
                whole guide
  -o, --out     output file (default: <note>.html next to the input)
  --continuous  the continuous view instead of pages
  --chrome      the Chromium / Chrome executable to render with
                (default: $MARKPAGE_CHROME, then Playwright's, then Chrome)
  --json        check: print the full reports as JSON
  --scale       device pixel ratio(s) to lay out at (html: default 2, a HiDPI
                screen; check: default 1,2 —
                Chrome measures glyphs differently at 1, and the page breaks
                move: LE-REGIME-FIGE has 23 pages at 1, 25 at 1.5 and 2)
  --timeout     seconds to wait for the render (default 180)
`;

function parseArgs(argv) {
  const o = { cmd: argv[0], input: undefined, out: undefined, paginated: true, chrome: process.env.MARKPAGE_CHROME, timeout: 180, scale: undefined, json: false };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-o' || a === '--out') o.out = argv[(i += 1)];
    else if (a === '--continuous') o.paginated = false;
    else if (a === '--pages') o.paginated = true;
    else if (a === '--chrome') o.chrome = argv[(i += 1)];
    else if (a === '--timeout') o.timeout = Number(argv[(i += 1)]);
    else if (a === '--scale') o.scale = argv[(i += 1)];
    else if (a === '--json') o.json = true;
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

/** Serve the viewer page for `md` at /viewer/?mode=pages|continuous, the
 *  viewer's files under /viewer/, and the document's folder at /doc/ (its
 *  relative images). Loopback only. */
async function serve(template, md, docDir) {
  let base = '';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = null;
    if (url.pathname === '/viewer/') {
      const paginated = url.searchParams.get('mode') !== 'continuous';
      // JSON with "<" escaped: no "</script>" in the document closes the tag.
      const payload = JSON.stringify({ md, paginated, baseUri: `${base}/doc/` }).replaceAll('<', '\\u003c');
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(
        template.replace(
          '<script type="application/json" id="markpage-source">{}</script>',
          `<script type="application/json" id="markpage-source">${payload}</script>`,
        ),
      );
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
  base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

/** Where a Chromium usually is, when Playwright's own is not installed. */
const KNOWN_BROWSERS = [
  '/opt/pw-browsers/chromium', // Claude Code cloud sessions
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

async function launchChromium(chromePath) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error('playwright-core is missing: npm install playwright-core');
  }
  // In order: the one asked for; Playwright's own; the browsers usually
  // around (a Claude Code cloud session ships one, a desktop has Chrome).
  const attempts = [];
  if (chromePath) attempts.push({ executablePath: chromePath });
  attempts.push({});
  for (const path of KNOWN_BROWSERS) if (existsSync(path)) attempts.push({ executablePath: path });
  attempts.push({ channel: 'chrome' });
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

/**
 * Run `fn(open)` with the viewer served for `md` and a headless Chromium;
 * `open({ paginated, scale })` returns a page on which the document is
 * rendered (the viewer's "rendered" signal received).
 */
export async function withViewer(md, { docDir, chrome, timeout = 180 }, fn) {
  const template = await readFile(join(VIEWER, 'viewer.html'), 'utf8').catch(() => {
    throw new Error(`viewer not built (${VIEWER}): run npm run build in packages/markpage`);
  });
  const srv = await serve(template, md, docDir);
  let browser;
  try {
    browser = await launchChromium(chrome);
    const open = async ({ paginated = true, scale = 2 } = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: scale });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${srv.base}/viewer/?mode=${paginated ? 'pages' : 'continuous'}`);
      await page.waitForFunction(() => document.documentElement.dataset.mpRendered, null, { timeout: timeout * 1000 });
      const state = await page.evaluate(() => document.documentElement.dataset.mpRendered);
      if (state === 'error') throw new Error(`render failed${errors.length ? `: ${errors[0]}` : ''}`);
      return { page, errors, close: () => ctx.close() };
    };
    return await fn(open);
  } finally {
    await browser?.close();
    srv.server.close();
  }
}

/** Render `md` (from `docDir`) and return the viewer's standalone page. */
export async function renderStandalone(md, { docDir, paginated = true, chrome, timeout = 180, scale = 2 } = {}) {
  return withViewer(md, { docDir, chrome, timeout }, async (open) => {
    const { page, errors, close } = await open({ paginated, scale });
    const pages = await page.locator('.pagedjs_page').count();
    const html = await page.evaluate(() => window.markpageStandaloneHtml());
    await close();
    return { html, pages, errors };
  });
}

/**
 * Render `md` in pages and print them to a PDF (a Buffer). The pages are the
 * viewer's: its standalone export is loaded in a fresh page and printed with
 * its own print rules (one sheet per page, the style's page size, no browser
 * margin, backgrounds kept).
 */
export async function renderPdf(md, { docDir, chrome, timeout = 180, scale = 2 } = {}) {
  return withViewer(md, { docDir, chrome, timeout }, async (open) => {
    const { page, errors, close } = await open({ paginated: true, scale });
    const pages = await page.locator('.pagedjs_page').count();
    const html = await page.evaluate(() => window.markpageStandaloneHtml());
    // Print from the frozen export, not from the live viewer: no toolbar, no
    // zoom, fonts and images already inlined.
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await close();
    return { pdf, pages, errors };
  });
}

/** The conservation reports of `md`, one per device pixel ratio. */
export async function checkDocument(md, { docDir, chrome, timeout = 180, scales = [1, 2] } = {}) {
  const { conservation, continuousText, paginatedFacts } = await import('../lib/conservation.mjs');
  return withViewer(md, { docDir, chrome, timeout }, async (open) => {
    const reports = [];
    for (const scale of scales) {
      const c = await open({ paginated: false, scale });
      const cont = await continuousText(c.page);
      // Authoring defects, read off the render: a fence that failed (every
      // renderer leaves a `*-error` box rather than throwing) and a TOC entry
      // matching no heading.
      const blocks = await c.page.evaluate(() =>
        [...document.querySelectorAll('#preview-pane [class*="-error"]')]
          .filter((e) => !e.parentElement?.closest('[class*="-error"]')) // the outer box only
          .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)),
      );
      await c.close();
      const p = await open({ paginated: true, scale });
      const pag = await paginatedFacts(p.page);
      // The TOC is linked to its headings in the paginated view.
      const toc = await p.page.evaluate(() =>
        [...document.querySelectorAll('#preview-pane nav.toc-plus a.toc-missing')].map((e) =>
          (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ),
      );
      // A `::: toc+` block that holds no list renders as nothing at all, in
      // silence: written as paragraphs ("**Title** — …") instead of list
      // items ("- **Title** — …"), the whole contents vanish.
      const tocEmpty = await p.page.evaluate(() =>
        [...document.querySelectorAll('#preview-pane nav.toc-plus')]
          .filter((nav) => !nav.querySelector('a[data-toc-title]'))
          .map(() => 'le bloc ::: toc+ ne contient aucune entrée (attendu : une liste « - **Titre** — intention »)'),
      );
      await p.close();
      reports.push({ scale, blocks, toc, tocEmpty, ...conservation(cont, pag), errors: [...c.errors, ...p.errors] });
    }
    return reports;
  });
}

const FINDINGS = [
  ['blocks', 'bloc en erreur'],
  ['toc', 'entrée du sommaire sans section'],
  ['tocEmpty', 'sommaire vide'],
  ['lost', 'texte perdu'],
  ['added', 'texte ajouté ou doublé'],
  ['duplicated', 'bloc posé deux fois'],
  ['notes', 'notes différentes'],
  ['math', 'formules en trop ou en moins'],
  ['overflow', "texte hors de la zone d'au moins une ligne"],
  ['sparse', 'page presque vide avant la suite'],
  ['errors', 'erreur de rendu'],
];

/** A report in words; `ok` when nothing fails (near overflows only warn). */
function describe(r) {
  const lines = [];
  for (const [k, label] of FINDINGS) for (const f of r[k] ?? []) lines.push(`    ${label} : ${f}`);
  for (const f of r.nearOverflow ?? []) lines.push(`    (avertissement) texte déplacé de moins d'une ligne : ${f}`);
  const failures = FINDINGS.reduce((n, [k]) => n + (r[k]?.length ?? 0), 0);
  return { ok: failures === 0, failures, lines };
}

/** The guide's sections: its `## ` headings, those inside a code fence apart. */
export function guideSections(text) {
  const sections = [];
  let current = { title: '', lines: [] };
  let fence = null;
  for (const line of text.split('\n')) {
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (mark) {
      if (fence === null) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length && line.trim() === mark[1]) fence = null;
    }
    if (fence === null && !mark && /^## /.test(line)) {
      sections.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    }
    current.lines.push(line);
  }
  sections.push(current);
  return sections.map((s) => ({ title: s.title, text: s.lines.join('\n').trimEnd() }));
}

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * What `markpage guide` prints: the list of sections, the sections that
 * `words` name, or everything. A word names a section by its title, else by a
 * block it describes (a \`\`\`word fence, a `::: word` div), else by its text.
 */
export function guide(text, words, all = false) {
  if (all) return text.trimEnd();
  const sections = guideSections(text).filter((s) => s.title !== '');
  if (words.length === 0) {
    return [
      'Sections of the authoring guide — `markpage guide <word>` prints the ones a word names, `markpage guide --all` everything:',
      '',
      ...sections.map((s) => `  ${s.title}`),
    ].join('\n');
  }
  const ws = words.map(fold);
  const by = (test) => sections.filter((s) => ws.every((w) => test(s, w)));
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let hit = by((s, w) => fold(s.title).includes(w));
  if (hit.length === 0) hit = by((s, w) => new RegExp('(^|\\n)\\s*(`{3,}|:{3,})\\s*' + esc(w) + '\\b').test(fold(s.text)));
  if (hit.length === 0) hit = by((s, w) => fold(s.text).includes(w));
  if (hit.length === 0) {
    throw new Error(`no section of the guide mentions: ${words.join(' ')}\n\n${guide(text, [])}`);
  }
  return hit.map((s) => s.text).join('\n\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'guide') {
    const text = await readFile(resolve(HERE, '../dist/AI-AUTHORING.md'), 'utf8');
    const rest = args.slice(1);
    process.stdout.write(`${guide(text, rest.filter((a) => !a.startsWith('--')), rest.includes('--all'))}\n`);
    return;
  }
  const o = parseArgs(args);
  if (!o.cmd || o.cmd === 'help' || o.cmd === '--help') {
    process.stdout.write(USAGE);
    return;
  }
  if (!['html', 'pdf', 'check'].includes(o.cmd)) throw new Error(`unknown command: ${o.cmd}\n\n${USAGE}`);
  if (!o.input) throw new Error(`missing input file\n\n${USAGE}`);
  const input = resolve(o.input);
  const md = await readFile(input, 'utf8');
  const t0 = Date.now();
  if (o.cmd === 'check') {
    const scales = String(o.scale ?? '1,2').split(',').map(Number).filter((x) => x > 0);
    const reports = await checkDocument(md, { docDir: dirname(input), chrome: o.chrome, timeout: o.timeout, scales });
    let bad = 0;
    if (o.json) process.stdout.write(`${JSON.stringify({ file: input, reports }, null, 2)}\n`);
    else process.stdout.write(`markpage check : ${basename(input)}\n`);
    for (const r of reports) {
      const d = describe(r);
      bad += d.failures;
      if (o.json) continue;
      const verdict = d.ok ? 'conservé' : `${d.failures} défaut(s)`;
      process.stdout.write(`  densité ${r.scale} : ${r.pages} page(s) — ${verdict}\n`);
      for (const l of d.lines) process.stdout.write(`${l}\n`);
    }
    if (!o.json) process.stdout.write(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
    process.exitCode = bad > 0 ? 1 : 0;
    return;
  }
  if (o.cmd === 'pdf') {
    const out = resolve(o.out ?? join(dirname(input), `${basename(input, extname(input))}.pdf`));
    const { pdf, pages } = await renderPdf(md, {
      docDir: dirname(input),
      chrome: o.chrome,
      timeout: o.timeout,
      scale: Number(o.scale ?? 2),
    });
    await writeFile(out, pdf);
    process.stderr.write(`markpage: ${out} — ${pages} page(s), ${(pdf.length / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
    return;
  }
  const out = resolve(o.out ?? join(dirname(input), `${basename(input, extname(input))}.html`));
  const { html, pages } = await renderStandalone(md, {
    docDir: dirname(input),
    paginated: o.paginated,
    chrome: o.chrome,
    timeout: o.timeout,
    scale: Number(o.scale ?? 2),
  });
  await writeFile(out, html);
  const what = o.paginated ? `${pages} page(s)` : 'continuous view';
  process.stderr.write(`markpage: ${out} — ${what}, ${(html.length / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}

// Run as a command (not imported). Through `npx` / node_modules/.bin the
// script is reached by a symlink: compare the real paths.
const invoked = process.argv[1] ? realpathSync(resolve(process.argv[1])) : '';
if (invoked === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    process.stderr.write(`markpage: ${e.message ?? e}\n`);
    process.exit(1);
  });
}
