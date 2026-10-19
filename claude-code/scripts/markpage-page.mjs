#!/usr/bin/env node
// markpage-page.mjs — turn a markpage Markdown file into a web page that shows it
// rendered: the Markdown, HTML-escaped, in <pre class="markpage-source">, plus
// one module script, @orlarey/markpage-viewer from jsDelivr, which renders it
// with the markpage app's own pipeline. The page stays small and readable (the
// source plus a few lines of HTML), so it can be published as a claude.ai
// Artifact, sent to the user, or opened in a browser.
//
// Zero dependencies (Node ≥ 18). Usage:
//   node markpage-page.mjs <file.md | -> [options]
//     -o, --out <file>   where to write the page (default: <tmp>/markpage/<name>.html)
//     --artifact         an Artifact page: no <!doctype>/<html>/<head>/<body>
//                        (claude.ai wraps it); local images are listed for the
//                        Artifact's `files` instead of being linked from disk
//     --inline-images    embed local images as data: URLs (a self-contained page)
//     --pages            open in Pages view (default: Continuous)
//     --lang fr|en       base document language (a `language:` key wins)
//     --title <text>     page title (default: front-matter title, first heading, file name)
//     --viewer <url>     viewer module URL (default: the pinned jsDelivr build;
//                        also MARKPAGE_VIEWER_URL)
//     --open             open the page in the default browser
//     --link             also print the markpage.org link that opens the document
//                        in the web app (documents up to ~8 KB gzipped)
//     --json             print the result as JSON

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** The published viewer this plugin version renders with. */
export const VIEWER_VERSION = '0.1.0';
const VIEWER_URL = `https://cdn.jsdelivr.net/npm/@orlarey/markpage-viewer@${VIEWER_VERSION}/dist/viewer.js`;
const APP_URL = 'https://markpage.org/';
/** markpage's own cap on a `?import=` payload (src/share-url.ts). */
const MAX_SHARE_PAYLOAD = 8000;
/** An Artifact page (data: URLs included) must stay under 16 MB. */
const ARTIFACT_MAX_BYTES = 16 * 1024 * 1024;

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

function parseArgs(argv) {
  const opts = { input: undefined, artifact: false, inlineImages: false, pages: false, open: false, link: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      const v = argv[(i += 1)];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    if (a === '-o' || a === '--out') opts.out = value();
    else if (a === '--artifact') opts.artifact = true;
    else if (a === '--inline-images') opts.inlineImages = true;
    else if (a === '--pages') opts.pages = true;
    else if (a === '--lang') opts.lang = value();
    else if (a === '--title') opts.title = value();
    else if (a === '--viewer') opts.viewer = value();
    else if (a === '--open') opts.open = true;
    else if (a === '--link') opts.link = true;
    else if (a === '--json') opts.json = true;
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('-') && a !== '-') fail(`unknown option ${a}`);
    else if (opts.input === undefined) opts.input = a;
    else fail(`unexpected argument ${a}`);
  }
  if (opts.input === undefined) usage(1);
  if (opts.lang && !['fr', 'en'].includes(opts.lang)) fail('--lang takes fr or en');
  return opts;
}

function usage(code) {
  const text = readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('//   ') || l.startsWith('//     '))
    .map((l) => l.slice(3))
    .join('\n');
  (code ? process.stderr : process.stdout).write(`Usage:\n${text}\n`);
  process.exit(code);
}

