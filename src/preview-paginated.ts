// Paginated preview mode (SPEC §13). Lazy-loads paged.js and renders the
// document as a sequence of A4/A5/Letter pages with proper margins, the
// same way it would print. The fluid preview (preview.ts) remains the
// default; this module is reached only when the user toggles the
// "Mise en page" button in the toolbar.

import type { PdfSettings } from './settings';

interface Previewer {
  preview: (
    content: HTMLElement | string,
    stylesheets: Array<Record<string, string>>,
    renderTo: HTMLElement,
  ) => Promise<unknown>;
}

interface PagedJsModule {
  Previewer: new () => Previewer;
}

let modulePromise: Promise<PagedJsModule> | null = null;

async function loadPagedJs(): Promise<PagedJsModule> {
  modulePromise ??= (async () => {
    const mod = (await import('pagedjs')) as unknown as PagedJsModule;
    return mod;
  })();
  return modulePromise;
}

// Renders `source` (an already-rendered HTML element from the fluid
// preview pipeline) as paginated pages inside `renderTo`. Returns the
// promise resolved by paged.js once the layout is done; the caller can
// await it to know when scroll-sync can re-attach.
//
// We pass the sanitised SVGs (mermaid/math) as-is — they're already in
// `source`. paged.js preserves attributes during chunking, so the
// `data-line` annotations stamped by `annotateSourceLines` survive into
// the paginated DOM.
export async function paginate(
  source: HTMLElement,
  settings: PdfSettings,
  renderTo: HTMLElement,
): Promise<void> {
  const { Previewer } = await loadPagedJs();
  // Each `Previewer` instance is single-shot — calling preview() twice on
  // the same instance breaks. We create a fresh one per render, which is
  // cheap.
  const previewer = new Previewer();
  // Wrap each "label" (heading, or paragraph that introduces a block)
  // with its immediate next sibling so the pair gets a real
  // `break-inside: avoid` boundary. CSS `break-after: avoid` alone is
  // honoured inconsistently by paged.js when the next block is tall
  // (fenced code, math, mermaid, image, table); the wrapper is the
  // reliable fix.
  keepLabelsWithNext(source);
  // paged.js fills `renderTo` itself; clear any previous render first.
  renderTo.innerHTML = '';
  await previewer.preview(
    source,
    [{ 'paged-rules.css': pagedCss(settings) }],
    renderTo,
  );
}

// Walks the rendered preview and, for every "label" element, wraps it
// together with its immediately following sibling in a
// `<div class="keep-with-next">`. Exported so the print-based PDF
// export (phase 2, SPEC §13.6) can apply the same wrappers before
// handing content to the browser's native print engine. A label is:
//   - a heading (h1-h4), or
//   - a paragraph that immediately precedes a "presentable" block:
//     a fenced code block, display math, mermaid diagram, image, or
//     table. The classic case is `**Matrice**` followed by `$$…$$` —
//     the bold word is acting as a heading without being one.
//
// Done in **reverse** document order so chains (h2 → h3 → paragraph)
// end up in nested wrappers: the inner pair (h3 + paragraph) is
// wrapped first, then the outer h2 grabs that wrapper as its next
// sibling, keeping the trio together recursively.
export function keepLabelsWithNext(root: HTMLElement): void {
  const all = [...root.querySelectorAll<HTMLElement>('*')].reverse();
  for (const el of all) {
    if (!isLabel(el)) continue;
    const next = el.nextElementSibling;
    if (!next) continue;
    if (!el.parentElement) continue;
    const wrapper = root.ownerDocument.createElement('div');
    wrapper.className = 'keep-with-next';
    el.before(wrapper);
    wrapper.appendChild(el);
    wrapper.appendChild(next);
  }
}

function isLabel(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
    return true;
  }
  if (tag === 'p') {
    const next = el.nextElementSibling;
    return next ? isPresentableBlock(next) : false;
  }
  return false;
}

function isPresentableBlock(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'pre' || tag === 'table' || tag === 'img') return true;
  if (el.classList.contains('math-block')) return true;
  if (el.classList.contains('mermaid-block')) return true;
  return false;
}

