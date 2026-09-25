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
  fitWideTables,
  groupLetterheads,
  letterheadCss,
  layoutMosaicBlocks,
  parseFrontmatter,
  renderMathBlocks,
  renderMathInlines,
  renderMermaidBlocks,
  type Frontmatter,
} from '@orlarey/markpage-render';
import { applyPreviewMetadata, renderPreview } from './preview';
import { pageContentGeomPx, pageSizeMm } from './preview-paginated';
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
  pane.classList.add('continuous');
  pane.replaceChildren(sheet);
  const cs = getComputedStyle(sheet);
  const contentW =
    sheet.clientWidth -
    Number.parseFloat(cs.paddingLeft) -
    Number.parseFloat(cs.paddingRight);
  fitWideTables(sheet, contentW);
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
