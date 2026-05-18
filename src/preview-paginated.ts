/****************************** preview-paginated.ts ***************************
 *
 * Purpose: Paginated preview mode (SPEC §13). Lazy-loads paged.js and renders
 *   the document as a sequence of A4/A5/Letter pages — same look as printing.
 * How: Wrap labels with their next sibling for `break-inside: avoid`, hand off
 *   the result to paged.js along with a CSS bundle built from `PdfSettings`.
 *
 *******************************************************************************/

import type { PdfSettings, TextStyle } from './settings';
import { quoteFontFamily } from './font-loader';

/**
 * Purpose: Heading underline CSS fragment for paged.js / print output.
 * How: Uses a neutral grey border-bottom to match the historical printed look.
 */
function pagedUnderline(s: TextStyle): string {
  return s.underline
    ? `border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em;`
    : '';
}

/**
 * Purpose: Per-heading italic + weight for paged.js / print output.
 * How: Emits explicit `font-style` + `font-weight` declarations.
 */
function pagedHeadingExtras(s: TextStyle): string {
  return `font-style: ${s.italic ? 'italic' : 'normal'}; font-weight: ${s.weight ?? 500};`;
}

/**
 * Purpose: Asymmetric vertical spacing for paged.js / print output.
 * How: Same `above`/`below` em-units as the fluid preview, keeping parity.
 */
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

/**
 * Purpose: Lazy-import paged.js once, caching the module promise.
 * How: Memoised dynamic `import('pagedjs')` cast to our typed module shape.
 */
async function loadPagedJs(): Promise<PagedJsModule> {
  modulePromise ??= (async () => {
    const mod = (await import('pagedjs')) as unknown as PagedJsModule;
    return mod;
  })();
  return modulePromise;
}

/**
 * Purpose: Disconnect every page's ResizeObserver before discarding a render.
 * How: Iterate `chunker.pages` calling `Page.destroy()`, swallowing errors.
 */
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

/**
 * Purpose: Render `source` as paginated pages inside `renderTo` (preview pane).
 * How: Tear down any prior preview, wrap labels, hand off to a fresh Previewer.
 */
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

/**
 * Purpose: One-shot pagination for the print export pipeline (no global state).
 * How: Run paged.js into `renderTo`, return a teardown that disconnects observers.
 */
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

/**
 * Purpose: Wrap each "label" element with its next sibling so they can't be split.
 * How: Reverse-iterate elements; for each label, wrap (`<div class="keep-with-next">`).
 */
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

/**
 * Purpose: Decide whether an element acts as a "label" for the next block.
 * How: True for h1–h4, or a `<p>` directly preceding a presentable block.
 */
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

/**
 * Purpose: "Presentable block" = the kind a label is plausibly introducing.
 * How: Tag whitelist (pre/table/img) plus the math-block / mermaid-block classes.
 */
function isPresentableBlock(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'pre' || tag === 'table' || tag === 'img') return true;
  if (el.classList.contains('math-block')) return true;
  if (el.classList.contains('mermaid-block')) return true;
  return false;
}

/**
 * Purpose: Build the @page rules + minimal fragmentation policy from user settings.
 * How: Template literal scoped to `#preview-pane` / `#markpage-print-target`.
 */
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
  // `#markpage-print-target` for the export-via-print pipeline. Without
  // the scope these rules would leak globally — paged.js inserts the
  // stylesheet via `<style>` in `<head>` — and bleed into the help
  // modal, the toolbar, etc. `:where(...)` keeps specificity at zero
  // so the rules can still be overridden by component CSS.
  const SCOPE = ':where(#preview-pane, #markpage-print-target)';
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
    /* MathJax SVGs are sized in ex units (relative to the container's
       font-size), so scaling the math wrappers' font-size resizes the
       glyphs without re-rendering. */
    ${SCOPE} :is(.math-inline, .math-block) { font-size: ${s.mathScale}em; }
    /* Admonitions usually fit on a page (a paragraph or two); when
       they don't, the user's prose is what should split, not the
       boxed wrapper — keeping the colored bar and title together. */
    .admonition { break-inside: avoid; }
    p, li { orphans: 3; widows: 3; }
  `;
}

/**
 * Purpose: Build a CSS `font-family` value with sensible fallbacks.
 * How: Quote the head, append generic + bundled (`mono` vs proportional) tail.
 */
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

/**
 * Purpose: Map the PageSize enum to physical mm dimensions.
 * How: Switch over standard ISO + US sizes; matches pdfmake's table.
 */
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

/**
 * Purpose: Translate the PageNumber settings into a `@<corner>` rule.
 * How: Emits `content: counter(page)` with font styling, or "" when `none`.
 */
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
