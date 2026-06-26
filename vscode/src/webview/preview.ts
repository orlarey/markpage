// preview.ts — runs inside the webview. Renders the document text with
// @orlarey/markpage-render: phase A (transform) then phase B (hydratePreview —
// MathJax + Mermaid). MathJax/Mermaid load as on-demand ESM chunks.
//
// Scroll-sync: every top-level block is tagged with its source line (data-line)
// so the host can scroll the preview to the editor's position and vice versa.

import {
  renderMarkpageMarkdown,
  renderMetadataBlock,
  parseFrontmatter,
  hydratePreview,
} from '@orlarey/markpage-render';
import { marked } from 'marked';
import { parseProfile, profileToCss, type Profile } from './profile-css';
// Bundled into dist/webview.css by esbuild — the hljs colour theme markpage uses
// (light) and the @orlarey/blocks DSL styles. media/preview.css adds the paper
// look + the CSS variables these need, and loads after to win overrides.
import 'highlight.js/styles/atom-one-light.css';
import '@orlarey/blocks/styles.css';

interface RenderMessage {
  type: 'render';
  md: string;
  baseUri: string;
  paginated: boolean;
}
interface ScrollMessage {
  type: 'scrollToLine';
  line: number;
}

// Page dimensions (mm) for the formats a `page-size:` frontmatter key may name.
const PAGE_DIMS_MM: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  B5: [176, 250],
  LETTER: [215.9, 279.4],
  LEGAL: [215.9, 355.6],
};

// markpage's default profile (settings.ts DEFAULT_SETTINGS): A4, 25 mm top/
// bottom, 35 mm left/right, footer page numbers on. Used when the document
// doesn't override them via frontmatter — so the preview looks like the PDF.
const DEFAULT_MARGINS = { top: 25, right: 35, bottom: 25, left: 35 };

interface Layout {
  pageW: number;
  pageH: number;
  margins: { top: number; right: number; bottom: number; left: number };
  pageNumbers: boolean;
  fonts: { body?: string; headings?: string; mono?: string };
}

/** Resolve the effective page layout: flat frontmatter keys win, then the
 *  embedded profile's layout, then the defaults. */
function layoutFromMeta(
  meta: ReturnType<typeof parseFrontmatter>['meta'],
  profile: Profile | null,
): Layout {
  const sizeKey = (meta['page-size'] ?? profile?.pageSize)?.trim().toUpperCase() ?? 'A4';
  const [pageW, pageH] = PAGE_DIMS_MM[sizeKey] ?? PAGE_DIMS_MM.A4;
  const pm = profile?.margins;
  const profileMargins = pm
    ? { top: pm.top, right: pm.right, bottom: pm.bottom, left: pm.left }
    : undefined;
  return {
    pageW,
    pageH,
    margins: meta.margins ?? profileMargins ?? DEFAULT_MARGINS,
    pageNumbers: meta['page-numbers'] ?? profile?.pageNumbers ?? true,
    fonts: { body: meta['font-body'], headings: meta['font-heading'], mono: meta['font-mono'] },
  };
}

/** @page rules for the paginated mode (paged.js reads these): size, margins,
 *  and a centred footer page number. */
function pageCss(L: Layout): string {
  const m = L.margins;
  const numbers = L.pageNumbers
    ? '@bottom-center { content: counter(page); font-size: 9pt; color: #555; }'
    : '';
  return `@page { size: ${L.pageW}mm ${L.pageH}mm; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; ${numbers} }`;
}

/** Apply the layout to the page sheet: font overrides always; in continuous
 *  mode the sheet carries the page width + margins (paged.js owns them when
 *  paginated, so we clear the inline box there). */
