// preview.ts — runs inside the webview. Renders the document with the SAME
// pipeline as the markpage app (src/document-render.ts): the named style (or
// the default style) resolved from `document-style:`, the shared DOM build
// (Markdown → HTML, MathJax, Mermaid, mosaic), then either the continuous sheet
// or Vivliostyle pages. The webview owns only its chrome: zoom, scroll-sync,
// the floating toolbar and the HTML export.
//
// Scroll-sync: every top-level block is tagged with its source line (data-line)
// so the host can scroll the preview to the editor's position and vice versa.

// Same bundled faces as the app (main.ts) so the preview paints in the style's
// fonts on first frame; Google-hosted families load on demand (font-loader).
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/500.css';
import '@fontsource/roboto-condensed/400-italic.css';
import '@fontsource/roboto-condensed/500-italic.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';
import '@fontsource/roboto-mono/400-italic.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '../../../src/assets/fonts/et-book/et-book.css';
import 'highlight.js/styles/atom-one-light.css';
import '@orlarey/blocks/styles.css';
import '@orlarey/markpage-render/constructs.css';
import '../../../src/style.css';
// Side-effect import: registers markpage's marked extensions (fences, math, …).
import '@orlarey/markpage-render';

import { parseFrontmatter } from '@orlarey/markpage-render';
import {
  applyPageFills,
  buildDocumentDom,
  renderContinuousSheet,
} from '../../../src/document-render';
import { loadSettingsFonts, registerCustomFonts } from '../../../src/font-loader';
import { registerFallbackFonts } from '../../../src/fonts';
import { annotateSourceLines, applyPreviewStyles } from '../../../src/preview';
import { pageSizeMm, paginate } from '../../../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../../../src/settings';
import { resolveDocumentSettings } from '../../../src/style-library';

interface RenderMessage {
  type: 'render';
  md: string;
  baseUri: string;
  paginated: boolean;
  // VS Code's display language (`vscode.env.language`, e.g. 'fr', 'en-us'): the
  // base document language, overridden by a `language:` front-matter key.
  uiLanguage?: string;
}
interface ScrollMessage {
  type: 'scrollToLine';
  line: number;
}

// Bridge to the extension host (absent in the plain-browser dev harness).
const vscode =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const pane = document.getElementById('preview-pane') as HTMLElement;
let renderToken = 0;
let suppressScroll = false; // ignore the scroll event our own scrollToLine causes
let lastMsg: RenderMessage | undefined;
let currentSettings: PdfSettings = DEFAULT_SETTINGS;
let currentPaginated = false;
// Named styles already reported as unknown to the host (warn once per name).
const reportedStyles = new Set<string>();

// VS Code prepends a default stylesheet to every webview (`#_defaultStyles`)
// that paints body, links, `code` and `blockquote` with the EDITOR theme's
// colours — a dark-theme quote got a dark background under grey text. The
// preview is a printed page, independent of the editor theme: drop it. It is
// injected once per document load; theme changes only update CSS variables.
document.getElementById('_defaultStyles')?.remove();

void registerFallbackFonts().catch(() => undefined);

// Floating widget (top-right): toggle pagination + export. In VS Code it drives
// the host (source of truth); in the plain-browser harness it re-renders locally.
const toggleBtn = makeToolbar();

