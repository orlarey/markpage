/****************************** preview-paginated.ts ***************************
 *
 * Purpose: Paginated preview mode (SPEC §13). Lazy-loads paged.js and renders
 *   the document as a sequence of A4/A5/Letter pages — same look as printing.
 * How: Wrap labels with their next sibling for `break-inside: avoid`, hand off
 *   the result to paged.js along with a CSS bundle built from `PdfSettings`.
 *
 *******************************************************************************/

import type { PdfSettings, Style } from './settings';
import { blockBoxCss, inlineCss } from './style-emit';
import { quoteFontFamily } from './font-loader';
import { groupLetterheads } from './letterhead';
import { splitLongPreBlocks } from './pre-split';

// Threshold for the pre-split pass (cf. `splitLongPreBlocks`). A code block
// taller than this gets fragmented so paged.js has natural break points
// (otherwise paged.js drops everything after a >1-page <pre>, or — with the
// keep-with-next wrapper — duplicates pages, cf. SPEC §13.3).
const PRE_SPLIT_TARGET_LINES = 35;
const PRE_SPLIT_SLACK_LINES = 8;

/**
 * Purpose: Heading underline CSS fragment for paged.js / print output.
 * How: Uses a neutral grey border-bottom to match the historical printed look.
 */
function pagedUnderline(s: Style): string {
  return s.underline
    ? `border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em;`
    : '';
}

/**
 * Purpose: Per-heading family + italic + weight + text-align for paged.js /
 *   print output. Keeps parity with the fluid preview's `headingExtras`.
 * How: Emits explicit `font-family` (when overridden), `font-style`,
 *   `font-weight`, `text-align`.
 */
function pagedHeadingExtras(s: Style): string {
  const fam =
    s.family !== undefined && s.family.trim() !== ''
      ? `font-family: ${quoteFontFamily(s.family)}; `
      : '';
  return `${fam}font-style: ${s.italic ? 'italic' : 'normal'}; font-weight: ${s.weight ?? 500}; text-align: ${s.align ?? 'left'};`;
}

/**
 * Purpose: Asymmetric vertical spacing for a heading style under paged.js.
 * How: Reads `marginAbove` / `marginBelow` from the heading's Style, mirroring
 *   the fluid preview's `headingMargin` helper.
 */