function fail(message) {
  process.stderr.write(`markpage-page: ${message}\n`);
  process.exit(1);
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

/** The front-matter `title:` (plain scalar or quoted), if any. */
function frontmatterTitle(md) {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const line = fm?.[1].match(/^title:\s*(.+?)\s*$/m);
  if (!line) return undefined;
  return line[1].replace(/^(["'])(.*)\1$/, '$2');
}

function pageTitle(md, opts, inputPath) {
  if (opts.title) return opts.title;
  const fm = frontmatterTitle(md);
  if (fm) return fm;
  const h = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').match(/^#{1,2}\s+(.+?)\s*#*\s*$/m);
  if (h) return h[1];
  return inputPath ? basename(inputPath).replace(/\.[^.]+$/, '') : 'markpage';
}

/**
 * Visit every `![alt](target …)` image reference outside code fences — but
 * inside the markpage fences whose body is images (`mosaic`, `signature`).
 * `fn(target)` returns the replacement target, or undefined to keep it.
 */
function mapImageTargets(md, fn) {
  const lines = md.split('\n');
  let fence; // the open fence's marker, when inside one
  let imagesInFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w-]*)/);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !m[2]) fence = undefined;
      else if (!imagesInFence) continue;
    } else if (m) {
      fence = m[1];
      imagesInFence = ['mosaic', 'signature'].includes(m[2]);
      continue;
    }
    // Inline code spans (`…`) are matched first and kept as they are.
    lines[i] = line.replace(
      /(`+)[^`]*?\1|(!\[[^\]]*\]\()(<[^>]*>|[^\s)]+)/g,
      (all, ticks, head, rawTarget) => {
        if (ticks) return all;
        const bracketed = rawTarget.startsWith('<');
        const target = bracketed ? rawTarget.slice(1, -1) : rawTarget;
        const next = fn(target);
        if (next === undefined) return all;
        return head + (bracketed ? `<${next}>` : next);
      },
    );
  }
  return lines.join('\n');
}

const isRemote = (t) => /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//');

