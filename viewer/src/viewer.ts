// viewer.ts — @orlarey/markpage-viewer: render markpage Markdown in any page.
//
// A page carries its Markdown in `<pre class="markpage-source">`, HTML-escaped,
// and loads this module. Until the module runs (or if it cannot load) the page
// reads as the plain source; once it runs, the source is rendered with the
// markpage app's own pipeline — the named style picked by `document-style:`,
// MathJax, Mermaid, every fence — as the app's white sheet on a desk, with a
// Continuous / Pages switch, a Source view and an "open in markpage" link.
//
// It is built to run as a claude.ai Artifact (the Claude Code plugin's pages):
// only scripts may come from the CDN that serves it, so the CSS ships as text
// in the module, the fonts it needs come from Google Fonts or as data: URLs, and
// nothing is fetched. Options, on the <pre>:
//   data-pages="1"          open in Pages (default: Continuous)
//   data-lang="fr" | "en"   base document language (else the browser's);
//                           a `language:` front-matter key overrides it
//   data-base="<url>"       base URL for relative image paths
//   data-app="<url>"        the markpage web app the link opens (markpage.org)

import css from 'virtual:viewer-css';
// Side-effect import: registers markpage's marked extensions (fences, math, …).
import '@orlarey/markpage-render';

import { parseFrontmatter } from '@orlarey/markpage-render';
import {
  applyPageFills,
  buildDocumentDom,
  renderContinuousSheet,
} from '../../src/document-render';
import { loadSettingsFonts, registerCustomFonts } from '../../src/font-loader';
import { applyPreviewStyles } from '../../src/preview';
import { pageSizeMm, paginate } from '../../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../../src/settings';
import { encodeShareContent, MAX_SHARE_PAYLOAD } from '../../src/share-url';
import { resolveDocumentSettings } from '../../src/style-library';
import { makeIcon } from '../../src/ui/icons';

/** The faces the app bundles with @fontsource, served by Google Fonts here. */
const ROBOTO_FAMILIES =
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500' +
  '&family=Roboto+Condensed:ital,wght@0,400;0,500;1,400;1,500' +
  '&family=Roboto+Mono:ital,wght@0,400;0,500;1,400&display=swap';

const DEFAULT_APP = 'https://markpage.org/';

/** Characters system fonts often lack: arrows, math operators and brackets
 *  (⟦ ⟧ ⊢ …), technical symbols, math alphanumerics. */
const NEEDS_NOTO = /[←-⏿⟀-⯿\u{1D400}-\u{1D7FF}]/u;

const LABELS = {
  fr: {
    continuous: 'Continu',
    continuousTitle: 'Continu : le document d’un seul tenant, sans sauts de page',
    pages: 'Pages',
    pagesTitle: 'Pages : le document découpé en pages, comme imprimé',
    source: 'Source',
    sourceTitle: 'Afficher le Markdown source',
    open: 'markpage ↗',
    openTitle: 'Ouvrir ce document dans markpage (éditer, exporter en PDF)',
    renderFailed: 'Rendu impossible — le Markdown source est affiché.',
    pagesFailed: 'Pagination impossible ici — affichage continu.',
  },
  en: {
    continuous: 'Continuous',
    continuousTitle: 'Continuous: the document in one piece, no page breaks',
    pages: 'Pages',
    pagesTitle: 'Pages: the document cut into pages, as printed',
    source: 'Source',
    sourceTitle: 'Show the Markdown source',
    open: 'markpage ↗',
    openTitle: 'Open this document in markpage (edit, export to PDF)',
    renderFailed: 'Rendering failed — showing the Markdown source.',
    pagesFailed: 'Pagination is unavailable here — continuous view.',
  },
} as const;
type Labels = (typeof LABELS)['fr'] | (typeof LABELS)['en'];

interface Viewer {
  md: string;
  source: HTMLElement;
  pane: HTMLElement;
  settings: PdfSettings;
  labels: Labels;
  base: string;
  app: string;
  paginated: boolean;
  showSource: boolean;
  token: number;
  status: HTMLElement;
  switchBtns: { continuous: HTMLButtonElement; pages: HTMLButtonElement };
  sourceBtn: HTMLButtonElement;
  openLink: HTMLAnchorElement;
  sharePayload?: string;
}

