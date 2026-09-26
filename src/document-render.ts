/******************************** document-render.ts ***************************
 *
 * Purpose: The document render shared by every host — the app's preview, the
 *   showcase demo frame and the VS Code preview webview — so they cannot drift:
 *   same DOM build, same continuous sheet, same paginated pages. (Settings come
 *   from resolveDocumentSettings, style-library.ts.)
 * How: Pure orchestration over preview.ts / preview-paginated.ts. The host
 *   keeps what is genuinely its own: where image refs point (a resolver), the
 *   pane it renders into, zoom and scroll-sync.
 *
 *******************************************************************************/

import {
  applySheetBackgrounds,
  firstPageBands,
  fitWideTables,
  groupLetterheads,
  letterheadCss,
  runningDate,
  setDocumentDate,
  slotToHtml,
  zoneToText,
  type Slots,
  layoutMosaicBlocks,
  parseFrontmatter,
  renderMathBlocks,
  renderMathInlines,
  renderMermaidBlocks,
  type Frontmatter,
} from '@orlarey/markpage-render';
import { applyPreviewMetadata, renderPreview } from './preview';
import { pageContentGeomPx, pageSizeMm, runningContentDecls } from './preview-paginated';
import type { PdfSettings } from './settings';

/**
 * Purpose: Build the hydrated DOM subtree of a document: Markdown → HTML, title
 *   block, then math / mermaid / mosaic.
 * How: renderPreview + applyPreviewMetadata, an optional `<img src>` rewrite
 *   (the host's image seam — before the mosaic, which lays images out), the
 *   host's `beforeHydrate` hook (source-line annotation: top-level blocks are
 *   still 1:1 with the Markdown tokens there), then the async hydrate passes
 *   in parallel. Mosaic geometry is computed from the settings, not measured,
 *   so a cold render packs like a warm one.
 */
export async function buildDocumentDom(
  source: string,
  settings: PdfSettings,
  opts: {
    resolveImageSrc?: (src: string) => string;
    beforeHydrate?: (built: HTMLElement) => void;
  } = {},
): Promise<{ built: HTMLElement; meta: Frontmatter }> {
  const { meta } = parseFrontmatter(source);
  // Headers / footers print the document's own date, when it has one.
  setDocumentDate(meta.date);
  const built = document.createElement('div');
  renderPreview(built, source, settings.numbering);
  const resolve = opts.resolveImageSrc;
  if (resolve) {
    for (const img of built.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (src) img.setAttribute('src', resolve(src));
    }
  }
  applyPreviewMetadata(built, settings, meta);
  opts.beforeHydrate?.(built);
  const preamble = meta['mathjax-preamble'] ?? '';
  await Promise.all([
    renderMermaidBlocks(built),
    renderMathBlocks(built, settings.mathFontSet, preamble),
    renderMathInlines(built, settings.mathFontSet, preamble),
    layoutMosaicBlocks(built, pageContentGeomPx(settings)),
  ]);
  return { built, meta };
}

/**
 * Purpose: Continuous (non-paginated) render — the content flows in a single
 *   white sheet of page width, fast enough to re-render on every keystroke.
 * How: Move `built`'s children into a `.mp-continuous-sheet` sized from the
 *   page geometry (padding = the text block's margins), then zoom over-dense
 *   tables down to the sheet's text column once it is measurable.
 */
export function renderContinuousSheet(
  built: HTMLElement,
  settings: PdfSettings,
  pane: HTMLElement,
): void {
  // A prior paginated render's injected <style> blocks carry page-only rules —
  // notably the `position: absolute` letterhead window — that would leak here.
  document
    .querySelectorAll('style[data-pagedjs-inserted-styles]')
    .forEach((s) => s.remove());
  const sheet = document.createElement('div');
  sheet.className = 'mp-continuous-sheet';
  const sizeMm = pageSizeMm(settings);
  const t = settings.pageGeometry.text;
  sheet.style.width = `${sizeMm.w}mm`;
  // padding = top right bottom left (right = outer, left = inner).
  sheet.style.padding = `${t.top}mm ${t.outer}mm ${t.bottom}mm ${t.inner}mm`;
  while (built.firstChild) sheet.appendChild(built.firstChild);
  // A letter's head as on the printed page: sender and recipient grouped, the
  // recipient at the envelope window — the sheet is page-wide, so the window
  // is placed from its edges (paged mode: from the text block's).
  groupLetterheads(sheet);
  sheet.style.position = 'relative';
  setContinuousLetterheadCss(settings, t);
  // Without pages the sheet is ONE long page: its backdrops over the whole
  // sheet, its header at the top and its footer at the bottom.
  applySheetBackgrounds(sheet);
  addSheetRunning(sheet, settings);
  pane.classList.add('continuous');
  pane.replaceChildren(sheet);
  const cs = getComputedStyle(sheet);
  const contentW =
    sheet.clientWidth -
    Number.parseFloat(cs.paddingLeft) -
    Number.parseFloat(cs.paddingRight);
  fitWideTables(sheet, contentW);
}