/** A local image target → its file on disk, when it exists. */
function localImage(target, docDir) {
  if (!docDir || isRemote(target) || target.startsWith('#')) return undefined;
  let path;
  try {
    path = resolve(docDir, decodeURI(target.split(/[?#]/)[0]));
  } catch {
    return undefined;
  }
  if (!IMAGE_TYPES[extname(path).toLowerCase()]) return undefined;
  return existsSync(path) && statSync(path).isFile() ? path : undefined;
}

/** A clean published path for an Artifact file: relative, no `..`; one per
 *  file, however many targets reach it. */
function publishedPath(target, file, taken) {
  for (const [published, source] of taken) if (source === file) return published;
  const clean = target.split(/[?#]/)[0];
  let candidate =
    !isAbsolute(clean) && !clean.split(/[\\/]/).includes('..')
      ? clean.replace(/^\.\//, '')
      : `assets/${basename(file)}`;
  const stem = candidate.replace(/(\.[^./]+)$/, '');
  const ext = extname(candidate);
  for (let n = 2; taken.has(candidate) && taken.get(candidate) !== file; n += 1) {
    candidate = `${stem}-${n}${ext}`;
  }
  taken.set(candidate, file);
  return candidate;
}

function shareLink(md) {
  const payload = gzipSync(Buffer.from(md, 'utf8'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  if (payload.length > MAX_SHARE_PAYLOAD) return undefined;
  return `${APP_URL}?import=${payload}&view=read&pages=0`;
}

function openInBrowser(path) {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [path]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', path]]
        : ['xdg-open', [path]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', (err) => process.stderr.write(`markpage-page: cannot open a browser (${err.message})\n`));
  child.unref();
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const fromStdin = opts.input === '-';
  const inputPath = fromStdin ? undefined : resolve(opts.input);
  if (inputPath && !existsSync(inputPath)) fail(`no such file: ${opts.input}`);
  const original = readFileSync(fromStdin ? 0 : inputPath, 'utf8');
  const docDir = inputPath ? dirname(inputPath) : process.cwd();
  const warnings = [];

  // Images: an Artifact serves local images as its own files; a self-contained
  // page embeds them; a page opened from disk links them from the document's folder.
  const files = {};
  const taken = new Map();
  let inlined = 0;
  const md = mapImageTargets(original, (target) => {
    if (isRemote(target)) {
      if (opts.artifact && !target.startsWith('data:')) {
        warnings.push(`remote image ${target} is blocked inside an Artifact (its CSP admits data: and its own files only)`);
      }
      return undefined;
    }
    const file = localImage(target, docDir);
    if (!file) {
      if (!target.startsWith('img://')) warnings.push(`image not found: ${target}`);
      return undefined;
    }
    if (opts.inlineImages) {
      const data = readFileSync(file);
      inlined += data.length;
      return `data:${IMAGE_TYPES[extname(file).toLowerCase()]};base64,${data.toString('base64')}`;
    }
    if (opts.artifact) {
      const published = publishedPath(target, file, taken);
      files[published] = file;
      return published === target ? undefined : published;
    }
    return undefined; // resolved against data-base at render time
  });

  const title = pageTitle(original, opts, inputPath);
  const viewer = opts.viewer ?? process.env.MARKPAGE_VIEWER_URL ?? VIEWER_URL;
  const attrs = [
    'class="markpage-source"',
    opts.pages ? 'data-pages="1"' : '',
    opts.lang ? `data-lang="${opts.lang}"` : '',
    !opts.artifact && !opts.inlineImages && inputPath
      ? `data-base="${escapeAttr(pathToFileURL(docDir + sep).href)}"`
      : '',
  ].filter(Boolean);

  // Before the viewer runs (or if it cannot load) the page shows the source,
  // themed like the viewer's desk.
  const head = `<title>${escapeHtml(title)}</title>
<style>
  :root { --mp-desk: #e9eaee; --mp-ink: #1f2328; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --mp-desk: #1c1d21; --mp-ink: #d9dbe0; color-scheme: dark; }
  }
  :root[data-theme="dark"] { --mp-desk: #1c1d21; --mp-ink: #d9dbe0; color-scheme: dark; }
  body { margin: 0; background: var(--mp-desk); color: var(--mp-ink); }
  pre.markpage-source {
    box-sizing: border-box; max-width: 52rem; margin: 0 auto; padding: 24px 16px;
    white-space: pre-wrap; overflow-wrap: anywhere;
    font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
</style>
`;
  // A <pre> drops one newline right after its start tag, hence the leading "\n".
  const content = `<pre ${attrs.join(' ')}>
${escapeHtml(md)}</pre>
<script type="module" src="${escapeAttr(viewer)}"></script>
`;
  const lang = opts.lang ?? (/^language:\s*en\b/m.test(original) ? 'en' : 'fr');
  const page = opts.artifact
    ? head + content
    : `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}</head>
<body>
${content}</body>
</html>
`;

  const name = (inputPath ? basename(inputPath) : 'document.md').replace(/\.[^.]+$/, '');
  const out = resolve(opts.out ?? join(tmpdir(), 'markpage', `${name}.html`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);

  const bytes = Buffer.byteLength(page);
  if (opts.artifact && bytes > ARTIFACT_MAX_BYTES) {
    warnings.push(`the page is ${(bytes / 1048576).toFixed(1)} MB — over an Artifact's 16 MB`);
  } else if (inlined > 8 * 1024 * 1024) {
    warnings.push(`${(inlined / 1048576).toFixed(1)} MB of images inlined`);
  }
  const link = opts.link ? shareLink(original) : undefined;
  if (opts.link && !link) warnings.push('the document is too large for a markpage.org link (over ~8 KB gzipped)');

  const result = {
    page: out,
    bytes,
    mode: opts.artifact ? 'artifact' : 'page',
    viewer,
    title,
    files: Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, relative(process.cwd(), v) || v]),
    ),
    ...(link ? { link } : {}),
    warnings,
  };
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`page: ${out} (${(bytes / 1024).toFixed(1)} KB, ${result.mode})\n`);
    const entries = Object.entries(result.files);
    if (entries.length) {
      process.stdout.write('files to publish with it (Artifact `files`, published path → source):\n');
      for (const [k, v] of entries) process.stdout.write(`  ${k} → ${v}\n`);
    }
    if (link) process.stdout.write(`markpage.org: ${link}\n`);
    for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
  }
  if (opts.open) openInBrowser(out);
}

main();