function pagedHeadingMargin(s: Style): string {
  return `margin: ${s.marginAbove ?? 1.6}em 0 ${s.marginBelow ?? 0.6}em;`;
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
 * Purpose: Drop the `<style>` elements paged.js injects into <head> on each
 *   render so a fresh paginate doesn't compose with stale rules from prior
 *   runs (otherwise e.g. a removed table-border declaration keeps applying).
 * How: paged.js tags its injected styles with a `data-pagedjs-inserted-styles`
 *   attribute — match it and remove every node.
 */
function purgePagedJsStyles(): void {
  for (const el of document.querySelectorAll(
    'style[data-pagedjs-inserted-styles]',
  )) {
    el.remove();
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
  purgePagedJsStyles();
  // Each `Previewer` instance is single-shot — calling preview() twice on
  // the same instance breaks. We create a fresh one per render, which is
  // cheap.
  const previewer = new Previewer();
  // In slides mode, group runs of adjacent figures into a flex row so
  // they sit side-by-side on a slide instead of forcing one per slide.
  groupAdjacentFiguresForSlides(source, settings);
  // Wrap consecutive sender / recipient blocks in a flex group so they
  // sit side-by-side (or a lone recipient floats right for FR letters).
  groupLetterheads(source);
  // In slides mode, compute the right zoom for every `demo zoom=auto`
  // block by measuring its natural height against the slide figure area.
  await applyAutoZoomForDemos(source, settings, renderTo);
  // Fragment any `<pre>` block taller than a page into contiguous chunks
  // so paged.js has natural break points. Without this, a single tall
  // <pre> either drops downstream content or triggers paged.js's
  // "blank page + duplicate" bug under keep-with-next (SPEC §13.3).
  splitLongPreBlocks(source, PRE_SPLIT_TARGET_LINES, PRE_SPLIT_SLACK_LINES);
  // Wrap each "label" (heading, or paragraph that introduces a block)
  // with its immediate next sibling so the pair gets a real
  // `break-inside: avoid` boundary. CSS `break-after: avoid` alone is
  // honoured inconsistently by paged.js when the next block is tall
  // (fenced code, math, mermaid, image, table); the wrapper is the
  // reliable fix.
  keepLabelsWithNext(source, settings.pageSize === 'SLIDES_16_9');
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
  groupAdjacentFiguresForSlides(source, settings);
  groupLetterheads(source);
  await applyAutoZoomForDemos(source, settings, renderTo);
  splitLongPreBlocks(source, PRE_SPLIT_TARGET_LINES, PRE_SPLIT_SLACK_LINES);
  keepLabelsWithNext(source, settings.pageSize === 'SLIDES_16_9');
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
 * Purpose: Whether an element should be treated as a "standalone figure"
 *   for layout grouping — figures, native diagram wraps (bda, category,
 *   chart, mermaid), and `<p>` wrappers around a sole `<img>`.
 */
function isFigureLike(el: Element): boolean {
  if (el.tagName === 'FIGURE') return true;
  if (el.tagName === 'DIV') {
    const c = el.classList;
    return (
      c.contains('bda-wrap') ||
      c.contains('category-wrap') ||
      c.contains('mermaid-block') ||
      c.contains('chart-block')
    );
  }
  if (el.tagName === 'P') {
    // Markdown's standalone image renders as `<p><img/></p>`.
    return el.childElementCount === 1 && el.firstElementChild?.tagName === 'IMG';
  }
  return false;
}

/**
 * Purpose: In slides mode, gather runs of adjacent figures into a row
 *   so several figures share one slide horizontally. The decision is
 *   conservative: we only group when the natural widths sum to ≤ the
 *   available slide width × `WIDTH_TOLERANCE` (~10%), so figures keep
 *   their original size or only shrink slightly. If natural sizes
 *   don't fit, figures stay stacked.
 * How: Walk top-level children. For each maximal run of N ≥ 2 adjacent
 *   figure-like siblings of the same caption shape (all captioned or
 *   all uncaptioned), check the natural-width budget. If it passes,
 *   wrap them in a `<div class="figure-row">` (sub-classed
 *   `-captioned` / `-uncaptioned`). The CSS layout — emitted by
 *   `slidesFigureCss` — uses CSS grid for the captioned case so:
 *     • images share a common vertical centerline (the tallest image
 *       sets the row height, others centered around it),
 *     • captions sit on a horizontal baseline beneath the image group.
 *   No-op outside slides mode.
 */
export function groupAdjacentFiguresForSlides(
  root: HTMLElement,
  settings: PdfSettings,
): void {
  if (settings.pageSize !== 'SLIDES_16_9') return;
  const sizeMm = pageSizeMm(settings);
  const m = settings.margins;
  const PX_PER_MM = 96 / 25.4;
  const slideContentPx = (sizeMm.w - m.left - m.right) * PX_PER_MM;
  const WIDTH_TOLERANCE = 1.1; // tolerate ~10% overflow (small scale-down)
  const COL_GAP_PX = 32; // matches the 2em column-gap in .figure-row CSS
  const children = Array.from(root.children);
  let i = 0;
  while (i < children.length) {
    if (!isFigureLike(children[i]!)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < children.length && isFigureLike(children[j]!)) j += 1;
    if (j - i >= 2) {
      const run = children.slice(i, j);
      const allCap = run.every(isCaptionedFigure);
      const allUncap = run.every((el) => !isCaptionedFigure(el));
      if (allCap || allUncap) {
        let totalW = 0;
        for (const el of run) totalW += figureNaturalWidthPx(el);
        totalW += COL_GAP_PX * (run.length - 1);
        if (totalW <= slideContentPx * WIDTH_TOLERANCE) {
          const doc = root.ownerDocument;
          const row = doc.createElement('div');
          row.className = `figure-row ${allCap ? 'figure-row-captioned' : 'figure-row-uncaptioned'}`;
          children[i]!.before(row);
          for (let k = i; k < j; k += 1) row.appendChild(children[k]!);
        }
      }
    }
    i = j;
  }
}

function isCaptionedFigure(el: Element): boolean {
  return el.tagName === 'FIGURE' && el.classList.contains('captioned');
}

/**
 * Purpose: True when a demo pane's content can wrap to a narrower
 *   column without losing information — i.e. it's prose (paragraphs,
 *   admonitions, definition lists, etc.) with no structural
 *   alignment that wrapping would destroy.
 *   Detection:
 *     - Primary: any descendant with class `block-rigid`. Renderers
 *       opt their output in by setting this class on their outer
 *       element — that's how custom blocks (`adt`, `bda`, `chart`,
 *       `category`, `mermaid`, `math-block`, `tree-svg-wrap`,
 *       `ebnf-block`, …) declare "I'm wrap-resistant".
 *     - Fallback for built-in markdown elements: `<pre>`, `<img>`,
 *       `<table>`, and block-level `<svg>` (i.e. any `<svg>` that
 *       isn't inside `.math-inline`).
 *   The caller caps wrappable panes at `W/2` so the text reflows
 *   inside its half of the slide instead of forcing a big uniform
 *   zoom or running off the slide.
 */
function isWrappablePane(pane: HTMLElement): boolean {
  if (pane.querySelector('.block-rigid, pre, img, table')) return false;
  for (const svg of pane.querySelectorAll('svg')) {
    if (!svg.closest('.math-inline')) return false;
  }
  return true;
}

/**
 * Purpose: Return the natural width of a demo pane in px, robust
 *   against the SVG quirks that collapse `scrollWidth` in a
 *   `max-content` grid track.
 * How: Take the max of three signals:
 *   - `pane.scrollWidth` (works for `<pre>`-based content);
 *   - the widest descendant SVG's *rendered* width — computed from
 *     viewBox aspect + the CSS `max-height` cap, so a chart with
 *     `viewBox="0 0 640 360"` capped at 200px height yields 356px,
 *     not 640 (intrinsic) and not the 0/~figcaption value
 *     `scrollWidth` returns when the SVG collapses;
 *   - the widest `<img>`'s `naturalWidth`.
 *   When all three are 0 we return 0 — the caller treats that as no
 *   constraint.
 */
function naturalPaneWidth(pane: HTMLElement): number {
  let w = pane.scrollWidth;
  // Block-level text containers: measure each with `width: max-content`
  // and read offsetWidth. Chrome's max-content algorithm for a pane
  // mixing text and block SVGs sometimes returns only the SVG's
  // intrinsic width — we want to also catch a long `<p>` next to it.
  const TEXT_TAGS = 'p, h1, h2, h3, h4, h5, h6, dt, dd, li, blockquote';
  for (const el of pane.querySelectorAll<HTMLElement>(TEXT_TAGS)) {
    const prev = el.style.width;
    el.style.width = 'max-content';
    if (el.offsetWidth > w) w = el.offsetWidth;
    el.style.width = prev;
  }
  for (const svg of pane.querySelectorAll<SVGSVGElement>('svg')) {
    let svgW = 0;
    let svgH = 0;
    let ratio = 0;
    const widthAttr = svg.getAttribute('width');
    if (widthAttr && !widthAttr.includes('%')) {
      const num = parseFloat(widthAttr);
      if (Number.isFinite(num) && num > 0) svgW = num;
    }
    const heightAttr = svg.getAttribute('height');
    if (heightAttr && !heightAttr.includes('%')) {
      const num = parseFloat(heightAttr);
      if (Number.isFinite(num) && num > 0) svgH = num;
    }
    const vb = svg.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(parseFloat);
      if (parts.length >= 4 && parts[2]! > 0 && parts[3]! > 0) {
        ratio = parts[2]! / parts[3]!;
        if (svgW === 0) svgW = parts[2]!;
        if (svgH === 0) svgH = parts[3]!;
      }
    }
    // Apply CSS max-height — the cap from `slidesFigureCss` typically
    // shrinks intrinsic 360 down to ~200, and at that point the width
    // derives from the aspect ratio (~356px for the chart's 1.78:1).
    if (ratio > 0) {
      const computedMaxH = parseFloat(getComputedStyle(svg).maxHeight);
      if (Number.isFinite(computedMaxH) && computedMaxH > 0 && svgH > computedMaxH) {
        svgH = computedMaxH;
        svgW = svgH * ratio;
      }
    }
    if (svgW > w) w = svgW;
  }
  for (const img of pane.querySelectorAll<HTMLImageElement>('img')) {
    if (img.naturalWidth > w) w = img.naturalWidth;
  }
  return w;
}

/**
 * Purpose: For every `.demo-block[data-auto-zoom]` in `root`, compute a
 *   zoom factor that makes the block fit the slide's figure area, and
 *   write it as inline `style="zoom: X"`. No-op outside slides mode.
 * How: Mount `root` offscreen *inside* `renderTo` (= `#preview-pane`) so
 *   the typography rules in `pagedCss` — which are scoped to
 *   `:where(#preview-pane, #markpage-print-target)` — apply at
 *   measurement time. The same rules are also injected as a temporary
 *   `<style>` so they're active before paged.js itself injects its copy.
 *   For each demo:
 *     1. Set inline `zoom: 1` (overrides the CSS default of 0.85). If
 *        the block already fits — no scrollHeight overflow and no
 *        descendant with scrollWidth > clientWidth — keep zoom = 1.
 *     2. Otherwise binary-search the [MIN_ZOOM, 1] interval for the
 *        largest zoom that fits. Empirical search beats a closed-form
 *        formula because the relationship between zoom and a grid
 *        cell's content fit is browser-dependent (Chrome's `zoom`
 *        reflows children, but exactly how much extra column width it
 *        buys depends on `min-width: 0`, gap, padding…).
 *     3. If even MIN_ZOOM overflows, accept the floor (better tiny
 *        than truncated).
 *
 * Why a pre-pagination pass and not pure CSS: CSS has no shrink-to-fit
 *   by height. `transform: scale` doesn't reflow; `zoom` needs a fixed
 *   value. The natural height is content-dependent (code line count,
 *   rendered SVG size, …) so it has to be measured per block.
 *
 * Why mount inside `renderTo` and not the body: the slide typography
 *   (code-block padding, `pre` font-size, h2 size, etc.) is scoped to
 *   `#preview-pane`. A body-level stage measures the source pane at
 *   browser-default `<pre>` size, returning ~3× too small, computing
 *   `z = 1`, and letting the demo overflow.
 *
 * Algorithm (per demo):
 *
 *   1. Measure each pane's natural width (w1, w2) and scroll-height
 *      (h1, h2) at zoom 1, first with `grid-template-columns:
 *      max-content max-content` for widths, then with explicit pixel
 *      tracks for heights (so the CSS `max-height` cap on SVGs is
 *      respected).
 *   2. Compute uniform zoom and pick a layout mode:
 *        - `halfV = (W − G_MIN_VISUAL) / 2`
 *        - **Spread mode** (each pane centred in its half) when both
 *          panes fit their half naturally — `wMax ≤ halfV` → `zW=1`.
 *          The gap absorbs any slack between the centred panes.
 *        - **Compact mode** when the wider pane forces a zoom — the
 *          panes sit adjacent with exactly `G_MIN_VISUAL` of gap and
 *          the whole demo is centred on the slide. Avoids the weird
 *          big gap that would otherwise appear when sizes are very
 *          asymmetric (e.g. wide LaTeX source + small math SVG).
 *          `zW = (W − G_MIN_VISUAL) / (w1 + w2)` here, with bleed
 *          when `zW < BLEED_THRESHOLD` and width is binding.
 *        - `zH = maxFigH / max(h1, h2)` if the taller pane exceeds
 *          the figure cap.
 *        - `z = min(zW, zH, 1)`, clamped to `MIN_ZOOM`.
 *   3. Lay out the demo as a 5-track grid (`padL w1 gap w2 padR`)
 *      with column-gap zeroed so the explicit gap track owns all
 *      the spacing.
 *   4. Set the grid row to `H/z` (= visual `H`) and rely on the
 *      `align-items: center` from `.demo-block` to centre each pane
 *      vertically inside that row.
 */
export async function applyAutoZoomForDemos(
  root: HTMLElement,
  settings: PdfSettings,
  renderTo: HTMLElement,
): Promise<void> {
  if (settings.pageSize !== 'SLIDES_16_9') return;
  const demos = root.querySelectorAll<HTMLElement>(
    '.demo-block[data-auto-zoom]',
  );
  if (demos.length === 0) return;
  const doc = root.ownerDocument;
  const sizeMm = pageSizeMm(settings);
  const m = settings.margins;
  const PX_PER_MM = 96 / 25.4;
  const MAX_FIG_HEIGHT_RATIO = 0.55;
  const widthMm = sizeMm.w - m.left - m.right;
  const widthPx = widthMm * PX_PER_MM;
  const maxHeightPx =
    (sizeMm.h - m.top - m.bottom) * MAX_FIG_HEIGHT_RATIO * PX_PER_MM;
  const MIN_ZOOM = 0.35;
  // Inject the same paginated-context CSS used by paged.js, so the
  // typography that will shape the final slide is also shaping our
  // measurement. Removed in `finally`.
  const styleEl = doc.createElement('style');
  styleEl.textContent = pagedCss(settings);
  doc.head.appendChild(styleEl);
  // Hidden offscreen stage, parented to renderTo so `:where(#preview-pane,…)`
  // selectors match. `visibility: hidden` (rather than display:none)
  // preserves layout — display:none zeros scrollHeight.
  const stage = doc.createElement('div');
  stage.style.cssText = [
    'position: absolute',
    'left: -99999px',
    'top: 0',
    `width: ${widthMm}mm`,
    'visibility: hidden',
    'pointer-events: none',
  ].join('; ');
  const origParent = root.parentNode;
  const origNext = root.nextSibling;
  renderTo.appendChild(stage);
  stage.appendChild(root);
  // Force a layout pass first — that causes the browser to request
  // any web fonts referenced by the injected pagedCss (Roboto
  // Condensed for the body, Roboto Mono for code, etc.). Without
  // this, `document.fonts.ready` resolves immediately because no
  // font load is pending yet, and we measure with fallback-font
  // metrics that don't match the actual render.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  stage.offsetHeight;
  if (doc.fonts && doc.fonts.ready) {
    await doc.fonts.ready;
  }
  try {
    // Below this zoom the text gets uncomfortably small — at that
    // point allowing the demo to bleed into the slide margins is the
    // better trade-off.
    const BLEED_THRESHOLD = 0.7;
    // Reserved visual gap between the two panes. The wider pane is
    // constrained to fit in `(W − G_MIN_VISUAL) / 2` instead of
    // `W/2`, so the panes never butt up against each other.
    const G_MIN_VISUAL = 24;
    const bleedMm = slidesDemoBleedMm(settings);
    const bleedRatio = (widthMm + bleedMm.left + bleedMm.right) / widthMm;
    for (const el of demos) {
      el.removeAttribute('data-auto-zoom');
      const captionedParent =
        el.parentElement !== null && isCaptionedFigure(el.parentElement)
          ? el.parentElement
          : null;
      const bleedTarget = captionedParent ?? el;
      // Reset everything we might have applied on a previous pass.
      bleedTarget.classList.remove('demo-bleed');
      el.classList.remove('demo-source-wrap');
      el.style.zoom = '';
      el.style.gridTemplateColumns = '';
      el.style.gridTemplateRows = '';
      el.style.columnGap = '';
      const panes = el.querySelectorAll<HTMLElement>('.demo-pane');
      for (const pane of panes) {
        pane.style.zoom = '';
        pane.style.gridColumn = '';
        pane.style.width = '';
      }
      if (panes.length < 2) continue;

      // ----- Detect wrappability. The rendered pane drives the
      // decision: if the rendered output is prose (no <pre>, <img>,
      // or block <svg>), the source markdown that produced it is
      // also prose-like and can wrap inside each logical line.
      // Otherwise the rendered side has code/diagrams and the
      // source has matching structural content that mustn't wrap.
      const renderedWrappable = isWrappablePane(panes[1]!);
      if (renderedWrappable) el.classList.add('demo-source-wrap');
      else el.classList.remove('demo-source-wrap');

      // ----- Step 1: measure natural pane widths. Setting
      // `width: max-content` directly on each pane is more reliable
      // than `grid-template-columns: max-content max-content`: for
      // panes mixing text and block SVGs (e.g. a `<p>` followed by
      // a MathJax `math-block`), the grid measurement can collapse
      // to the SVG's intrinsic width and miss the wider text.
      // `naturalPaneWidth` takes the max of the pane's scrollWidth
      // and any descendant SVG's viewBox/explicit width (to recover
      // chart/mermaid SVGs that collapse when sized by `width="100%"`
      // inside a shrink-to-fit container).
      el.style.zoom = '1';
      el.style.gridTemplateColumns = '';
      panes[0]!.style.width = 'max-content';
      panes[1]!.style.width = 'max-content';
      const w1Raw = naturalPaneWidth(panes[0]!);
      const w2Raw = naturalPaneWidth(panes[1]!);
      panes[0]!.style.width = '';
      panes[1]!.style.width = '';
      // Wrappable panes are capped at the effective half — the slide
      // half minus the minimum visual gap reservation — so their text
      // reflows inside its half of the slide instead of taking the
      // full paragraph's max-content width. Source and rendered share
      // the same wrappability decision (driven by the rendered side).
      const halfVisual = (widthPx - G_MIN_VISUAL) / 2;
      const w1 = renderedWrappable ? Math.min(w1Raw, halfVisual) : w1Raw;
      const w2 = renderedWrappable ? Math.min(w2Raw, halfVisual) : w2Raw;

      // ----- Step 2: re-measure heights with explicit pixel tracks
      // (`max-height` cap on SVGs is then respected, unlike
      // `max-content` sizing where the intrinsic viewBox height
      // leaks through).
      el.style.gridTemplateColumns = `${w1.toFixed(1)}px ${w2.toFixed(1)}px`;
      const h1 = panes[0]!.scrollHeight;
      const h2 = panes[1]!.scrollHeight;
      const naturalH = Math.max(h1, h2);

      // ----- Compute zoom + layout mode.
      const wMax = Math.max(w1, w2);
      const spread = wMax <= halfVisual; // both panes fit their half naturally
      const zH = naturalH > maxHeightPx ? maxHeightPx / naturalH : 1;
      let zW = 1;
      let effectiveW = widthPx;
      if (!spread) {
        // Compact mode: shrink so the natural sum + gap fits the
        // canvas. Bleed if that drops us below threshold and width
        // is the binding constraint.
        zW = (widthPx - G_MIN_VISUAL) / (w1 + w2);
        if (zW < BLEED_THRESHOLD && zW <= zH) {
          bleedTarget.classList.add('demo-bleed');
          effectiveW = widthPx * bleedRatio;
          zW = (effectiveW - G_MIN_VISUAL) / (w1 + w2);
        }
      }
      let z = Math.min(zW, zH, 1);
      if (z < MIN_ZOOM) z = MIN_ZOOM;

      // ----- Lay out the 5 tracks.
      const gapMinL = G_MIN_VISUAL / z;
      let padLeft: number;
      let padRight: number;
      let gapLayout: number;
      if (spread) {
        // Spread mode: each pane centred in its half (`halfL`).
        // Gap absorbs any slack between the centred halves.
        const halfL = halfVisual / z;
        padLeft = Math.max(0, halfL / 2 - w1 / 2);
        padRight = Math.max(0, halfL / 2 - w2 / 2);
        gapLayout = Math.max(0, halfL + gapMinL - (w1 + w2) / 2);
      } else {
        // Compact mode: panes adjacent with exactly G_MIN_VISUAL gap,
        // whole demo centred on the (bleed-aware) canvas.
        const demoNatural = w1 + w2 + gapMinL;
        const totalLayout = effectiveW / z;
        const sidePad = Math.max(0, (totalLayout - demoNatural) / 2);
        padLeft = sidePad;
        padRight = sidePad;
        gapLayout = gapMinL;
      }
      // Row height = H/z so that visual row height = H. align-items:
      // center (from .demo-block) then vertically centres each pane.
      const rowLayout = maxHeightPx / z;

      // ----- Apply.
      el.style.columnGap = '0';
      el.style.gridTemplateColumns =
        `${padLeft.toFixed(1)}px ${w1.toFixed(1)}px ${gapLayout.toFixed(1)}px ` +
        `${w2.toFixed(1)}px ${padRight.toFixed(1)}px`;
      el.style.gridTemplateRows = `${rowLayout.toFixed(1)}px`;
      panes[0]!.style.gridColumn = '2';
      panes[1]!.style.gridColumn = '4';
      el.style.zoom = z >= 1 ? '1' : z.toFixed(3);
    }
  } finally {
    if (origParent) {
      origParent.insertBefore(root, origNext);
    } else {
      root.remove();
    }
    stage.remove();
    styleEl.remove();
  }
}

/**
 * Purpose: Estimate a figure's natural rendered width in CSS px, so
 *   `groupAdjacentFiguresForSlides` can decide whether N figures fit
 *   side-by-side without significant scaling.
 * How: Prefer the SVG `width` attribute (BDA / category / mermaid /
 *   chart all emit explicit pixel widths). Fall back to `<img>`'s
 *   `naturalWidth` (may be 0 if the image hasn't loaded; we then use
 *   a small default that errs on the side of grouping).
 */
function figureNaturalWidthPx(el: Element): number {
  const svg = el.querySelector('svg');
  if (svg) {
    const w = svg.getAttribute('width');
    if (w !== null) {
      const n = parseFloat(w);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const img = el.querySelector('img');
  if (img instanceof HTMLImageElement && img.naturalWidth > 0) {
    return img.naturalWidth;
  }
  // Generous default — if we can't measure, lean toward grouping.
  return 200;
}

/**
 * Purpose: Wrap each "label" element with its next sibling so they can't be split.
 * How: Reverse-iterate elements; for each label, wrap (`<div class="keep-with-next">`).
 *   Skip when the next sibling is a letterhead-group: it already reserves
 *   its own vertical space via `min-height` and contains a
 *   `position: absolute` recipient whose containing block is the pagedjs
 *   pagebox. Wrapping in a `break-inside: avoid` div would turn the
 *   wrapper into a fragmentation context that becomes the new containing
 *   block for the absolute recipient, breaking the envelope-window
 *   coordinates (cf. SPEC §25.4).
 *
 *   In slides mode, skip h2 too. h2 carries `break-before: page` (per
 *   slidesBreakCss — each h2 starts a new slide). Wrapping it in a
 *   `break-inside: avoid` div produces conflicting break rules: the
 *   wrapper says "stay together" but the inner h2 says "split here".
 *   paged.js resolves this by splitting the wrapper into fragments —
 *   an empty stub on the current slide, the h2 alone on the next, and
 *   the trailing sibling on a third slide. Without the wrapper, the
 *   h2 simply starts a new slide and what follows fills the rest as
 *   long as it fits.
 */
export function keepLabelsWithNext(root: HTMLElement, inSlidesMode = false): void {
  const all = [...root.querySelectorAll<HTMLElement>('*')].reverse();
  for (const el of all) {
    if (!isLabel(el)) continue;
    if (inSlidesMode && el.tagName.toLowerCase() === 'h2') continue;
    const next = el.nextElementSibling;
    if (!next) continue;
    if (!el.parentElement) continue;
    if (next.classList.contains('letterhead-group')) continue;
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
  const styles = s.styles;
  const pageNumberRule = pageNumberCss(pn, styles['page-number']);
  // Per-element family overrides the trio; the trio is the fallback
  // when the matrix leaves `family` undefined.
  const bodyName = (styles.body.family ?? '').trim() || s.fonts.body;
  const codeName = (styles['code-inline'].family ?? '').trim() || s.fonts.code;
  const headingsFamily = fontFamilyChain(s.fonts.headings, 'sans');
  const bodyFamily = fontFamilyChain(bodyName, 'sans');
  const codeFamily = fontFamilyChain(codeName, 'mono');
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
      line-height: ${styles.body.lineHeight ?? 1.25};
      color: ${styles.body.color};
      ${styles.body.align ? `text-align: ${styles.body.align};` : ''}
    }

    ${SCOPE} :is(h1, h2, h3, h4, h5, h6) { font-family: ${headingsFamily}; }
    ${SCOPE} h1 { font-size: ${styles.h1.fontSize}pt; color: ${styles.h1.color}; ${pagedUnderline(styles.h1)} ${pagedHeadingExtras(styles.h1)} ${pagedHeadingMargin(styles.h1)} }
    ${SCOPE} h1.doc-title { font-size: ${styles.title.fontSize}pt; color: ${styles.title.color}; ${pagedUnderline(styles.title)} ${pagedHeadingExtras(styles.title)} ${pagedHeadingMargin(styles.title)} }
    ${SCOPE} h2 { font-size: ${styles.h2.fontSize}pt; color: ${styles.h2.color}; ${pagedUnderline(styles.h2)} ${pagedHeadingExtras(styles.h2)} ${pagedHeadingMargin(styles.h2)} }
    ${SCOPE} h3 { font-size: ${styles.h3.fontSize}pt; color: ${styles.h3.color}; ${pagedUnderline(styles.h3)} ${pagedHeadingExtras(styles.h3)} ${pagedHeadingMargin(styles.h3)} }
    ${SCOPE} h4, ${SCOPE} h5, ${SCOPE} h6 { font-size: ${styles.h4.fontSize}pt; color: ${styles.h4.color}; ${pagedUnderline(styles.h4)} ${pagedHeadingExtras(styles.h4)} ${pagedHeadingMargin(styles.h4)} }
    /* First heading on the page should never push the body content
       down — paged.js doesn't trim leading margins itself. */
    ${SCOPE} > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
    ${SCOPE} p { margin: ${styles.body.marginAbove ?? 1}em 0 ${styles.body.marginBelow ?? 1}em; }
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
      font-size: ${styles['code-inline'].fontSize}pt;
      color: ${styles['code-inline'].color};
    }
    /* Block code: <pre> wrapper + tree SVG + algorithm get the
       code-block style box plus per-element typography (overrides
       the code-inline rule above for <pre> specifically). */
    ${SCOPE} pre,
    ${SCOPE} .tree-svg-wrap,
    ${SCOPE} .algorithm { ${blockBoxCss(styles['code-block'])} ${inlineCss(styles['code-block'])} }

    /* Long-<pre> fragments emitted by splitLongPreBlocks (cf. pre-split.ts).
       Suppress the box seam between adjacent chunks so the multi-page
       render reads as a single continuous block. */
    ${SCOPE} pre.pre-chunk-first { margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; padding-bottom: 0; }
    ${SCOPE} pre.pre-chunk-middle { margin-top: 0; margin-bottom: 0; border-radius: 0; padding-top: 0; padding-bottom: 0; }
    ${SCOPE} pre.pre-chunk-last { margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; padding-top: 0; }

    ${SCOPE} blockquote {
      ${inlineCss(styles.quote)}
      ${blockBoxCss(styles.quote)}
      padding-left: ${styles.quote.padding ?? 0.9}em;
      margin: 0.6em 0;
      orphans: 3; widows: 3;
    }

    /* Metadata block (author / organization / date) shown after h1. */
    ${SCOPE} .preview-metadata { ${inlineCss(styles.metadata)} }
    /* Auto-numbered figure / algorithm / table / listing caption. */
    ${SCOPE} .caption { ${inlineCss(styles.caption)} }
    /* Inline links — color + underline from styles['inline-link']. */
    ${SCOPE} a { ${inlineCss(styles['inline-link'])} text-decoration: ${styles['inline-link'].underline ? 'underline' : 'none'}; }
    /* Block math, mermaid, admonitions, tables — user-configurable
       box + inline (align / margins). */
    ${SCOPE} .math-block { ${blockBoxCss(styles['math-block'])} ${inlineCss(styles['math-block'])} }
    ${SCOPE} .mermaid-block { ${blockBoxCss(styles.mermaid)} ${inlineCss(styles.mermaid)} }
    ${SCOPE} .admonition { ${blockBoxCss(styles.callout)} ${inlineCss(styles.callout)} }
    ${SCOPE} table { border-collapse: collapse; ${inlineCss(styles.table)} ${blockBoxCss(styles.table)} }

    /* Letterhead — sender / recipient blocks for invoices, devis,
       courriers. Adjacent siblings are wrapped in a .letterhead-group
       by groupLetterheads() so the sender + an in-flow ('flow')
       recipient lay out side-by-side. The default recipient is
       window-positioned (absolute, calibrated for FR DL envelope
       window) and lives outside the flex flow. */
    ${SCOPE} .letterhead-group {
      display: flex;
      gap: 4mm;
      align-items: flex-start;
      margin: 0 0 1.4em;
      break-inside: avoid;
    }
    ${SCOPE} .letterhead {
      flex: 0 1 calc(50% - 2mm);
      line-height: 1.4;
    }
    /* 'recipient flow' opt-out — keeps the recipient in normal flex
       flow as the right column, matching the pre-window default. */
    ${SCOPE} .letterhead-recipient.letterhead-flow {
      margin-left: auto;
    }
    /* Signature block — right-aligned (margin-left: auto inside its flex
       group), with extra top margin to separate it from the closing
       salutation, and a defensive break-inside: avoid in case the group's
       own protection is bypassed (single-child groups still get the rule
       via .letterhead-group).
       position: relative + flex: 0 0 auto so the block sizes itself to
       the image (when there is one) — the caption is positioned absolute
       inside this rectangle (bottom-left), see .letterhead-signature-
       caption below. Without an image, the renderer falls back to plain
       br-joined text and the position rules are inert. */
    ${SCOPE} .letterhead-signature {
      position: relative;
      flex: 0 0 auto;
      margin-left: 50%;
      margin-top: 2em;
      break-inside: avoid;
    }
    /* Signature image: cap at 25 % of the page's usable width and 30 mm
       tall. Without this an A4-scanned signature (typically 100+ mm
       across at native size) would dwarf the rest of the letter. The
       existing img rule keeps display:block + object-fit:contain, so
       width/height auto-scale together to preserve aspect ratio. */
    ${SCOPE} .letterhead-signature img {
      max-width: ${(sizeMm.w - m.left - m.right) / 4}mm;
      max-height: 30mm;
    }
    /* Caption overlaid at the bottom-left of the image rectangle (the
       whole signature block sits at 50 % from the left margin via the
       .letterhead-signature rule above — same horizontal anchor as the
       in-flow recipient — so the caption inherits that horizontal
       offset and only needs left: 0 inside the wrapper).
       white-space: nowrap stops narrow signatures from word-wrapping
       each line — explicit <br> between caption lines is preserved.
       The renderer only emits .letterhead-signature-caption when there
       is at least one image line in the fence — so the absolute element
       always has the image as its sibling defining the wrapper's box. */
    ${SCOPE} .letterhead-signature-caption {
      position: absolute;
      bottom: 0;
      left: 0;
      white-space: nowrap;
      line-height: 1.2;
    }
    /* Default for recipient in window mode: absolute position calibrated
       for the FR DL envelope window (110x220 mm, fold in Z). The norm:
       left edge of the address at 110 mm from the A4 edge, top edge at
       40 mm. Coordinates resolve against .pagedjs_page_content (paged.js
       positions it as relative natively), so we subtract the profile
       margins to land at the right absolute spot. */
    ${SCOPE} .letterhead-recipient.letterhead-window {
      position: absolute;
      left: ${Math.max(0, 110 - m.left)}mm;
      top: ${Math.max(0, 40 - m.top)}mm;
      width: 85mm;
      margin: 0;
      flex: none;
    }
    /* The window recipient is out of flow, so the group height is
       driven by the sender alone. Following content would flow over
       the recipient — we reserve 70 mm, enough for ~6 address lines
       plus the 15 mm top offset of the window position.
       display: block (instead of flex inherited from .letterhead-
       group): per CSS Flex L1, a flex container is the containing
       block of its absolutely-positioned children even when it is
       itself static-positioned. With flex we'd see the recipient
       anchor on the group (whose top depends on whatever precedes it
       in the source), not on the page. block side-steps that. */
    ${SCOPE} .letterhead-group--window {
      display: block;
      min-height: 70mm;
    }
    /* Without flex, the sender would default to 100 % width. Constrain
       it explicitly so it can never extend past the recipient's left
       edge (110 mm). */
    ${SCOPE} .letterhead-group--window > .letterhead-sender {
      width: calc(50% - 2mm);
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
    ${slidesBreakCss(s)}
    ${slidesFigureCss(s)}
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
 * Purpose: When the page format is `SLIDES_16_9`, every `## h2` starts
 *   its own slide. The first h2 in the doc still gets a forced break
 *   too — that pushes it to page 2, leaving the title/metadata block
 *   alone on page 1 (a Beamer-style title slide).
 * How: Bare `h2 { break-before: page }`. Targeting the h2 directly
 *   matters because `keepLabelsWithNext` wraps each label with its
 *   next sibling, so the h2 is no longer a direct sibling of the
 *   previous element (a more specific `* + h2` rule wouldn't match
 *   anymore). The break-before fires at the h2's position; the
 *   wrapper effectively starts on the new page (h2 is its first
 *   child), and the wrapper's own `break-inside: avoid` keeps the
 *   slide title with its first paragraph from there.
 *   Left unscoped because paged.js can't parse `:where(...)` in
 *   break-rule selectors, and break-* is inert outside a paginated
 *   context.
 */
function slidesBreakCss(s: PdfSettings): string {
  if (s.pageSize !== 'SLIDES_16_9') return '';
  return `h2 { break-before: page; }`;
}

/**
 * Purpose: In slides mode, cap the height of every figure (BDA / category
 *   / mermaid SVG, plain `<img>`) so a slide title + a short paragraph +
 *   the figure can all fit together on one slide. Without this, paged.js
 *   pushes the figure to its own slide whenever the natural figure
 *   height exceeds the remaining space, leaving an H2-only orphan slide
 *   before it.
 * How: max-height = (slide content area) × `MAX_FIG_HEIGHT_RATIO`, in mm.
 *   The ratio leaves room for the title, caption, and a few lines of
 *   description.
 */
function slidesFigureCss(s: PdfSettings): string {
  if (s.pageSize !== 'SLIDES_16_9') return '';
  const sizeMm = pageSizeMm(s);
  const m = s.margins;
  const MAX_FIG_HEIGHT_RATIO = 0.55;
  const maxH = (sizeMm.h - m.top - m.bottom) * MAX_FIG_HEIGHT_RATIO;
  const SCOPE = ':where(#preview-pane, #markpage-print-target)';
  return `
    ${SCOPE} .bda-svg,
    ${SCOPE} .category-svg,
    ${SCOPE} .mermaid-block svg,
    ${SCOPE} .chart-svg,
    ${SCOPE} img {
      max-height: ${maxH}mm;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    /* Side-by-side figures, captioned variant: CSS grid with two rows.
       Row 1 holds the figure bodies (images), row 2 holds the captions.
       Every body is in row 1 aligned center — all images share a
       common vertical centerline, the tallest one sets the row height.
       Every caption is in row 2 aligned start — all captions share a
       horizontal baseline beneath the image group. Columns are sized
       to each figure's natural content via grid-auto-columns max-content.
       display:contents on the figure lets its children participate
       directly in the grid. */
    ${SCOPE} .figure-row-captioned {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      grid-template-rows: max-content auto;
      justify-content: center;
      column-gap: 2em;
      row-gap: 0.5em;
      break-inside: avoid;
      margin: 0.6em 0;
    }
    /* Code listings inside a figure-row need to wrap so they fit
       their column. Without this, long lines force horizontal overflow. */
    ${SCOPE} .figure-row-captioned > figure.captioned > pre {
      white-space: pre-wrap;
      overflow-wrap: break-word;
      margin: 0;
      max-width: 100%;
    }
    ${SCOPE} .figure-row-captioned > figure.captioned {
      display: contents;
    }
    ${SCOPE} .figure-row-captioned > figure.captioned > :is(.bda-wrap, .category-wrap, .mermaid-block, .chart-block) {
      grid-row: 1;
      align-self: center;
      justify-self: center;
      margin: 0;
    }
    ${SCOPE} .figure-row-captioned > figure.captioned > figcaption {
      grid-row: 2;
      align-self: start;
      justify-self: center;
      margin: 0;
    }

    /* Side-by-side figures, uncaptioned variant — simple flex row,
       images vertically centered, natural sizes preserved. */
    ${SCOPE} .figure-row-uncaptioned {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 2em;
      break-inside: avoid;
      margin: 0.6em 0;
    }
    ${SCOPE} .figure-row-uncaptioned > * {
      margin: 0;
    }

    /* Opt-in bleed for demo blocks that can't fit at a readable zoom
       inside the standard text gutters. The class is added by
       applyAutoZoomForDemos only when the binary search would
       otherwise settle below BLEED_THRESHOLD. For captioned demos the
       class lives on the figure wrapper so the caption stays centred
       under the (now wider) block. */
    ${SCOPE} figure.captioned.demo-bleed,
    ${SCOPE} .demo-block.demo-bleed {
      margin-left: -${slidesDemoBleedMm(s).left}mm;
      margin-right: -${slidesDemoBleedMm(s).right}mm;
    }
  `;
}

/**
 * Purpose: Compute the negative-margin bleed a `.demo-bleed` block uses
 *   to widen past the slide's text gutters. Leaves a 5 mm safety zone
 *   so the demo never quite touches the slide edge.
 */
function slidesDemoBleedMm(s: PdfSettings): { left: number; right: number } {
  const SAFETY_MM = 5;
  return {
    left: Math.max(0, s.margins.left - SAFETY_MM),
    right: Math.max(0, s.margins.right - SAFETY_MM),
  };
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
    case 'SLIDES_16_9':
      // 16:9 landscape sized to A4 width — 210mm × (210 × 9/16) = 210 × 118.125 mm.
      // Anchoring the width to A4 keeps the typography from looking tiny:
      // a body font tuned for an A4 portrait page (the common case) fills
      // a slide of the same width comfortably without retuning.
      return { w: 210, h: 118.125 };
  }
}

/**
 * Purpose: Translate the PageNumber position + style into a `@<corner>` rule.
 * How: Emits `content: counter(page)` with font styling, or "" when `none`.
 */
function pageNumberCss(
  pn: PdfSettings['pageNumber'],
  style: Style,
): string {
  if (pn.position === 'none') return '';
  const [, hSide] = pn.position.split('-') as [
    'top' | 'bottom',
    'left' | 'center' | 'right',
  ];
  const vSide = pn.position.startsWith('top') ? 'top' : 'bottom';
  const at = `@${vSide}-${hSide}`;
  return `
    ${at} {
      content: counter(page);
      ${style.family !== undefined && style.family.trim() !== '' ? `font-family: ${quoteFontFamily(style.family)};` : ''}
      ${style.fontSize !== undefined ? `font-size: ${style.fontSize}pt;` : ''}
      ${style.color !== undefined ? `color: ${style.color};` : ''}
      ${style.weight !== undefined ? `font-weight: ${style.weight};` : ''}
      ${style.italic ? 'font-style: italic;' : ''}
      ${style.underline ? 'text-decoration: underline;' : ''}
    }
  `;
}