// Builds the @page rules and the minimum-vital fragmentation policy from
// the user's PdfSettings. Returns a CSS string to hand to paged.js.
//
// Tables and blockquotes intentionally rely on browser/CSS defaults:
//  - `<thead>` is `display: table-header-group`, so the table header
//    repeats on every page when the table is split.
//  - `<blockquote>` is a regular block, so the left-bar `border-left`
//    naturally repeats on the page after a break.
// We add explicit rules only where the default would look wrong.
export function pagedCss(s: PdfSettings): string {
  const sizeMm = pageSizeMm(s);
  const m = s.margins;
  const pn = s.pageNumber;
  const pageNumberRule = pageNumberCss(pn);
  const styles = s.styles;
  return `
    @page {
      size: ${sizeMm.w}mm ${sizeMm.h}mm;
      margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
      ${pageNumberRule}
    }

    /* Body uses the same font cascade as the fluid preview; paged.js
       isolates its rendering, so we re-state the basics. */
    body {
      font-family: "Roboto Condensed", "Noto Sans Math",
        "Noto Sans Symbols", sans-serif;
      font-size: ${styles.body.fontSize}pt;
      line-height: ${s.lineHeight};
      color: ${styles.body.color};
      ${s.justify ? 'text-align: justify;' : ''}
    }

    h1 { font-size: ${styles.h1.fontSize}pt; color: ${styles.h1.color}; text-align: center; }
    h2 { font-size: ${styles.h2.fontSize}pt; color: ${styles.h2.color}; }
    h3 { font-size: ${styles.h3.fontSize}pt; color: ${styles.h3.color}; }
    h4, h5, h6 { font-size: ${styles.h4.fontSize}pt; color: ${styles.h4.color}; }

    /* pdfmake renders "bold" with Roboto Medium (500), not 700. We only
       ship the 400 and 500 weights, so leaving headings/strong at the
       default 700 forces the browser to *synthesise* a heavier weight,
       which prints noticeably heavier than the on-screen preview. */
    strong, b, h1, h2, h3, h4, h5, h6 { font-weight: 500; }

    /* Subtle rule below the top-level headings (matches the on-screen
       fluid preview's GitHub-ish look). */
    h1, h2, h3 {
      border-bottom: 1px solid #d0d7de;
      padding-bottom: 0.2em;
    }

    code, pre {
      font-family: "Roboto Mono", monospace;
      font-size: ${styles.code.fontSize}pt;
      color: ${styles.code.color};
    }
    pre { background: #f6f8fa; padding: 0.6em 0.9em; border-radius: 4px; }

    blockquote {
      font-size: ${styles.quote.fontSize}pt;
      color: ${styles.quote.color};
      border-left: 3px solid ${styles.quote.barColor};
      padding-left: 0.9em;
      margin: 0.6em 0;
      orphans: 3; widows: 3;
    }

    /* Fragmentation policy — minimum vital. Defaults are good for the
       rest; we observe in practice and add rules only on demand.

       Headings: we double-lock the relationship with their next sibling.
       paged.js honours 'break-after: avoid' on the heading, but if the
       next block (e.g. a fenced code block) doesn't fit on the remaining
       page space, the engine sometimes leaves the heading orphaned at
       the bottom anyway. Pairing it with 'break-before: avoid' on the
       adjacent sibling makes the keep-together explicit and reliable. */
    h1, h2, h3, h4 { break-after: avoid; }
    h1 + *, h2 + *, h3 + *, h4 + * { break-before: avoid; }
    /* Reliable keep-with-next: paginate() wraps each heading with its
       next sibling in a div carrying this class (reverse-iteration so
       chains of headings nest). */
    .keep-with-next { break-inside: avoid; }
    .math-block, .mermaid-block, img { break-inside: avoid; }
    p, li { orphans: 3; widows: 3; }
  `;
}

// Maps the PageSize enum to physical mm dimensions. Standard ISO sizes
// for A*/B5 plus the two US sizes; matches the table pdfmake uses
// internally.
function pageSizeMm(s: PdfSettings): { w: number; h: number } {
  switch (s.pageSize) {
    case 'A3':
      return { w: 297, h: 420 };
    case 'A4':
      return { w: 210, h: 297 };
    case 'A5':
      return { w: 148, h: 210 };
    case 'B5':
      return { w: 176, h: 250 };
    case 'LETTER':
      return { w: 215.9, h: 279.4 };
    case 'LEGAL':
      return { w: 215.9, h: 355.6 };
  }
}

// Translates the PageNumber settings into a `@bottom-center` (or wherever)
// rule inside `@page`. Returns "" when `position` is 'none'.
function pageNumberCss(pn: PdfSettings['pageNumber']): string {
  if (pn.position === 'none') return '';
  const [, hSide] = pn.position.split('-') as [
    'top' | 'bottom',
    'left' | 'center' | 'right',
  ];
  const vSide = pn.position.startsWith('top') ? 'top' : 'bottom';
  const at = `@${vSide}-${hSide}`;
  const italic = pn.style.italics ? 'font-style: italic;' : '';
  return `
    ${at} {
      content: counter(page);
      font-size: ${pn.style.fontSize}pt;
      color: ${pn.style.color};
      ${italic}
    }
  `;
}