function main(): void {
  const source = document.querySelector<HTMLElement>('pre.markpage-source');
  if (!source) {
    console.warn('[markpage-viewer] no <pre class="markpage-source"> on this page');
    return;
  }
  installStyles();
  serveDataUrlsLocally();
  document.body.classList.add('mp-viewer');

  const md = source.textContent ?? '';
  const { meta } = parseFrontmatter(md);
  const baseLang = source.dataset.lang ?? navigator.language ?? '';
  const base: PdfSettings = {
    ...DEFAULT_SETTINGS,
    language: baseLang.toLowerCase().startsWith('en') ? 'en' : 'fr',
  };
  const { settings, unknownStyle } = resolveDocumentSettings(meta, base);
  if (unknownStyle) {
    console.warn(`[markpage-viewer] unknown document-style "${unknownStyle}": default style used`);
  }
  if (!document.title && meta.title) document.title = meta.title;

  const pane = document.createElement('section');
  pane.id = 'preview-pane';
  pane.className = 'markpage';
  pane.hidden = true;
  source.after(pane);

  const status = document.createElement('div');
  status.className = 'mpv-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  document.body.append(status);

  const labels = LABELS[settings.language] ?? LABELS.en;
  const v: Viewer = {
    md,
    source,
    pane,
    settings,
    labels,
    base: source.dataset.base ? source.dataset.base.replace(/\/?$/, '/') : '',
    app: source.dataset.app ?? DEFAULT_APP,
    paginated: source.dataset.pages === '1' || source.dataset.pages === 'true',
    showSource: false,
    token: 0,
    status,
    ...makeBar(labels),
  };
  wireBar(v);

  if (NEEDS_NOTO.test(md)) {
    void import('./noto-fallback')
      .then((m) => m.registerNotoFallback())
      .catch(() => undefined);
  }
  void encodeShareContent(md)
    .then((payload) => {
      if (payload.length > MAX_SHARE_PAYLOAD) return;
      v.sharePayload = payload;
      updateOpenLink(v);
    })
    .catch(() => undefined);

  void render(v);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyZoom(v), 100);
  });
}

/** The bundled CSS first in <head> (so the page's own rules win), then the
 *  Roboto families from Google Fonts. */
function installStyles(): void {
  if (document.getElementById('markpage-viewer-css')) return;
  const style = document.createElement('style');
  style.id = 'markpage-viewer-css';
  style.textContent = css;
  document.head.prepend(style);
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = ROBOTO_FAMILIES;
  style.after(fonts);
}

/**
 * Vivliostyle (Pages) loads its user-agent templates with `fetch('data:…')`.
 * An Artifact's CSP limits `connect-src`, which refuses even a data: URL —
 * yet its content is in the URL itself: answer such fetches locally.
 */
function serveDataUrlsLocally(): void {
  const native = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('data:')) return native(input, init);
    const comma = url.indexOf(',');
    if (comma < 0) return native(input, init);
    const meta = url.slice(5, comma);
    const data = url.slice(comma + 1);
    const base64 = /;base64$/i.test(meta);
    const type = meta.replace(/;base64$/i, '') || 'text/plain;charset=US-ASCII';
    const body = base64
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : decodeURIComponent(data);
    return Promise.resolve(new Response(body, { headers: { 'Content-Type': type } }));
  };
}

function makeBar(labels: Labels): Pick<Viewer, 'switchBtns' | 'sourceBtn' | 'openLink'> {
  const bar = document.createElement('div');
  bar.className = 'mpv-bar';
  const seg = document.createElement('div');
  seg.className = 'mpv-seg';
  seg.setAttribute('role', 'group');
  const side = (icon: 'page-flow' | 'page-stack', label: string, title: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mpv-btn';
    b.title = title;
    b.setAttribute('aria-label', label);
    b.append(makeIcon(icon));
    seg.append(b);
    return b;
  };
  const continuous = side('page-flow', labels.continuous, labels.continuousTitle);
  const pages = side('page-stack', labels.pages, labels.pagesTitle);
  const sourceBtn = document.createElement('button');
  sourceBtn.type = 'button';
  sourceBtn.className = 'mpv-btn';
  sourceBtn.title = labels.sourceTitle;
  sourceBtn.textContent = labels.source;
  sourceBtn.setAttribute('aria-pressed', 'false');
  const openLink = document.createElement('a');
  openLink.className = 'mpv-btn';
  openLink.title = labels.openTitle;
  openLink.textContent = labels.open;
  openLink.target = '_blank';
  openLink.rel = 'noopener';
  openLink.hidden = true; // until the share payload is known to fit
  bar.append(seg, sourceBtn, openLink);
  document.body.append(bar);
  return { switchBtns: { continuous, pages }, sourceBtn, openLink };
}

function wireBar(v: Viewer): void {
  const choose = (paginated: boolean) => {
    // A switch, not a toggle: the side already on does nothing.
    if (v.paginated === paginated && !v.showSource) return;
    v.paginated = paginated;
    setSource(v, false);
    void render(v);
  };
  v.switchBtns.continuous.addEventListener('click', () => choose(false));
  v.switchBtns.pages.addEventListener('click', () => choose(true));
  v.sourceBtn.addEventListener('click', () => setSource(v, !v.showSource));
  markSwitch(v);
}