function makeToolbar(): HTMLButtonElement {
  const bar = document.createElement('div');
  bar.className = 'mp-toolbar';
  const toggle = document.createElement('button');
  toggle.className = 'mp-toggle';
  toggle.title = 'Toggle pagination (continuous ↔ pages)';
  toggle.textContent = '▭ Pages';
  toggle.addEventListener('click', () => {
    if (vscode) vscode.postMessage({ type: 'togglePagination' });
    else if (lastMsg) void render({ ...lastMsg, paginated: !lastMsg.paginated });
  });
  const print = document.createElement('button');
  print.className = 'mp-toggle';
  print.title = 'Open in browser to Save as PDF (best in Pages mode)';
  print.textContent = '⎙ PDF';
  print.addEventListener('click', requestExport);
  const web = document.createElement('button');
  web.className = 'mp-toggle';
  web.title = 'Open this document in the markpage web app';
  web.textContent = '↗ markpage.org';
  web.addEventListener('click', () => vscode?.postMessage({ type: 'openInMarkpage' }));
  web.hidden = !vscode;
  bar.append(toggle, print, web);
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

/** The base every document resolves from: DEFAULT_SETTINGS in VS Code's language. */
function baseSettings(uiLanguage: string | undefined): PdfSettings {
  const lang = (uiLanguage ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return { ...DEFAULT_SETTINGS, language: uiLanguage ? lang : DEFAULT_SETTINGS.language };
}

async function render(msg: RenderMessage): Promise<void> {
  lastMsg = msg;
  toggleBtn.classList.toggle('active', msg.paginated);
  const token = (renderToken += 1);
  const base = msg.baseUri ? msg.baseUri.replace(/\/?$/, '/') : '';
  const { meta } = parseFrontmatter(msg.md);
  const { settings, unknownStyle } = resolveDocumentSettings(meta, baseSettings(msg.uiLanguage));
  if (unknownStyle && !reportedStyles.has(unknownStyle)) {
    reportedStyles.add(unknownStyle);
    console.warn(`[markpage] unknown document-style: "${unknownStyle}"`);
    vscode?.postMessage({ type: 'unknownStyle', name: unknownStyle });
  }
  registerCustomFonts(settings.customFonts);
  applyPreviewStyles(settings);
  void loadSettingsFonts(settings).catch((err: unknown) => {
    console.error('[markpage] font load failed', err);
  });
  let built: HTMLElement;
  try {
    ({ built } = await buildDocumentDom(msg.md, settings, {
      resolveImageSrc: (src) => resolveSrc(src, base),
      beforeHydrate: (b) => annotateSourceLines(b, msg.md),
    }));
  } catch (err) {
    console.error('[markpage] render failed', err);
    return;
  }
  if (token !== renderToken) return; // superseded
  applyPageFills(pane, settings);
  if (msg.paginated) {
    // Paginate into a hidden buffer inside the pane (so the scoped page CSS
    // applies) and swap the pages in once ready — the previous render stays on
    // screen meanwhile. The engine measures glyphs as it breaks lines, so wait
    // for the fonts first.
    pane.classList.remove('continuous');
    const buffer = document.createElement('div');
    buffer.style.cssText =
      'position: absolute; top: 0; left: 0; width: 100%; visibility: hidden; pointer-events: none;';
    pane.append(buffer);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await paginate(built, settings, buffer);
    } catch (err) {
      console.error('[markpage] pagination failed', err);
      buffer.remove();
      return;
    }
    if (token !== renderToken) {
      buffer.remove();
      return;
    }
    pane.replaceChildren(...buffer.childNodes);
  } else {
    renderContinuousSheet(built, settings, pane);
  }
  currentSettings = settings;
  currentPaginated = msg.paginated;
  applyZoom();
}

// ---- PDF export -----------------------------------------------------------
// VS Code webviews can't reliably window.print(), so the "PDF" button serializes
// the current render to a self-contained HTML document and hands it to the host,
// which opens it in the system browser (Cmd/Ctrl-P → Save as PDF). That browser
// can't reach the webview's resources, so everything they serve — the fonts the
// document uses, its images — is inlined as data: URLs; Google-hosted fonts are
// public and stay linked.

/** Fetch a resource and return it as a data: URL (null when unreachable). */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** The font families the rendered document can use (style trio + per-element). */
function usedFamilies(s: PdfSettings): Set<string> {
  const names = [s.fonts.headings, s.fonts.body, s.fonts.code];
  for (const st of Object.values(s.styles)) if (st.family) names.push(st.family);
  return new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
}

/** An @font-face rule with its url()s inlined, or '' when unused / unreachable. */
async function inlineFontFace(rule: CSSFontFaceRule, base: string, used: Set<string>): Promise<string> {
  const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase();
  if (!used.has(family)) return '';
  let css = rule.cssText;
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const ref = m[1];
    if (ref.startsWith('data:')) continue;
    const data = await toDataUrl(new URL(ref, base).href);
    if (!data) return '';
    css = css.replace(m[0], `url("${data}")`);
  }
  return css;
}

