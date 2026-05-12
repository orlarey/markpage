// Paginated preview mode (SPEC §13). Lazy-loads paged.js and renders the
// document as a sequence of A4/A5/Letter pages with proper margins, the
// same way it would print. The fluid preview (preview.ts) remains the
// default; this module is reached only when the user toggles the
// "Mise en page" button in the toolbar.

import type { PdfSettings, TextStyle } from './settings';
import { quoteFontFamily } from './font-loader';

// Heading underline CSS fragment for paged.js / print output. Uses
// the GitHub-ish neutral grey to match the historical look — heading
// colour would feel too saturated under the printed page.
function pagedUnderline(s: TextStyle): string {
  return s.underline
    ? `border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em;`
    : '';
}

// Per-heading italic + weight for paged.js / print output.
function pagedHeadingExtras(s: TextStyle): string {
  return `font-style: ${s.italic ? 'italic' : 'normal'}; font-weight: ${s.weight ?? 500};`;
}

// Asymmetric vertical spacing for paged.js / print output. Matches
// the fluid preview's rule so the editor view stays a faithful
// proxy of the printed page. break-after: avoid lives in its own
// rule below (paged.js's break-processor parses our selectors and
// chokes on :where(...), so that rule stays unscoped).
function pagedHeadingMargin(settings: PdfSettings): string {
  const { above, below } = settings.headingSpacing;
  return `margin: ${above}em 0 ${below}em;`;
}

interface PagedPage {
  destroy?: () => void;
}

interface PagedChunker {
  pages?: PagedPage[];
}

interface Previewer {
  preview: (
    content: HTMLElement | string,
    stylesheets: Array<Record<string, string>>,
    renderTo: HTMLElement,
  ) => Promise<unknown>;
  chunker?: PagedChunker;
}

interface PagedJsModule {
  Previewer: new () => Previewer;
}

let modulePromise: Promise<PagedJsModule> | null = null;

// Holds the Previewer of the *currently displayed* render. Each Page it
// owns has a ResizeObserver attached to its wrapper; we must disconnect
// them (via Page.destroy()) before discarding the render, otherwise the
// observer's rAF callback can fire on detached/missing nodes the next
// time we re-paginate and crash deep inside paged.js's findEndToken
// ("Cannot read properties of null (reading 'nextSibling')").
let currentPreviewer: Previewer | null = null;

async function loadPagedJs(): Promise<PagedJsModule> {
  modulePromise ??= (async () => {
    const mod = (await import('pagedjs')) as unknown as PagedJsModule;
    return mod;
  })();
  return modulePromise;
}

function teardownPreviewer(p: Previewer): void {
  const pages = p.chunker?.pages ?? [];
  for (const page of pages) {
    try {
      page.destroy?.();
    } catch {
      /* a page may already be partially torn down — ignore */
    }
  }
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
  // Disconnect the previous render's ResizeObservers *before* wiping the
  // DOM. Otherwise the observers fire one last time on the now-detached
  // wrappers and their queued rAF callbacks walk a corrupted node graph.
  if (currentPreviewer) {
    teardownPreviewer(currentPreviewer);
    currentPreviewer = null;
  }
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
  currentPreviewer = previewer;
}

