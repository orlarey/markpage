// Print-based PDF export (SPEC §13.6, phase 2 of paginated preview).
// We paginate the print target with paged.js — same renderer as the
// on-screen preview — then call window.print(). Each `.pagedjs_page`
// div is one physical page; paged.js's @media print rules give it
// `page-break-after: always`, and our @page rule sets margin to 0 so
// Chrome's printable area matches the page divs exactly.
//
// Why not just feed plain HTML and let Chrome paginate? Because Chrome's
// print dialog "Margins" setting hard-overrides the @page margin we
// declare in CSS, replacing it with the dialog's value (Default ≈ 12 mm,
// None = 0 mm). The user's settings.margins were ignored. Going through
// paged.js bakes the margins into the page DIV layout, where Chrome
// can't touch them — at the cost of requiring "Margins: Aucune" in the
// print dialog.

import { marked } from 'marked';
import { renderMermaidBlocks, renderMathBlocks, renderMathInlines } from './preview';
import { applyPreviewMetadata } from './preview';
import { paginateOnce } from './preview-paginated';
import type { PdfSettings } from './settings';

const PRINT_TARGET_ID = 'md2pdf-print-target';
const PRINT_STYLE_ID = 'md2pdf-print-style';

export async function exportViaPrint(
  expandedSource: string,
  settings: PdfSettings,
  filename: string,
): Promise<void> {
  const content = await buildPrintContent(expandedSource, settings);

  // Mount the target with measurable dimensions so paged.js can lay
  // out pages even though we don't want it visible on screen.
  // `visibility: hidden` keeps the box in the layout (paged.js needs
  // computed widths to fragment paragraphs), and the off-screen
  // position keeps it from scrolling onto the visible viewport. We
  // strip these inline styles after pagination so the @media print
  // rule below can flip the target visible at print time.
  const target = ensureNode(document, 'div', PRINT_TARGET_ID);
  target.innerHTML = '';
  target.style.cssText =
    'position: fixed; left: -10000px; top: 0; ' +
    'width: 210mm; visibility: hidden; pointer-events: none;';

  // Wait for fonts before paginating — paged.js measures glyph widths
  // to decide where lines break, so a re-flow once webfonts arrive
  // would shift the page boundaries.
  await document.fonts.ready;

  // Run paged.js into the print target. Same renderer as the on-screen
  // preview: identical fragmentation, identical page numbers (rendered
  // as DOM children of each .pagedjs_page, not via @bottom-center which
  // would need a non-zero @page margin). `paginateOnce` does not touch
  // the global currentPreviewer state so the preview pane keeps its
  // pages alive for when the user returns to it after printing.
  const teardownPrintPreviewer = await paginateOnce(content, settings, target);

  // Clear the inline staging styles so @media print can take over.
  target.style.cssText = '';

  // Apply the screen/print toggle. Note we install this AFTER paginate
  // so the on-screen `display: none` doesn't fight paged.js's
  // measurement pass.
  const styleEl = ensureNode(document, 'style', PRINT_STYLE_ID);
  styleEl.textContent = printStylesheet(settings);

  // Suggested filename: most browsers pick `document.title` as the
  // default "Save as PDF" name. Swap and restore via afterprint.
  const previousTitle = document.title;
  document.title = filename.replace(/\.pdf$/i, '');

  const cleanup = (): void => {
    // Disconnect the print render's ResizeObservers before we detach
    // the target — otherwise their queued rAF callbacks fire on the
    // now-removed pages and walk a corrupted DOM (the same null-deref
    // family we patched in paged.js itself).
    teardownPrintPreviewer();
    target.remove();
    styleEl.remove();
    document.title = previousTitle;
    globalThis.removeEventListener('afterprint', cleanup);
  };
  globalThis.addEventListener('afterprint', cleanup);

  globalThis.print();

  // Safari sometimes doesn't fire afterprint when the dialog is
  // dismissed without printing — schedule a fallback cleanup.
  setTimeout(() => cleanup(), 30_000);
}

async function buildPrintContent(
  source: string,
  settings: PdfSettings,
): Promise<HTMLElement> {
  const el = document.createElement('div');
  el.innerHTML = marked.parse(source, { async: false }) as string;
  applyPreviewMetadata(el, settings);
  await Promise.all([
    renderMermaidBlocks(el),
    renderMathBlocks(el),
    renderMathInlines(el),
  ]);
  return el;
}

function ensureNode<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  id: string,
): HTMLElementTagNameMap[K] {
  const existing = doc.getElementById(id);
  if (existing) return existing as HTMLElementTagNameMap[K];
  const el = doc.createElement(tag);
  el.id = id;
  doc.body.appendChild(el);
  return el;
}

// CSS that ships at print time. Hides the editor app and forces the
// browser's page area to match the .pagedjs_page divs paged.js laid
// out — without this, Chrome's dialog "Margins: Default" would carve
// ~12 mm off every side and squeeze the divs.
//
// settings is unused here on purpose: page geometry is encoded in the
// .pagedjs_page divs themselves (paged.js polished it from
// `pagedCss(settings)` during paginate()). Chrome's @page only needs
// to declare `margin: 0` so the printable area matches the divs.
function printStylesheet(_settings: PdfSettings): string {
  return `
    /* On screen, the print target stays out of view. */
    @media screen {
      #${PRINT_TARGET_ID} { display: none; }
    }

    @media print {
      /* Only the print target is rendered. */
      body > *:not(#${PRINT_TARGET_ID}) { display: none !important; }
      #${PRINT_TARGET_ID} { display: block !important; }

      /* Force Chrome's printable area to the full paper. The user's
         margins are baked into the .pagedjs_page divs; the @page rule
         only needs to keep Chrome from carving extra margin around
         them. !important defeats paged.js's polished @page rule that
         would otherwise re-introduce the user's margins here. */
      @page { margin: 0 !important; }
    }
  `;
}