function applyLayoutToRoot(L: Layout, paginated: boolean): void {
  const setVar = (k: string, v?: string): void => {
    if (v) root.style.setProperty(k, v);
    else root.style.removeProperty(k);
  };
  setVar('--font-body', L.fonts.body);
  setVar('--font-heading', L.fonts.headings);
  setVar('--font-mono', L.fonts.mono);
  if (paginated) {
    for (const p of ['width', 'min-height', 'padding', 'max-width']) root.style.removeProperty(p);
  } else {
    const m = L.margins;
    root.style.width = `${L.pageW}mm`;
    root.style.minHeight = `${L.pageH}mm`;
    root.style.padding = `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
  }
}

let currentLayout: Layout = layoutFromMeta({ extra: {} }, null);

// Holds the CSS translated from the document's `markpage-profile` (per-element
// typography). Appended after the linked stylesheets so it wins the cascade;
// the flat font-* keys (set inline on the root) still win over it.
const profileStyle = document.createElement('style');
profileStyle.id = 'mp-profile';
document.head.append(profileStyle);

// Bridge to the extension host (absent in the plain-browser dev harness).
const vscode =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const root = document.getElementById('markpage-preview') as HTMLElement;
let renderToken = 0;
let suppressScroll = false; // ignore the scroll event our own scrollToLine causes
let lastMsg: RenderMessage | undefined;

// Floating widget (top-right, outside #markpage-preview so paged.js leaves it
// alone): toggle pagination + print. In VS Code it drives the host (source of
// truth); in the plain-browser harness it re-renders locally.
const toggleBtn = makeToolbar();

function makeToolbar(): HTMLButtonElement {
  const bar = document.createElement('div');
  bar.className = 'mp-toolbar';
  const toggle = document.createElement('button');
  toggle.className = 'mp-toggle';
  toggle.title = 'Toggle pagination (continuous ↔ A4 pages)';
  toggle.textContent = '▭ A4 pages';
  toggle.addEventListener('click', () => {
    if (vscode) vscode.postMessage({ type: 'togglePagination' });
    else if (lastMsg) void render({ ...lastMsg, paginated: !lastMsg.paginated });
  });
  const print = document.createElement('button');
  print.className = 'mp-toggle';
  print.title = 'Open in browser to Save as PDF (best in A4 pages mode)';
  print.textContent = '⎙ PDF';
  print.addEventListener('click', requestExport);
  bar.append(toggle, print);
  document.body.append(bar);
  return toggle;
}

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as RenderMessage | ScrollMessage | { type: 'print' } | undefined;
  if (!msg) return;
  if (msg.type === 'render') void render(msg);
  else if (msg.type === 'scrollToLine') scrollToLine(msg.line);
  else if (msg.type === 'print') requestExport();
});

// ---- PDF export -----------------------------------------------------------
// VS Code webviews can't reliably window.print(), so the "PDF" button serializes
// the current render to a self-contained HTML document and hands it to the host,
// which opens it in the system browser (Cmd/Ctrl-P → Save as PDF).

/** Build a standalone HTML doc of the current render, with all CSS inlined. */
function buildStandaloneHtml(): string {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) css += `${rule.cssText}\n`;
    } catch {
      /* a cross-origin sheet we can't read — skip it */
    }
  }
  const L = currentLayout;
  // Print rules: hide the widget, drop shadows, and set the page box. In
  // paginated mode each .pagedjs_page is a physical sheet (margins baked in →
  // @page margin 0); in continuous mode the single sheet keeps its padding.
  const printCss = `@media print {
  html, body { background: #fff !important; margin: 0; }
  .mp-toolbar { display: none !important; }
  @page { size: ${L.pageW}mm ${L.pageH}mm; margin: 0; }
  #markpage-preview { box-shadow: none !important; margin: 0 !important; max-width: none !important; zoom: 1 !important; }
  .pagedjs_page { box-shadow: none !important; margin: 0 !important; break-after: page; }
}`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>markpage — PDF</title>
<style>${css}\n${printCss}</style></head>
<body>${root.outerHTML}</body></html>`;
}

/** Hand the standalone HTML to the host (→ system browser); harness falls back
 *  to the browser's own print. */
function requestExport(): void {
  if (vscode) vscode.postMessage({ type: 'exportHtml', html: buildStandaloneHtml() });
  else window.print();
}

async function render(msg: RenderMessage): Promise<void> {
  lastMsg = msg;
  toggleBtn.classList.toggle('active', msg.paginated);
  const token = (renderToken += 1);
  const base = msg.baseUri ? msg.baseUri.replace(/\/?$/, '/') : '';
  // Same frontmatter handling as the markpage app: parse the YAML, render a
  // doc-title + author/org/date header (renderMetadataBlock), apply a per-doc
  // mathjax-preamble. The body offset keeps scroll-sync line numbers correct.
  const { meta, body } = parseFrontmatter(msg.md);
  const lineOffset = countNewlines(msg.md.slice(0, msg.md.length - body.length));
  const profile = parseProfile(meta['markpage-profile']);
  currentLayout = layoutFromMeta(meta, profile);
  profileStyle.textContent = profileToCss(profile);
  applyLayoutToRoot(currentLayout, msg.paginated);
  root.classList.remove('paginated');
  root.innerHTML =
    renderMetadataBlock(meta) +
    renderMarkpageMarkdown(body, {
      resolveImageSrc: (src) => resolveSrc(src, base),
    });
  annotateSourceLines(root, body, lineOffset);
  try {
    await hydratePreview(root, { fontSet: 'newcm', preamble: meta['mathjax-preamble'] ?? '' });
  } catch (err) {
    console.error('[markpage] hydrate failed', err);
  }
  if (token !== renderToken) return; // superseded
  if (msg.paginated) {
    try {
      await paginate(token);
    } catch (err) {
      console.error('[markpage] pagination failed', err);
    }
  }
  applyZoom();
}

// ---- zoom (fit-to-width + drag-to-zoom) -----------------------------------
// Invariant: the FULL page width is always visible — the page is shown at
//   r = min(z, W_v / W_p)
// where z is the user's absolute zoom (1 = 100% of the natural page width, the
// default), W_p the natural page width and W_v the panel's content width. The
// min() guarantees the page never gets wider than the panel (no horizontal
// scroll). Dragging a side border sets z so the edge tracks the cursor;
// double-clicking a border resets z = 1. Uses the `zoom` CSS property (Chromium,
// which the VS Code webview is) so layout reflows and scrollbars stay correct.

const Z_MIN = 0.2;
const Z_MAX = 3;
const EDGE_PX = 8; // hot zone (px) around a page side for the resize cursor
let zoom = 1; // z — the user's absolute zoom factor

/** Panel content width W_v (px). */
function panelWidth(): number {
  const styles = getComputedStyle(document.body);
  const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  return document.body.clientWidth - padX;
}

/** Natural (unzoomed) page width W_p (px). */
function naturalPageWidth(): number {
  return (currentLayout.pageW * 96) / 25.4;
}

/** Apply r = min(z, W_v / W_p) via the `zoom` property. */
function applyZoom(): void {
  const wp = naturalPageWidth();
  if (wp <= 0) return;
  root.style.setProperty('zoom', String(Math.min(zoom, panelWidth() / wp)));
}

/** The element whose side edges are the draggable page borders: the sheet in
 *  continuous mode, the first paged.js page in paginated mode. */
function pageElement(): HTMLElement {
  if (root.classList.contains('paginated')) {
    return (root.querySelector('.pagedjs_page') as HTMLElement | null) ?? root;
  }
  return root;
}

/** Is the cursor in the hot zone around a page side edge? (page x-edges, full
 *  preview height so the edge is grabbable anywhere down the column). */
function nearEdge(clientX: number, clientY: number): boolean {
  const xr = pageElement().getBoundingClientRect();
  const yr = root.getBoundingClientRect();
  const inV = clientY >= yr.top && clientY <= yr.bottom;
  return inV && (Math.abs(clientX - xr.left) <= EDGE_PX || Math.abs(clientX - xr.right) <= EDGE_PX);
}

let dragging = false;
let centerX = 0; // page centre (px) captured at drag start — the page stays centred

window.addEventListener('pointermove', (e) => {
  if (dragging) {
    // On-screen half-width = |cursor − centre| ⇒ z = (2·half) / W_p. The edge
    // can't pass the panel border: applyZoom's min(z, fill) caps it there.
    const half = Math.abs(e.clientX - centerX);
    zoom = Math.max(Z_MIN, Math.min(Z_MAX, (2 * half) / naturalPageWidth()));
    applyZoom();
    e.preventDefault();
    return;
  }
  document.body.style.cursor = nearEdge(e.clientX, e.clientY) ? 'ew-resize' : '';
});

window.addEventListener('pointerdown', (e) => {
  if (!nearEdge(e.clientX, e.clientY)) return;
  const xr = pageElement().getBoundingClientRect();
  centerX = xr.left + xr.width / 2;
  dragging = true;
  document.body.style.cursor = 'ew-resize';
  e.preventDefault(); // suppress text selection while dragging
});

window.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  document.body.style.cursor = '';
});