function markSwitch(v: Viewer): void {
  for (const [b, on] of [
    [v.switchBtns.continuous, !v.paginated],
    [v.switchBtns.pages, v.paginated],
  ] as const) {
    b.setAttribute('aria-pressed', String(on && !v.showSource));
  }
  updateOpenLink(v);
}

function setSource(v: Viewer, show: boolean): void {
  v.showSource = show;
  v.sourceBtn.setAttribute('aria-pressed', String(show));
  v.source.hidden = !show;
  v.pane.hidden = show;
  markSwitch(v);
  if (!show) applyZoom(v);
}

/** The markpage web app's share link (`?import=`), opened in Lire. */
function updateOpenLink(v: Viewer): void {
  if (!v.sharePayload) return;
  const url = new URL(v.app);
  url.search = '';
  v.openLink.href =
    `${url.href}?import=${v.sharePayload}&view=read&pages=${v.paginated ? '1' : '0'}`;
  v.openLink.hidden = false;
}

function showStatus(v: Viewer, text: string): void {
  v.status.textContent = text;
  v.status.hidden = false;
  setTimeout(() => {
    v.status.hidden = true;
  }, 6000);
}

async function render(v: Viewer): Promise<void> {
  const token = (v.token += 1);
  const { settings, pane } = v;
  markSwitch(v);
  registerCustomFonts(settings.customFonts);
  applyPreviewStyles(settings);
  installPrintCss(settings);
  void loadSettingsFonts(settings).catch(() => undefined);
  let built: HTMLElement;
  try {
    ({ built } = await buildDocumentDom(v.md, settings, {
      resolveImageSrc: (src) => resolveSrc(src, v.base),
    }));
  } catch (err) {
    console.error('[markpage-viewer] render failed', err);
    showStatus(v, v.labels.renderFailed);
    setSource(v, true);
    return;
  }
  if (token !== v.token) return; // superseded
  applyPageFills(pane, settings);
  // Both layouts measure what they lay out: the pane must be displayed.
  pane.hidden = false;
  if (v.paginated) {
    // Paginate into a hidden buffer inside the pane (so the scoped page CSS
    // applies), then swap the pages in. The engine measures glyphs as it
    // breaks lines, so the fonts come first.
    pane.classList.remove('continuous');
    const buffer = document.createElement('div');
    buffer.style.cssText =
      'position: absolute; top: 0; left: 0; width: 100%; visibility: hidden; pointer-events: none;';
    pane.append(buffer);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await paginate(built, settings, buffer);
    } catch (err) {
      console.error('[markpage-viewer] pagination failed', err);
      buffer.remove();
      if (token !== v.token) return;
      showStatus(v, v.labels.pagesFailed);
      v.paginated = false;
      void render(v);
      return;
    }
    if (token !== v.token) {
      buffer.remove();
      return;
    }
    pane.replaceChildren(...buffer.childNodes);
  } else {
    renderContinuousSheet(built, settings, pane);
  }
  setSource(v, v.showSource);
  document.documentElement.dataset.markpageRendered = v.paginated ? 'pages' : 'continuous';
}

/** Page size for Print → Save as PDF, from the document's style. */
function installPrintCss(settings: PdfSettings): void {
  let el = document.getElementById('mpv-print-css') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'mpv-print-css';
    document.head.append(el);
  }
  const { w, h } = pageSizeMm(settings);
  el.textContent = `@media print { @page { size: ${w}mm ${h}mm; margin: 0; } }`;
}

// ---- zoom: the full page width always visible ------------------------------
// r = min(1, W_v / W_p): W_p the natural width (a page, or a facing spread in
// duplex), W_v the pane's content width. Pages zoom through the app's
// `--mp-fit-zoom` variable; the continuous sheet takes `zoom` directly — except
// on a phone, where the app's own layout reflows it to the screen.

function setZoom(v: Viewer, r: number): void {
  if (v.paginated) v.pane.style.setProperty('--mp-fit-zoom', String(r));
  else {
    const sheet = v.pane.querySelector<HTMLElement>('.mp-continuous-sheet');
    if (sheet) sheet.style.zoom = r === 1 ? '' : String(r);
  }
}

function applyZoom(v: Viewer): void {
  if (v.pane.hidden) return;
  setZoom(v, 1);
  if (!v.paginated && window.matchMedia('(max-width: 600px)').matches) return;
  const first = v.pane.querySelector<HTMLElement>(
    v.paginated ? '.pagedjs_page' : '.mp-continuous-sheet',
  );
  if (!first) return;
  const w = first.getBoundingClientRect().width;
  const natural = v.paginated && v.pane.querySelector('.mp-spread') ? 2 * w : w;
  const cs = getComputedStyle(v.pane);
  const avail =
    v.pane.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
  if (natural > 0 && avail > 0) setZoom(v, Math.min(1, avail / natural));
}

/** Resolve a relative image src against the page's base URL. */
function resolveSrc(src: string, base: string): string {
  if (!base) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src;
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