/**
 * The header and footer of the continuous sheet, drawn as the first page's:
 * an in-document fence band wins over the style's running apparatus, band by
 * band (as in paged mode); {page} and {pages} are 1. Across, the bands keep
 * the page's running margins as fractions of the sheet (it shrinks to its
 * pane); down, the header / footer distances in millimetres.
 */
function addSheetRunning(sheet: HTMLElement, settings: PdfSettings): void {
  const geo = settings.pageGeometry;
  const pageW = pageSizeMm(settings).w;
  const text = (sel: string): string => {
    const el = sheet.querySelector(sel)?.cloneNode(true) as HTMLElement | undefined;
    el?.querySelectorAll('.heading-num').forEach((n) => n.remove());
    return el?.textContent?.trim() ?? '';
  };
  const doctitle = text('h1.doc-title');
  const chapter = text('h1:not(.doc-title)');
  const vars: Record<string, string> = {
    page: '1',
    pages: '1',
    date: runningDate(),
    title: text('h1'),
  };
  const ctx = { folio: 1, chapter, section: text('h2'), doctitle, author: settings.author?.text ?? '' };
  const fences = firstPageBands(sheet);
  const legacy = (s?: string): Slots | undefined =>
    !settings.runningApparatus && s?.trim() ? parseLegacyBand(s) : undefined;
  const bands: [('header' | 'footer'), Slots | undefined, string[] | undefined][] = [
    ['header', fences.header ?? legacy(settings.header), apparatusZones(settings, 'header', ctx)],
    ['footer', fences.footer ?? legacy(settings.footer), apparatusZones(settings, 'footer', ctx)],
  ];
  const decls = runningContentDecls(settings.styles['running-content']);
  for (const [kind, fence, zones] of bands) {
    const cells = fence
      ? [fence.left, fence.center, fence.right].map((c) => slotToHtml(c, vars))
      : zones?.map(escapeHtml);
    if (!cells || cells.every((c) => c === '')) continue;
    const band = document.createElement('div');
    band.className = `mp-sheet-running mp-sheet-${kind}`;
    band.style.cssText =
      `${decls} position: absolute; display: grid; grid-template-columns: 1fr auto 1fr;` +
      ` gap: 1em; align-items: baseline;` +
      ` left: ${(geo.running.inner / pageW) * 100}%; right: ${(geo.running.outer / pageW) * 100}%;` +
      (kind === 'header' ? ` top: ${geo.header.top}mm;` : ` bottom: ${geo.footer.bottom}mm;`);
    cells.forEach((html, i) => {
      const cell = document.createElement('div');
      cell.style.textAlign = ['left', 'center', 'right'][i] ?? 'left';
      cell.innerHTML = html;
      band.append(cell);
    });
    sheet.append(band);
  }
}

/** The style's running apparatus for one band, as text (recto: inner = left). */
function apparatusZones(
  settings: PdfSettings,
  kind: 'header' | 'footer',
  ctx: Parameters<typeof zoneToText>[1],
): string[] | undefined {
  const zones = settings.runningApparatus?.[kind].recto;
  if (!zones) return undefined;
  return [zoneToText(zones.inner, ctx), zoneToText(zones.center, ctx), zoneToText(zones.outer, ctx)];
}

/** A legacy `settings.header` / `footer` string, read like a fence body. */
function parseLegacyBand(body: string): Slots {
  const [left = '', center = '', right = ''] = body.split('|').map((s) => s.trim());
  return { left, center, right };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The letterhead layout for the continuous sheet (one <style>, replaced). */
function setContinuousLetterheadCss(
  settings: PdfSettings,
  t: PdfSettings['pageGeometry']['text'],
): void {
  const id = 'mp-continuous-letterhead';
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.append(style);
  }
  const size = pageSizeMm(settings);
  style.textContent = letterheadCss(
    {
      margins: { top: t.top, right: t.outer, bottom: t.bottom, left: t.inner },
      pageW: size.w,
      pageH: size.h,
    },
    { scope: '.mp-continuous-sheet', windowOrigin: 'sheet' },
  );
}

/**
 * Purpose: Drive the page / cover fills (style.css reads them on the pages).
 * How: Empty string falls back — page → white, cover → page fill.
 */
export function applyPageFills(pane: HTMLElement, settings: PdfSettings): void {
  pane.style.setProperty('--mp-page-bg', settings.pageBackground ?? '');
  pane.style.setProperty('--mp-cover-bg', settings.coverBackground ?? '');
}