window.addEventListener('dblclick', (e) => {
  if (!nearEdge(e.clientX, e.clientY)) return;
  zoom = 1; // reset to natural-or-fill
  applyZoom();
});

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyZoom, 100);
});

/** Paginated mode: fragment the rendered content into A4 pages via paged.js. */
async function paginate(token: number): Promise<void> {
  // Snapshot the hydrated content (SVGs included) as the paged.js source.
  const source = document.createElement('div');
  source.innerHTML = root.innerHTML;
  const { Previewer } = await import('pagedjs');
  if (token !== renderToken) return; // a newer render started while loading
  // paged.js injects a generated <style> into <head> on every preview() and
  // never removes it — across edits/toggles they pile up and stale rules
  // (e.g. a previous run's @bottom-center page number) leak into the new
  // pages. Drop them before re-paginating so each run starts from a clean slate.
  document.querySelectorAll('style[data-pagedjs-inserted-styles]').forEach((s) => s.remove());
  root.classList.add('paginated');
  root.innerHTML = '';
  await new Previewer().preview(source, [{ 'markpage-page.css': pageCss(currentLayout) }], root);
}

// ---- scroll-sync ----------------------------------------------------------

/** Host → preview: scroll so the block at `line` sits near the top. */
function scrollToLine(line: number): void {
  const el = elementForLine(line);
  if (!el) return;
  suppressScroll = true;
  el.scrollIntoView({ block: 'start' });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      suppressScroll = false;
    });
  });
}