/** Build a standalone HTML doc of the current render, with its CSS, fonts and
 *  images inlined. */
async function buildStandaloneHtml(): Promise<string> {
  const used = usedFamilies(currentSettings);
  let css = '';
  const links: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[];
    try {
      rules = Array.from(sheet.cssRules);
    } catch {
      // Cross-origin (Google Fonts): unreadable here, but public — link it.
      if (sheet.href?.startsWith('https:')) links.push(`<link rel="stylesheet" href="${sheet.href}">`);
      continue;
    }
    const base = sheet.href ?? document.baseURI;
    for (const rule of rules) {
      css += rule instanceof CSSFontFaceRule
        ? `${await inlineFontFace(rule, base, used)}\n`
        : `${rule.cssText}\n`;
    }
  }
  const clone = pane.cloneNode(true) as HTMLElement;
  for (const img of clone.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) continue;
    const data = await toDataUrl(new URL(src, document.baseURI).href);
    if (data) img.setAttribute('src', data);
  }
  const { w, h } = pageSizeMm(currentSettings);
  // Print rules: hide the widget, drop the desk + shadows, print at natural size.
  // In Pages mode each page is a physical sheet (margins baked in → @page margin
  // 0); the continuous sheet keeps its padding.
  const printCss = `@media print {
  html, body { background: #fff !important; margin: 0; padding: 0 !important; }
  .mp-toolbar { display: none !important; }
  @page { size: ${w}mm ${h}mm; margin: 0; }
  #preview-pane { background: #fff !important; padding: 0 !important; min-height: 0 !important; --mp-fit-zoom: 1; }
  #preview-pane .pagedjs_page { box-shadow: none !important; margin: 0 !important; }
  /* A break BEFORE every page but the first: a break after the last one would
     print a trailing blank sheet. */
  #preview-pane .pagedjs_page ~ .pagedjs_page { break-before: page; }
  #preview-pane .mp-continuous-sheet { box-shadow: none !important; zoom: 1 !important; }
  #preview-pane .mp-spread { display: block !important; }
}`;
  return `<!DOCTYPE html>
<html lang="${currentSettings.language}"><head><meta charset="utf-8"><title>markpage — PDF</title>
${links.join('\n')}
<style>${css}\n${printCss}</style></head>
<body class="mp-webview">${clone.outerHTML}</body></html>`;
}

/** Hand the standalone HTML to the host (→ system browser); harness falls back
 *  to the browser's own print. */
function requestExport(): void {
  if (!vscode) {
    window.print();
    return;
  }
  void buildStandaloneHtml().then((html) => vscode.postMessage({ type: 'exportHtml', html }));
}

// ---- zoom (drag-to-zoom, never wider than the panel) ----------------------
// Invariant: the FULL page width is always visible — the page is shown at
//   r = min(z, W_v / W_p)
// where z is the user's absolute zoom (1 = 100% of the natural page width, the
// default), W_p the natural width (a page, or a facing spread in duplex) and W_v
// the panel's content width. Dragging a side border sets z so the edge tracks
// the cursor; double-clicking a border resets z = 1. Pages zoom through the
// app's `--mp-fit-zoom` variable (style.css applies it to each page); the
// continuous sheet takes `zoom` directly. `zoom` reflows, so scrollbars and
// scroll-sync stay correct.

