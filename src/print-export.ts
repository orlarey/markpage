// Print-based PDF export (SPEC §13.6, phase 2 of paginated preview).
// When the user is in paginated mode and clicks "Exporter .pdf", we
// route through the browser's native print dialog instead of pdfmake.
// The browser uses CSS Paged Media (`@page`, `break-*`, orphans/widows)
// natively at print time, so the layout is exactly what they see in
// the paginated preview, with selectable text and vector math/mermaid.

import { marked } from 'marked';
import { renderMermaidBlocks, renderMathBlocks, renderMathInlines } from './preview';
import { applyPreviewMetadata } from './preview';
import { keepLabelsWithNext, pagedCss } from './preview-paginated';
import type { PdfSettings } from './settings';

const PRINT_TARGET_ID = 'md2pdf-print-target';
const PRINT_STYLE_ID = 'md2pdf-print-style';

// Builds a self-contained DOM subtree from the source, paginates it the
// same way the on-screen preview does (heading + label keep-with-next),
// injects it into a hidden div in the live document, applies the
// `@page` CSS, then calls `window.print()`. The browser handles the
// pagination natively for print.
//
// We use the live document (and not an iframe) so the user's installed
// fonts (`Roboto Condensed` etc., loaded once at app start) are
// available to the print engine without re-loading.
export async function exportViaPrint(
  expandedSource: string,
  settings: PdfSettings,
  filename: string,
): Promise<void> {
  const content = await buildPrintContent(expandedSource, settings);
  keepLabelsWithNext(content);

  // Mount the print container, hidden on screen, visible only in print.
  const target = ensureNode(document, 'div', PRINT_TARGET_ID);
  target.innerHTML = '';
  target.append(...content.childNodes);

  // Apply the dynamic @page rules + the screen/print toggle that hides
  // the rest of the app while the user is in the print dialog.
  const styleEl = ensureNode(document, 'style', PRINT_STYLE_ID);
  styleEl.textContent = printStylesheet(settings);

  // Suggested filename: most browsers pick `document.title` as the
  // default `Save as PDF` name. We swap it temporarily and restore on
  // the `afterprint` event so the visible browser tab title is unchanged
  // for the rest of the session.
  const previousTitle = document.title;
  document.title = filename.replace(/\.pdf$/i, '');

  // Wait for any newly-injected images / fonts to settle before opening
  // the dialog. document.fonts.ready resolves once webfonts have loaded;
  // images already have data URLs from `expandedSource`.
  await document.fonts.ready;

  const cleanup = (): void => {
    target.remove();
    styleEl.remove();
    document.title = previousTitle;
    globalThis.removeEventListener('afterprint', cleanup);
  };
  globalThis.addEventListener('afterprint', cleanup);

  globalThis.print();

  // Some browsers (Safari) don't fire `afterprint` reliably when the
  // user dismisses the dialog without printing. Schedule a fallback
  // cleanup after a generous delay.
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

// CSS that ships everything the browser needs at print time. Wraps the
// app-level rules (toolbar, editor, preview) in `@media print { display:
// none }` so only the print target is rendered, then re-uses the same
// `pagedCss(settings)` we already feed paged.js so screen and paper
// agree on margins, fonts, page numbers, fragmentation rules.
function printStylesheet(settings: PdfSettings): string {
  return `
    /* On screen, the print target is invisible — we use the live
       document (not an iframe) so fonts already loaded for the editor
       are available to the print engine. */
    @media screen {
      #${PRINT_TARGET_ID} { display: none; }
    }

    @media print {
      /* Hide the editor app; only the print target is rendered. */
      body > *:not(#${PRINT_TARGET_ID}) { display: none !important; }
      #${PRINT_TARGET_ID} { display: block !important; }

      /* Page geometry, fonts, fragmentation policy — same source of
         truth as the on-screen paginated preview. */
      ${pagedCss(settings)}
    }
  `;
}