/** The last annotated block whose source line is ≤ `line`. */
function elementForLine(line: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    if (Number(el.dataset.line) <= line) best = el;
    else break;
  }
  return best;
}

// Preview → host: report the top visible block's source line (debounced).
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener(
  'scroll',
  () => {
    if (suppressScroll || !vscode) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(reportTopLine, 100);
  },
  { passive: true },
);

function reportTopLine(): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    if (el.getBoundingClientRect().top >= 0) {
      vscode?.postMessage({ type: 'revealLine', line: Number(el.dataset.line) });
      return;
    }
  }
}

// ---- source-line annotation (ported from markpage's annotateSourceLines) --

/** Tag each top-level rendered block with its source line (+ frontmatter offset). */
function annotateSourceLines(target: HTMLElement, source: string, offset: number): void {
  const tokens = marked.lexer(source);
  // The frontmatter header (doc-title h1 + .preview-metadata) has no source
  // line — skip it so body tokens still align with their rendered elements.
  const elements = Array.from(target.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !el.classList.contains('preview-metadata') &&
      !el.classList.contains('doc-title'),
  );
  let i = 0;
  let line = 0;
  for (const tok of tokens) {
    const renders = tok.type !== 'space' && tok.type !== 'html' && tok.type !== 'footnoteDef';
    if (renders) {
      const el = elements[i];
      if (el) el.dataset.line = String(line + offset);
      i += 1;
    }
    line += countNewlines(tok.raw);
  }
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) if (s.codePointAt(i) === 10) n += 1;
  return n;
}

// ---- helpers --------------------------------------------------------------

/** Resolve a relative image src against the document folder's webview URI. */
function resolveSrc(src: string, base: string): string {
  if (!base) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src;
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

// VS Code injects this into webview scripts.
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