const Z_MIN = 0.2;
const Z_MAX = 3;
const EDGE_PX = 8; // hot zone (px) around a page side for the resize cursor
const PANE_GUTTER = 24; // px breathing room + scrollbar allowance
let zoom = 1; // z — the user's absolute zoom factor
let naturalWidth = 0; // W_p, measured at zoom 1 by applyZoom()
let appliedZoom = 1; // r

/** Panel content width W_v (px). */
function panelWidth(): number {
  return pane.clientWidth - PANE_GUTTER;
}

function setZoom(r: number): void {
  appliedZoom = r;
  if (currentPaginated) pane.style.setProperty('--mp-fit-zoom', String(r));
  else {
    const sheet = pane.querySelector<HTMLElement>('.mp-continuous-sheet');
    if (sheet) sheet.style.zoom = String(r);
  }
}

/** Measure W_p at zoom 1, then apply r = min(z, W_v / W_p). */
function applyZoom(): void {
  setZoom(1);
  const first = pane.querySelector<HTMLElement>(
    currentPaginated ? '.pagedjs_page' : '.mp-continuous-sheet',
  );
  if (!first) return;
  const w = first.getBoundingClientRect().width;
  // A duplex spread shows two pages side by side: fit both.
  naturalWidth = currentPaginated && pane.querySelector('.mp-spread') ? 2 * w : w;
  if (naturalWidth <= 0) return;
  setZoom(Math.min(zoom, panelWidth() / naturalWidth));
}

// Page side edges are computed from first principles in client coordinates,
// NOT from the zoomed elements' getBoundingClientRect — under CSS `zoom` the
// webview's Chromium reports rects that don't match `clientX`. The page is
// centred in the pane and its on-screen width is naturalWidth × appliedZoom.

/** Page centre x, in client px (the page is centred in the pane). */
function pageCenterX(): number {
  const r = pane.getBoundingClientRect();
  return r.left + pane.clientWidth / 2;
}

/** Is the cursor in the hot zone around a page side edge? */
function nearEdge(clientX: number, clientY: number): boolean {
  if (clientY < 0 || clientY > window.innerHeight || naturalWidth <= 0) return false;
  const c = pageCenterX();
  const h = (naturalWidth * appliedZoom) / 2;
  return Math.abs(clientX - (c - h)) <= EDGE_PX || Math.abs(clientX - (c + h)) <= EDGE_PX;
}

let dragging = false;
let centerX = 0; // page centre (px) captured at drag start — the page stays centred
// Anchored zoom: the grabbed content point, in natural (un-zoomed) px, kept
// opposite the cursor as the zoom changes. Scroll space only (window.scrollY /
// clientY) — no getBoundingClientRect under `zoom`.
let anchorNatY = 0;

window.addEventListener('pointermove', (e) => {
  if (dragging) {
    // On-screen half-width = |cursor − centre| ⇒ z = (2·half) / W_p. The edge
    // can't pass the panel border: min(z, fill) caps it there.
    const half = Math.abs(e.clientX - centerX);
    zoom = Math.max(Z_MIN, Math.min(Z_MAX, (2 * half) / naturalWidth));
    setZoom(Math.min(zoom, panelWidth() / naturalWidth));
    window.scrollTo(window.scrollX, anchorNatY * appliedZoom - e.clientY);
    e.preventDefault();
    return;
  }
  document.body.style.cursor = nearEdge(e.clientX, e.clientY) ? 'ew-resize' : '';
});

window.addEventListener('pointerdown', (e) => {
  if (!nearEdge(e.clientX, e.clientY)) return;
  centerX = pageCenterX();
  anchorNatY = (e.clientY + window.scrollY) / appliedZoom;
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
  for (const el of pane.querySelectorAll<HTMLElement>('[data-line]')) {
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
  for (const el of pane.querySelectorAll<HTMLElement>('[data-line]')) {
    if (el.getBoundingClientRect().top >= 0) {
      vscode?.postMessage({ type: 'revealLine', line: Number(el.dataset.line) });
      return;
    }
  }
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