// One-shot pagination for the print export pipeline. Runs paged.js
// the same way as `paginate()` but **without** touching
// `currentPreviewer` — the preview pane's pages stay alive (so the
// user can return to preview after printing without re-paginating)
// and the print target's pages live just for the duration of the
// print dialog.
//
// Returns a teardown function that disconnects the print render's
// ResizeObservers; call it from the print pipeline's cleanup so the
// observers don't fire on the detached print target after `target.remove()`.
export async function paginateOnce(
  source: HTMLElement,
  settings: PdfSettings,
  renderTo: HTMLElement,
): Promise<() => void> {
  const { Previewer } = await loadPagedJs();
  const previewer = new Previewer();
  keepLabelsWithNext(source);
  renderTo.innerHTML = '';
  await previewer.preview(
    source,
    [{ 'paged-rules.css': pagedCss(settings) }],
    renderTo,
  );
  return () => {
    teardownPreviewer(previewer);
  };
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
  const headingsFamily = fontFamilyChain(s.fonts.headings, 'sans');
  const bodyFamily = fontFamilyChain(s.fonts.body, 'sans');
  const codeFamily = fontFamilyChain(s.fonts.code, 'mono');
  // All typography rules below are scoped to the two containers that
  // host paginated content: `#preview-pane` for the on-screen aperçu
  // (paged.js writes its `.pagedjs_pages` tree there), and
  // `#md2pdf-print-target` for the export-via-print pipeline. Without
  // the scope these rules would leak globally — paged.js inserts the
  // stylesheet via `<style>` in `<head>` — and bleed into the help
  // modal, the toolbar, etc. `:where(...)` keeps specificity at zero
  // so the rules can still be overridden by component CSS.
  const SCOPE = ':where(#preview-pane, #md2pdf-print-target)';
  return `
    @page {
      size: ${sizeMm.w}mm ${sizeMm.h}mm;
      margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
      ${pageNumberRule}
    }

    /* Body-equivalent styles applied to the paginated container. */
    ${SCOPE} {
      font-family: ${bodyFamily};
      font-size: ${styles.body.fontSize}pt;
      line-height: ${s.lineHeight};
      color: ${styles.body.color};
      ${s.justify ? 'text-align: justify;' : ''}
    }

    ${SCOPE} :is(h1, h2, h3, h4, h5, h6) { font-family: ${headingsFamily}; ${pagedHeadingMargin(s)} }
    ${SCOPE} h1 { font-size: ${styles.h1.fontSize}pt; color: ${styles.h1.color}; text-align: center; ${pagedUnderline(styles.h1)} ${pagedHeadingExtras(styles.h1)} }
    ${SCOPE} h2 { font-size: ${styles.h2.fontSize}pt; color: ${styles.h2.color}; ${pagedUnderline(styles.h2)} ${pagedHeadingExtras(styles.h2)} }
    ${SCOPE} h3 { font-size: ${styles.h3.fontSize}pt; color: ${styles.h3.color}; ${pagedUnderline(styles.h3)} ${pagedHeadingExtras(styles.h3)} }
    ${SCOPE} h4, ${SCOPE} h5, ${SCOPE} h6 { font-size: ${styles.h4.fontSize}pt; color: ${styles.h4.color}; ${pagedUnderline(styles.h4)} ${pagedHeadingExtras(styles.h4)} }
    /* First heading on the page should never push the body content
       down — paged.js doesn't trim leading margins itself. */
    ${SCOPE} > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
    ${SCOPE} p { margin: ${s.paragraphSpacing}em 0; }
    /* Prevent orphan headings at the foot of a page. This rule is
       intentionally unscoped: paged.js parses the selector itself
       and can't cope with our :where(...) scope, so we keep the
       selector dead simple. break-after only has effect in
       paginated contexts anyway, so leaking it globally is harmless. */
    h1, h2, h3, h4, h5, h6 { break-after: avoid; }

    /* Inline emphasis defaults to Medium so we never ask the browser
       to synthesise Bold from Roboto Condensed (which only ships
       Regular and Medium). Per-heading weight is set above. */
    ${SCOPE} :is(strong, b) { font-weight: 500; }

    ${SCOPE} :is(code, pre) {
      font-family: ${codeFamily};
      font-size: ${styles.code.fontSize}pt;
      color: ${styles.code.color};
    }
    ${SCOPE} pre { background: #f6f8fa; padding: 0.6em 0.9em; border-radius: 4px; }

    ${SCOPE} blockquote {
      font-size: ${styles.quote.fontSize}pt;
      color: ${styles.quote.color};
      border-left: 3px solid ${styles.quote.barColor};
      padding-left: 0.9em;
      margin: 0.6em 0;
      orphans: 3; widows: 3;
    }

    /* Images: cap both width and height to the page's content area so
       paged.js can always fit them on a page. Without max-height,
       portrait photos taller than the page combined with the
       break-inside:avoid rule below leave paged.js with an unsolvable
       layout — it logs "Unable to layout item" and (on Firefox) loops
       until the tab dies. The max-height is computed from the user's
       page geometry and a small slack for paragraph margins. */
    ${SCOPE} img {
      display: block;
      margin: 0.6em auto;
      max-width: 100%;
      max-height: ${sizeMm.h - m.top - m.bottom - 4}mm;
      width: auto;
      height: auto;
      object-fit: contain;
    }

    /* Fragmentation policy — left unscoped on purpose. paged.js's
       break-rule processor naively splits the selector list by comma
       before calling querySelectorAll, which corrupts CSS pseudo-class
       lists like :where(a, b) :is(c, d). break-* properties are inert
       outside a paginated context anyway, so leaking them globally is
       harmless. */
    h1, h2, h3, h4 { break-after: avoid; }
    h1 + *, h2 + *, h3 + *, h4 + * { break-before: avoid; }
    /* Reliable keep-with-next: paginate() wraps each label with its
       next sibling in a div carrying this class (reverse-iteration so
       chains of headings nest). */
    .keep-with-next { break-inside: avoid; }
    .math-block, .mermaid-block, img { break-inside: avoid; }
    /* Admonitions usually fit on a page (a paragraph or two); when
       they don't, the user's prose is what should split, not the
       boxed wrapper — keeping the colored bar and title together. */
    .admonition { break-inside: avoid; }
    p, li { orphans: 3; widows: 3; }
  `;
}

// Builds a CSS `font-family` value list ending with the appropriate
// generic + the Noto fallbacks for math / symbols glyph coverage.
// `kind` selects which generic the chain tails with — `mono` for
// code, anything else for proportional text.
function fontFamilyChain(name: string, kind: 'sans' | 'mono'): string {
  const head = quoteFontFamily(name);
  // If the user picked a non-bundled, unknown family, we still emit
  // it; the browser falls through to the fallbacks if it can't load.
  // Bundled families (Roboto Condensed / Roboto Mono) are still
  // listed last as a network-free safety net.
  if (kind === 'mono') {
    return `${head}, "Roboto Mono", monospace`;
  }
  // Headings/body: tail with Noto Sans Math + Symbols (so math
  // glyphs and arrows resolve even when the chosen family lacks
  // them) and Roboto Condensed as the final bundled fallback.
  return `${head}, "Roboto Condensed", "Noto Sans Math", "Noto Sans Symbols", sans-serif`;
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
