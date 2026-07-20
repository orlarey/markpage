/**************************** preview-paginated.ts *****************************
 *
 * Purpose: Paginated A4/slides preview and print pages, rendered with
 *   Vivliostyle Core (paged.js was removed on this branch — its content
 *   passes that remain engine-neutral live on: atomic fitting, TOC links,
 *   letterheads, running sections, page CSS generation).
 * How: `paginateWithVivliostyle` is the single pipeline, used by both the
 *   on-screen preview (`paginate`) and the print/PDF export (`paginateOnce`).
 *
 *******************************************************************************/

import type { PdfSettings, Style } from './settings';
import { blockBoxCss, inlineCss } from './style-emit';
import {
  quoteFontFamily,
  loadSettingsFonts,
  settingsFontFamilies,
} from './font-loader';
import {
  groupLetterheads,
  letterheadCss,
  applyPageRunningRuns,
  prependDefaultFences,
  resetPageRunningCounter,
  paginationCss,
  fitAtomicBlocks,
  type AtomicPageGeometryPx,
} from '@orlarey/markpage-render';
import {
  computeCanonicalMargins,
  measureAverageCharWidth,
  type CanonicalMargins,
} from './typography';

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

/**
 * Purpose: Force-load every effective document font and wait
 *   until the actual font files are usable, so paged.js measures with the final
 *   metrics rather than a fallback it would have to re-flow away from.
 * How: `loadSettingsFonts` injects Google stylesheets for the global trio and
 *   every per-element family override, and awaits their files. That
 *   short-circuits for bundled (@fontsource) families, so we also call
 *   `document.fonts.load(...)` per family — that both *requests* the face (which
 *   `document.fonts.ready` would not, when nothing on screen uses it yet) and
 *   resolves once it is ready to measure. Best-effort: a bad/typo family name
 *   must not stall pagination.
 */
async function ensureSettingsFontsLoaded(settings: PdfSettings): Promise<void> {
  try {
    await loadSettingsFonts(settings);
  } catch {
    /* best-effort */
  }
  if (!document.fonts || typeof document.fonts.load !== 'function') return;
  const families = settingsFontFamilies(settings);
  await Promise.all(
    families.flatMap((f) =>
      ['400', '500'].map((w) =>
        document.fonts.load(`${w} 16px ${quoteFontFamily(f)}`).catch(() => []),
      ),
    ),
  ).catch(() => []);
  // Catch-all for any other face the document pulls in (custom fonts, the code
  // family, inline `::: style` font overrides) now that we've kicked their loads.
  if (document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Purpose: Preserve paragraph adjacency through paged.js's block rewriting.
 * How: Mark each paragraph whose previous element sibling is another paragraph
 *   before pagination; the class survives copying and page fragmentation.
 */
export function markConsecutiveParagraphs(root: HTMLElement): void {
  for (const paragraph of root.querySelectorAll('p')) {
    paragraph.classList.toggle(
      'mp-paragraph-continuation',
      paragraph.previousElementSibling?.tagName === 'P',
    );
  }
}

/**
 * Purpose: The full Vivliostyle pipeline, shared verbatim by the on-screen
 *   preview and the print/PDF export so both produce the same pages.
 * How: The engine-neutral content passes (TOC links, paragraph adjacency,
 *   letterheads, oversized-atomic fitting, default header/footer fences +
 *   section running CSS), then hand the clean DOM to Vivliostyle. Returns the
 *   page count.
 */
export async function paginateWithVivliostyle(
  source: HTMLElement,
  settings: PdfSettings,
  renderTo: HTMLElement,
): Promise<number> {
  // The derived (Van de Graaf) margins are computed from a DOM measurement of
  // the body font's average character width — with fallback metrics the
  // measure runs ~16% wide and every derived margin shrinks. Wait for the real
  // fonts BEFORE pagedCss() measures (the paged.js pipeline did this too).
  await ensureSettingsFontsLoaded(settings);
  linkTocPlus(source);
  markConsecutiveParagraphs(source);
  groupLetterheads(source);
  // Oversized atomic blocks (a mermaid/math/figure taller than the page's
  // content box) are unbreakable AND unplaceable: Vivliostyle paints them
  // past the page edge — the diagram appears missing and the page half
  // blank. Engine-neutral: scale down / dedicate a page, never fragment.
  await fitOversizedAtomicBlocks(source, settings, renderTo);
  resetPageRunningCounter();
  prependDefaultFences(source, settings);
  const runningCss = applyPageRunningRuns(source, { duplex: settings.duplex });
  const { renderVivliostylePreview } = await import('./preview-vivliostyle');
  return renderVivliostylePreview(
    source,
    `${pagedCss(settings)}\n${runningCss}`,
    renderTo,
  );
}

/**
 * Purpose: Render the paginated preview (Vivliostyle engine).
 * How: Delegate to the shared paginateWithVivliostyle pipeline — the same one
 *   the print/PDF export uses, so screen and paper cannot diverge.
 */
export async function paginate(
  source: HTMLElement,
  settings: PdfSettings,
  renderTo: HTMLElement,
): Promise<void> {
  renderTo.classList.toggle('duplex', settings.duplex);
  const pages = await paginateWithVivliostyle(source, settings, renderTo);
  console.info(`[markpage] vivliostyle: ${pages} page(s)`);
}

/**
 * Purpose: One-shot pagination for the print/PDF export target.
 * How: Same Vivliostyle pipeline as the preview; returns a no-op teardown to
 *   keep the historical call contract (paged.js needed ResizeObserver
 *   disconnection; Vivliostyle's frozen output does not).
 */
export async function paginateOnce(
  source: HTMLElement,
  settings: PdfSettings,
  renderTo: HTMLElement,
): Promise<() => void> {
  await paginateWithVivliostyle(source, settings, renderTo);
  return () => {};
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

// keepLabelsWithNext() + its isLabel/isPresentableBlock helpers now live in
// @orlarey/markpage-render (shared with the VS Code extension); imported above.

const PX_PER_MM = 96 / 25.4;
const ATOMIC_TRIM_SAFETY_MM = 3;

/** Geometry of the normal text rectangle and the physical page, in CSS px. */
function atomicPageGeometryPx(settings: PdfSettings): AtomicPageGeometryPx {
  const page = pageSizeMm(settings);
  const bodyName =
    (settings.styles.body.family ?? '').trim() || settings.fonts.body;
  const textCanon =
    settings.marginMode === 'derived'
      ? centerCanonicalHorizontally(
          computeCanonicalMargins(
            page.w,
            page.h,
            settings.measureChars,
            measureAverageCharWidth(
              bodyName,
              settings.styles.body.fontSize ?? 11,
            ),
          ),
          settings.duplex,
        )
      : null;
  const leftRecto = textCanon?.inner ?? settings.margins.left;
  const leftVerso = settings.duplex
    ? (textCanon?.outer ?? settings.margins.right)
    : leftRecto;
  const top = textCanon?.top ?? settings.margins.top;
  const textWidth =
    textCanon?.width ??
    Math.max(1, page.w - settings.margins.left - settings.margins.right);
  const textHeight =
    textCanon?.height ??
    Math.max(1, page.h - settings.margins.top - settings.margins.bottom);
  return {
    textWidth: textWidth * PX_PER_MM,
    textHeight: textHeight * PX_PER_MM,
    pageWidth: page.w * PX_PER_MM,
    pageHeight: page.h * PX_PER_MM,
    textLeftRecto: leftRecto * PX_PER_MM,
    textLeftVerso: leftVerso * PX_PER_MM,
    textTop: top * PX_PER_MM,
    safety: ATOMIC_TRIM_SAFETY_MM * PX_PER_MM,
  };
}

/** Wait for images that participate in an atomic measurement, best effort. */
async function waitForAtomicImages(root: HTMLElement): Promise<void> {
  await Promise.all(
    [...root.querySelectorAll<HTMLImageElement>('img')].map(async (img) => {
      if (img.complete) return;
      try {
        await img.decode();
      } catch {
        // Broken images remain visible as their browser fallback; measure that.
      }
    }),
  );
}

/**
 * Measure and fit semantic atomic objects before paged.js sees the source.
 * The offscreen stage uses the exact text width and paginated CSS, so the
 * decision includes final fonts, captions, padding and borders.
 */
async function fitOversizedAtomicBlocks(
  source: HTMLElement,
  settings: PdfSettings,
  renderTo: HTMLElement,
): Promise<void> {
  const geometry = atomicPageGeometryPx(settings);
  const doc = source.ownerDocument;
  const styleEl = doc.createElement('style');
  styleEl.textContent = pagedCss(settings);
  doc.head.appendChild(styleEl);

  const stage = doc.createElement('div');
  stage.style.cssText = [
    'position: absolute',
    'left: -99999px',
    'top: 0',
    `width: ${geometry.textWidth}px`,
    'visibility: hidden',
    'pointer-events: none',
  ].join('; ');
  const originalParent = source.parentNode;
  const originalNext = source.nextSibling;
  renderTo.appendChild(stage);
  stage.appendChild(source);
  try {
    await ensureSettingsFontsLoaded(settings);
    await waitForAtomicImages(source);
    // Force style/layout resolution after fonts and images have settled.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    stage.offsetHeight;
    fitAtomicBlocks(source, geometry, {
      onWarning: ({ element, scale, mode }) => {
        if (scale >= 0.999) return;
        console.warn(
          `[markpage] Atomic ${element.tagName.toLowerCase()} reduced to ` +
            `${Math.round(scale * 100)}% (${mode === 'page' ? 'margin-borrowing page' : 'text area'}).`,
        );
      },
    });
  } finally {
    if (originalParent) {
      if (originalNext) originalParent.insertBefore(source, originalNext);
      else originalParent.appendChild(source);
    } else {
      source.remove();
    }
    stage.remove();
    styleEl.remove();
  }
}

function linkTocPlus(root: HTMLElement): void {
  const navs = root.querySelectorAll<HTMLElement>('nav.toc-plus');
  if (navs.length === 0) return;
  const byTitle = new Map<string, string>();
  root
    .querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
    .forEach((h) => {
      const slug = sectionSlug(h.textContent ?? '');
      if (slug === '') return;
      if (h.id === '') h.id = `sec-${slug}`;
      if (!byTitle.has(slug)) byTitle.set(slug, h.id);
    });
  navs.forEach((nav) => {
    nav.querySelectorAll<HTMLAnchorElement>('a[data-toc-title]').forEach((a) => {
      const id = byTitle.get(sectionSlug(a.dataset['tocTitle'] ?? ''));
      if (id !== undefined) {
        a.setAttribute('href', `#${id}`);
        a.classList.remove('toc-missing');
      } else {
        a.removeAttribute('href');
        a.classList.add('toc-missing');
      }
    });
  });
}

/**
 * Purpose: Normalise a heading / TOC title to a comparison + anchor slug.
 * How: drop `\label{}`, strip a leading section number ("1.", "2.3 "), fold
 *   accents, lowercase, collapse non-alphanumerics to single hyphens.
 */
function sectionSlug(text: string): string {
  return text
    .replace(/\\label\{[^}\n]*\}/g, ' ')
    .replace(/^\s*\d+(?:\.\d+)*\.?\s+/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}


/**
 * Purpose: Build the @page rules + minimal fragmentation policy from user settings.
 * How: Template literal scoped to `#preview-pane` / `#markpage-print-target`.
 */
export function pagedCss(s: PdfSettings): string {
  const sizeMm = pageSizeMm(s);
  const m = s.margins;
  const styles = s.styles;
  // Running-content typography reaches all six @top-* / @bottom-*
  // boxes — header, footer, and (since v0.16) the page counter too,
  // which is just another running content slot now that the dedicated
  // pageNumber setting is gone.
  const runningContentRule = runningContentCss(styles['running-content']);
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
  // The `::: toc+` rules must out-rank the id-scoped link colour
  // (`#preview-pane a` in style.css), so they use `:is(...)` — same two
  // roots, but id-level specificity — instead of the zero-specificity
  // `:where(...)`. NOTE: the page-number rule (target-counter) can't use
  // :is()/:where(): paged.js's TargetCounters handler splits the selector
  // on ":", which corrupts those functions — it uses a bare id list.
  const TOC = ':is(#preview-pane, #markpage-print-target)';
  // §9.6 — when `marginMode === 'derived'`, the four margins come from
  // the Van de Graaf canon: text block similar to the page, corners on
  // the construction diagonals, ratios inner:outer = 1:2 and top:bottom
  // = 1:2. Otherwise (manual mode) the user's `margins.*` sliders are
  // authoritative.
  //
  // The canonical model expresses margins in {top, bottom, inner, outer}
  // (spine-aware) rather than CSS-absolute {top, right, bottom, left}.
  // In manual mode we re-label `margins.left` as inner and
  // `margins.right` as outer — same convention as §9.5.2 for duplex.
  // This is purely cosmetic in simplex (no spine, no swap), and it lets
  // the rest of the code branch on a single shape regardless of mode.
  const bodyFontSizePt = styles.body.fontSize ?? 11;
  // §9.6 derived geometry: TWO canonical rectangles on the same
  // diagonals.
  //   - text block: tighter, holds the actual prose;
  //   - live area:  enclosing rectangle (with width = liveAreaChars ×
  //                 charWidth) that also hosts the header / footer
  //                 bands and the inner / outer gutters.
  // The @page margin = LIVE AREA margins (= canonical blanks). The
  // body content area becomes the live area, and we add internal
  // padding on `.pagedjs_page_content` to push the actual text back
  // to text-block dimensions — that padding *is* the header band /
  // footer band / gutters of §9.6.4.
  const textBlockCanon =
    s.marginMode === 'derived'
      ? centerCanonicalHorizontally(
          computeCanonicalMargins(
            sizeMm.w,
            sizeMm.h,
            s.measureChars,
            measureAverageCharWidth(bodyName, bodyFontSizePt),
          ),
          s.duplex,
        )
      : null;
  const liveAreaCanon =
    s.marginMode === 'derived'
      ? centerCanonicalHorizontally(
          computeCanonicalMargins(
            sizeMm.w,
            sizeMm.h,
            s.liveAreaChars,
            measureAverageCharWidth(bodyName, bodyFontSizePt),
          ),
          s.duplex,
        )
      : null;
  // In derived mode, vertical margins (top / bottom) come from the text
  // block and horizontal margins from the live area. Horizontal geometry is
  // centred in simplex; the classical inner/outer asymmetry is kept only for
  // duplex spreads. This puts the @top-* / @bottom-* boxes inside the
  // header / footer BANDS of the canon (§9.6.6) rather than the
  // canonical blank zone above / below them. The author-supplied header
  // / footer text is then pushed to the inside edge of the box (via
  // `align-items: flex-end` for @top-* and `flex-start` for @bottom-*
  // below) so it visually sits in the live area, not in the blank
  // page-edge zone. In manual mode, behave exactly as before: the
  // user's four sliders are authoritative.
  const effMargins =
    textBlockCanon !== null && liveAreaCanon !== null
      ? {
          top: textBlockCanon.top,
          bottom: textBlockCanon.bottom,
          inner: liveAreaCanon.inner,
          outer: liveAreaCanon.outer,
        }
      : {
          top: m.top,
          bottom: m.bottom,
          inner: m.left,
          outer: m.right,
        };
  // §9.5.2 — when duplex is on, the inner margin (binding) stays
  // physically on the spine side of the open book. On recto (@page
  // :right), inner = LEFT and outer = RIGHT; on verso (@page :left)
  // they swap. CSS margin shorthand is `top right bottom left`.
  const rectoMargin = `margin: ${effMargins.top}mm ${effMargins.outer}mm ${effMargins.bottom}mm ${effMargins.inner}mm;`;
  const versoMargin = `margin: ${effMargins.top}mm ${effMargins.inner}mm ${effMargins.bottom}mm ${effMargins.outer}mm;`;
  const pageRule = s.duplex
    ? `
    @page {
      size: ${sizeMm.w}mm ${sizeMm.h}mm;
    }
    @page :right { ${rectoMargin} }
    @page :left  { ${versoMargin} }`
    : `
    @page {
      size: ${sizeMm.w}mm ${sizeMm.h}mm;
      ${rectoMargin}
    }`;

  // §9.6.4 — body padding inside the live area to recover the
  // text-block dimensions. Each side's padding equals the canonical
  // band height between the two nested rectangles:
  //   header band   = textBlock.top   − liveArea.top
  //   footer band   = textBlock.bottom − liveArea.bottom
  //   inner gutter  = textBlock.inner  − liveArea.inner  (recto: left)
  //   outer gutter  = textBlock.outer  − liveArea.outer  (recto: right)
  // The body padding is applied on `.pagedjs_page_content`, scoped
  // to the page parity classes paged.js sets. In duplex on a verso
  // the inner/outer paddings swap, mirroring the margin swap above.
  const bodyPaddingRule =
    textBlockCanon !== null && liveAreaCanon !== null
      ? buildBodyPaddingCss(SCOPE, textBlockCanon, liveAreaCanon, s.duplex)
      : '';

  // §9.7 — sidenote rendering (notes.position === 'side'). The
  // footnoteRef renderer always emits `<sup class="footnote-ref">` +
  // `<span class="sidenote">body</span>` adjacent to each `[^id]`
  // anchor. The CSS below decides which of the two is visible:
  //   - default (foot / end): hide every .sidenote; the section.footnotes
  //     at the document tail keeps the conventional rendering.
  //   - side: hide section.footnotes AND the .footnote-ref superscript;
  //     position .sidenote absolutely in the outer gutter so it sits at
  //     the line of its anchor. Requires derived mode to know the outer
  //     gutter width — degrades silently in manual mode (sidenotes
  //     still hidden, footnote section visible).
  const sidenoteRule = buildSidenoteCss(
    SCOPE,
    s.notes.position,
    textBlockCanon,
    liveAreaCanon,
    s.duplex,
  );
  // §9.6.6 — in derived mode the @top-* / @bottom-* margin boxes are
  // taller than the canonical-blank zone (the @page margin is set to
  // the TEXT BLOCK top / bottom, not the live area). We want the
  // running content to sit at the LIVE AREA edge:
  //   - header: at the TOP of the live area (just inside its top edge)
  //   - footer: at the BOTTOM of the live area (just inside its
  //     bottom edge)
  // The canonical blank zones (live_LA.top above the header / live_LA.
  // bottom below the footer) become symmetric breathing room toward
  // the page edges, and the header / footer BANDS become breathing
  // room toward the body text. paged.js uses flex inside each margin
  // box, so we combine `align-items` with `padding` to place the inner
  // `.pagedjs_margin-content` precisely:
  //   - @top-*    : align-items: flex-start; padding-top:    live_LA.top
  //   - @bottom-* : align-items: flex-end;   padding-bottom: live_LA.bottom
  // NOTE on specificity: paged.js's polisher base.js ships
  //   `.pagedjs_pagebox .pagedjs_margin-bottom-center { align-items: center; }`
  // with specificity (0,2,0). To override `align-items` (centred by
  // default) we MUST match that specificity. `:where(...)` contributes
  // 0 to specificity by design; the `.pagedjs_pagebox` prefix adds the
  // second class we need. `:is(...)` contributes the max specificity
  // of its arguments (= 0,1,0 for class lists), so the total here is
  // (0,2,0) — equal to paged.js's, and our rules come later in the
  // cascade so they win.
  const marginBoxAlignRule =
    textBlockCanon !== null && liveAreaCanon !== null
      ? `
    ${SCOPE} .pagedjs_pagebox :is(.pagedjs_margin-top-left, .pagedjs_margin-top-center, .pagedjs_margin-top-right,
        .pagedjs_margin-top-left-corner, .pagedjs_margin-top-right-corner) {
      align-items: flex-start;
      padding-top: ${liveAreaCanon.top}mm;
    }
    ${SCOPE} .pagedjs_pagebox :is(.pagedjs_margin-bottom-left, .pagedjs_margin-bottom-center, .pagedjs_margin-bottom-right,
        .pagedjs_margin-bottom-left-corner, .pagedjs_margin-bottom-right-corner) {
      align-items: flex-end;
      padding-bottom: ${liveAreaCanon.bottom}mm;
    }`
      : '';
  // CSS custom properties exposing the canonical geometry so the
  // debug-guides overlay (style.css, gated on `.debug-layout`) can
  // draw the live-area and text-block outlines as pseudo-elements on
  // `.pagedjs_page` / `.pagedjs_page_content` without re-deriving the
  // values. Set on both the on-screen pane and the print target so the
  // same rules light up in either container. In manual mode there is
  // no canonical decomposition: live area = text block = user margins,
  // and the gutters collapse to zero.
  const eff = effMargins;
  const gutInner =
    textBlockCanon !== null && liveAreaCanon !== null
      ? Math.max(0, textBlockCanon.inner - liveAreaCanon.inner)
      : 0;
  const gutOuter =
    textBlockCanon !== null && liveAreaCanon !== null
      ? Math.max(0, textBlockCanon.outer - liveAreaCanon.outer)
      : 0;
  const liveTop = liveAreaCanon?.top ?? eff.top;
  const liveBottom = liveAreaCanon?.bottom ?? eff.bottom;
  const liveInner = liveAreaCanon?.inner ?? eff.inner;
  const liveOuter = liveAreaCanon?.outer ?? eff.outer;
  const canonVarsRule = `
    ${SCOPE} {
      --mp-live-top: ${liveTop}mm;
      --mp-live-bottom: ${liveBottom}mm;
      --mp-live-inner: ${liveInner}mm;
      --mp-live-outer: ${liveOuter}mm;
      --mp-gutter-inner: ${gutInner}mm;
      --mp-gutter-outer: ${gutOuter}mm;
    }`;
  // §9.5.3 — chapterBreak forces a page break before each h1:
  //   - 'none':       no rule emitted
  //   - 'next-page':  CSS `break-before: page`
  //   - 'next-recto': CSS `break-before: right` (next odd page; in
  //                   simplex degenerates to next-page automatically).
  // Unscoped on purpose — paged.js parses the selector itself and
  // can't cope with `:where(...)`. The rule is only meaningful in
  // paginated contexts so leaking it globally is harmless.
  const chapterBreakRule =
    s.chapterBreak === 'next-page'
      ? 'h1 { break-before: page; }'
      : s.chapterBreak === 'next-recto'
        ? 'h1 { break-before: right; }'
        : '';
  return `
    ${pageRule}
    ${bodyPaddingRule}
    ${marginBoxAlignRule}
    ${canonVarsRule}
    ${runningContentRule}
    ${sidenoteRule}
    ${chapterBreakRule}

    /* Body-equivalent styles applied to the paginated container. */
    ${SCOPE} {
      font-family: ${bodyFamily};
      font-size: ${styles.body.fontSize}pt;
      line-height: ${styles.body.lineHeight ?? 1.25};
      color: ${styles.body.color};
      ${styles.body.align ? `text-align: ${styles.body.align};` : ''}
    }

    ${
      styles.body.align === 'justify'
        ? `/* When paged.js splits a justified container across a page (e.g. a
       <ul> broken between two items, or a <blockquote> between paragraphs)
       it tags the container data-align-last-split-element='justify' so the
       line at the break stays justified — right for a paragraph that
       continues, but it cascades to *complete* children sitting before the
       break (a whole <li> ending on this page), stretching their genuine
       last line. Reset last-line alignment on descendants that are not the
       split element themselves; a truly-split child keeps the attribute and
       stays justified. */
    ${SCOPE} [data-align-last-split-element='justify'] :not([data-align-last-split-element]) { text-align-last: auto; }`
        : ''
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
    /* Hug the text-block top edge. paged.js always wraps the page
       content in an anonymous div (.pagedjs_page_content > div), then
       our keepLabelsWithNext() may add another (.keep-with-next), and
       the actual content (h1, p, blockquote, ...) lives under that.
       Empirically, the inner element's margin-top is NOT absorbed by
       the wrapper chain — it surfaces as a visible gap above the first
       line. Zero the margin-top on every link in the first-child chain
       so the leading element sits flush against the text-block top
       edge regardless of how many wrappers paged.js / we have
       inserted. Continuation fragments are unaffected (paged.js zeroes
       their margin-top on its own fragmentation pass).
       NOTE on specificity: must use :is(#preview-pane, #print-target)
       — NOT :where(...) — so the rule carries ID specificity (1,4,0)
       and beats the fluid-preview rules from preview.ts (specificity
       1,1,1, e.g. #preview-pane h1.doc-title with its own margin
       shorthand) that leak into the paged tree because it lives
       inside #preview-pane. */
    :is(#preview-pane, #markpage-print-target) .pagedjs_page_content > :first-child,
    :is(#preview-pane, #markpage-print-target) .pagedjs_page_content > :first-child > :first-child,
    :is(#preview-pane, #markpage-print-target) .pagedjs_page_content > :first-child > :first-child > :first-child,
    :is(#preview-pane, #markpage-print-target) .pagedjs_page_content > :first-child > :first-child > :first-child > :first-child {
      margin-top: 0;
    }
    ${SCOPE} p {
      margin: ${styles.body.marginAbove ?? 1}em 0 ${styles.body.marginBelow ?? 1}em;
      text-indent: 0;
    }
    /* First-line indent, same rule as the continuous preview (preview.ts).
       It used to be banned here — CSS text-indent made paged.js fold split
       fragments back onto page 1, so the indent was delegated to inline spacer
       nodes injected after pagination. That mitigation died with paged.js (its
       injector was dead code), which left firstLineIndent silently doing
       nothing in the paginated view and in the PDF: with the vertical spacing
       switched off, paragraphs ran together with no separation at all.
       Vivliostyle fragments a text-indent paragraph correctly — the indent
       applies to the block's first formatted line only, so a continuation
       fragment at the top of a page is NOT re-indented. */
    ${SCOPE} p + p,
    ${SCOPE} p.mp-paragraph-continuation {
      text-indent: ${styles.body.firstLineIndent ?? 0}em;
    }
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

    /* Letterhead layout (sender / recipient / signature positioning) — shared
       with the VS Code extension via letterheadCss() so the two never drift. */
    ${letterheadCss({
      margins: {
        top: effMargins.top,
        right: effMargins.outer,
        bottom: effMargins.bottom,
        left: effMargins.inner,
      },
      pageW: sizeMm.w,
      pageH: sizeMm.h,
      textBlockInner: textBlockCanon?.inner ?? null,
      liveAreaInner: liveAreaCanon?.inner ?? null,
    })}

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

    /* Two-column (or N-column) container from a ::: columns block with ---
       separators (see the admonition renderer). Equal-width columns via
       grid; minmax(0,1fr) lets listings / long words wrap instead of
       overflowing their column. Works the same in slides and A4. The
       break-inside:avoid that keeps the block on one page lives unscoped
       below — paged.js can't parse :where() in break-rule selectors. */
    ${SCOPE} .columns-block {
      display: grid;
      grid-template-columns: repeat(var(--columns-count, 2), minmax(0, 1fr));
      gap: 0.6em 2em;
      align-items: start;
      margin: 0.6em 0;
    }
    ${SCOPE} .columns-block > .column > :first-child { margin-top: 0; }
    ${SCOPE} .columns-block > .column > :last-child { margin-bottom: 0; }

    /* Augmented table of contents (::: toc+). Renders as a clean TOC —
       titles only (intentions are draft-only, dropped at render), indented
       by level, with dotted leaders and the target section's page number
       (TOC-PLUS-SPEC §4, §6). An entry whose title matches no heading is
       struck through (.toc-missing) — the visible "checksum" hole of §5. */
    ${TOC} nav.toc-plus { margin: 0.8em 0; }
    ${TOC} nav.toc-plus ul { list-style: none; margin: 0; padding: 0; }
    ${TOC} nav.toc-plus .toc-entry { margin: 0.15em 0; line-height: 1.3; }
    ${TOC} nav.toc-plus .toc-level-2 { padding-left: 1.6em; }
    ${TOC} nav.toc-plus .toc-level-3 { padding-left: 3.2em; }
    ${TOC} nav.toc-plus .toc-level-4 { padding-left: 4.8em; }
    /* Each entry is a flex row: title — dotted leader — page number. */
    ${TOC} nav.toc-plus .toc-entry a {
      display: flex;
      align-items: baseline;
      gap: 0.5em;
      color: inherit;
      text-decoration: none;
    }
    ${TOC} nav.toc-plus .toc-title { flex: 0 1 auto; }
    ${TOC} nav.toc-plus .toc-dots {
      flex: 1 1 auto;
      align-self: center;
      min-width: 1.5em;
      border-bottom: 1px dotted currentColor;
      opacity: 0.4;
    }
    /* Page number: paged.js resolves the target section's page via
       target-counter. UNSCOPED on purpose — paged.js's TargetCounters
       handler runs querySelectorAll from inside .pagedjs_pages, so any
       ancestor scope (#preview-pane / its rewritten [data-id=…]) matches
       nothing. nav.toc-plus only exists in the render targets anyway. */
    nav.toc-plus .toc-entry a[href]::after {
      content: target-counter(attr(href), page);
      flex: 0 0 auto;
      font-variant-numeric: tabular-nums;
    }
    /* Unmatched entry: broken-looking, no leader / page number. */
    ${TOC} nav.toc-plus a.toc-missing {
      color: #b00020;
      text-decoration: line-through;
      cursor: default;
    }
    ${TOC} nav.toc-plus a.toc-missing .toc-dots { display: none; }

    /* Fragmentation policy (headings, tables, atomic blocks, orphans/widows)
       — shared with the VS Code extension via @orlarey/markpage-render's
       paginationCss(), so the policy lives in one place and can't drift.
       Unscoped on purpose: paged.js corrupts :is()/:where() in break
       selectors, and break-* is inert outside a paginated context. */
    ${paginationCss()}
    ${slidesBreakCss(s)}
    ${slidesFigureCss(s)}
    /* MathJax SVGs are sized in ex units (relative to the container's
       font-size), so scaling the math wrappers' font-size resizes the
       glyphs without re-rendering. */
    ${SCOPE} :is(.math-inline, .math-block) { font-size: ${s.mathScale}em; }
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
 * Purpose: Build the body-content padding rule that recovers the
 *   §9.6 text block dimensions from the live-area-sized page content
 *   area. Targets `.pagedjs_page_content` (paged.js's wrapper around
 *   the actual flow content) and respects duplex by swapping the
 *   inner / outer paddings on `.pagedjs_left_page` (verso).
 * How: Compute each side's padding as the difference between the
 *   text-block canonical margin and the live-area canonical margin —
 *   that difference equals the band height per §9.6.4. Emit one rule
 *   for the recto/default and, in duplex, a second swapped rule for
 *   the verso. Center-of-page positioning is automatic because the
 *   live area is itself centred on the page.
 */
/**
 * Purpose: Inject a small SVG overlay into every `.pagedjs_pagebox` so
 *   the debug-guides view (toggled via `.debug-layout` on the render
 *   container) shows the Van de Graaf construction diagonals.
 * How: One SVG per page with `viewBox="0 0 100 100"` (page-relative).
 *   The diagonal set depends on the page's role:
 *
 *     - Simplex (no duplex) OR the cover page (first page, recto
 *       alone with no facing verso): the full page X — both page
 *       diagonals TL↔BR and TR↔BL.
 *     - Duplex verso (left page in a real spread, NOT the cover):
 *       three lines that, joined to the recto facing it, draw the
 *       four canonical spread diagonals:
 *         · internal page diagonal: TR (100,0) → BL (0,100)
 *         · half of the ↘ spread diagonal: TL (0,0) → spine bottom
 *           middle (100,50) — continues into the recto's left half
 *         · half of the ↙ spread diagonal: spine top middle (100,50)
 *           → BL (0,100) — continues from the recto's right half
 *     - Duplex recto (right page in a real spread): mirror of the
 *       verso. Lines:
 *         · internal page diagonal: TL (0,0) → BR (100,100)
 *         · half ↘: spine top middle (0,50) → BR (100,100)
 *         · half ↙: TR (100,0) → spine bottom middle (0,50)
 *
 *   When the verso and recto of a spread sit edge-to-edge (the CSS
 *   grid does this via `justify-self: end/start`), the four half-
 *   lines join at the spine to form the two full spread diagonals
 *   plus the two page-internal ones — visually identical to the
 *   SVG diagrams in docs/img/recto-verso-layout.svg.
 *
 *   `pointer-events: none` and `position: absolute` (with `inset: 0`)
 *   keep the SVG out of the layout flow. Visibility is gated by CSS
 *   (`display: none` until `.debug-layout` is set on the container).
 *   Idempotent: re-injects safely if a previous overlay already
 *   exists on the page (no duplicates).
 */
function buildBodyPaddingCss(
  scope: string,
  textBlock: CanonicalMargins,
  liveArea: CanonicalMargins,
  duplex: boolean,
): string {
  // Vertical padding is ZERO: the @page margin (in derived mode) is
  // already set to the TEXT BLOCK top / bottom so the body content
  // area has the text-block height natively. Only the horizontal
  // gutters (inner / outer) need to be subtracted from the live area
  // to recover the text-block width.
  const padInner = Math.max(0, textBlock.inner - liveArea.inner);
  const padOuter = Math.max(0, textBlock.outer - liveArea.outer);
  // CSS padding shorthand is `top right bottom left`. On recto:
  //   right = outer, left = inner.
  const rectoPadding = `padding: 0 ${padOuter}mm 0 ${padInner}mm;`;
  const versoPadding = `padding: 0 ${padInner}mm 0 ${padOuter}mm;`;
  // Scope to .pagedjs_page_content (paged.js's content wrapper). The
  // `scope` prefix (`:where(#preview-pane, ...)`) keeps these rules
  // from leaking outside the paginated containers.
  // Two selectors, two worlds — both required:
  //  - `.pagedjs_page_content` is the content box paged.js creates, and the
  //    class linearizePages() re-emits on Vivliostyle's page area container.
  //    Host-side rules (backdrops, guides, chrome) key on it.
  //  - `#mp-viv-root` is the body of the standalone document Vivliostyle lays
  //    out. Gutters must exist THERE to affect the text flow: applying them to
  //    the host copy after layout would not re-wrap a single line.
  // Vivliostyle floats footnotes into ITS column box, a sibling of the body
  // flow — so they escape the body padding and sit flush with the live area,
  // ~20mm left of the text. The column is an engine-internal box that ignores
  // author CSS, so inset our own `.sidenote` (what gets floated) instead.
  const noteInset =
    `#mp-viv-root .sidenote { margin-left: ${padInner}mm; margin-right: ${padOuter}mm; }`;
  if (!duplex) {
    return (
      `${scope} .pagedjs_page_content { ${rectoPadding} }\n` +
      `#mp-viv-root { ${rectoPadding} }\n${noteInset}`
    );
  }
  return (
    `${scope} .pagedjs_right_page .pagedjs_page_content { ${rectoPadding} }\n` +
    `${scope} .pagedjs_left_page  .pagedjs_page_content { ${versoPadding} }\n` +
    `#mp-viv-root { ${rectoPadding} }`
  );
}

/**
 * A single-sided document has no spine: its text and live-area rectangles
 * must therefore be horizontally centred. The classical 1:2 inner/outer
 * canon remains meaningful only for facing pages, where it is mirrored on
 * verso. Width and vertical geometry stay unchanged.
 */
function centerCanonicalHorizontally(
  canon: CanonicalMargins,
  duplex: boolean,
): CanonicalMargins {
  if (duplex) return canon;
  const side = (canon.inner + canon.outer) / 2;
  return { ...canon, inner: side, outer: side };
}

/**
 * Purpose: Build the sidenote CSS for the §9.7 scholar-margin
 *   rendering. Returns a stylesheet fragment that:
 *     - In `foot` / `end` modes: hides every `.sidenote` (the existing
 *       `<section class="footnotes">` provides the visible rendering).
 *     - In `side` mode: hides the footnote section and the `<sup
 *       class="footnote-ref">` superscript, then positions the
 *       `.sidenote` span absolutely in the outer gutter so it sits at
 *       the line of its anchor.
 * How: Side mode requires knowing the outer-gutter geometry; if we
 *   don't have it (i.e. `marginMode === 'manual'`), fall back to the
 *   default `display: none` to avoid sidenotes spilling over the body
 *   text. The width is computed as `outerGutter - GAP` where
 *   `GAP = innerGutter / 4` per §9.7.1, leaving a visual breathing
 *   space between the text block and the sidenote area.
 *
 *   Paragraphs (and other block containers that may host an anchor)
 *   get `position: relative` so the absolutely-positioned sidenote
 *   anchors on the paragraph rather than the page-content root —
 *   keeps the sidenote vertically near its anchor instead of pinned
 *   to the page top.
 *
 *   In duplex the outer gutter is on the LEFT on verso, so the
 *   sidenote uses `left: -...mm` instead of `right: -...mm` on
 *   `.pagedjs_left_page`.
 */
function buildSidenoteCss(
  scope: string,
  position: 'foot' | 'side' | 'end',
  textBlock: CanonicalMargins | null,
  liveArea: CanonicalMargins | null,
  duplex: boolean,
): string {
  // === 'end' mode ============================================
  // The classical Markdown rendering: the `<section class="footnotes">`
  // collected at the document tail carries the body of every note,
  // and the inline `.sidenote` span is hidden. The body superscript
  // `.footnote-ref` stays visible (it's the back-link anchor).
  if (position === 'end') {
    return `${scope} .sidenote { display: none; }`;
  }
  // === 'foot' mode ===========================================
  // Real per-page footnotes via the CSS Paged Media `float: footnote`
  // property — paged.js (modules/paged-media/footnotes.js) intercepts
  // the declaration, moves every matched element to the page's
  // `.pagedjs_footnote_area`, and auto-generates a numeric
  // `::footnote-call` at the original position plus a
  // `::footnote-marker` at the start of the moved element.
  //   - Hide our manual `.footnote-ref` superscript so we don't double
  //     the in-body marker with paged.js's auto-generated one.
  //   - Hide our internal `.sidenote-num` prefix inside the moved
  //     element so we don't double the marker in the footnote area.
  //   - Hide the document-tail `section.footnotes` (paged.js is now
  //     authoritative for the body).
  if (position === 'foot') {
    return [
      // UNSCOPED on purpose: paged.js's footnote handler captures the
      // selector and runs `parsed.querySelectorAll(selector)` against
      // the CLONED SOURCE (which lives outside `#preview-pane`). A
      // scoped selector like `:where(#preview-pane, ...) .sidenote`
      // would match zero elements there. The rule is only meaningful
      // in a paginated context anyway, so leaking it globally is harmless.
      `.sidenote { float: footnote; }`,
      // The remaining rules apply to the RENDERED DOM (inside the
      // preview / print container) so they keep the scope.
      `${scope} .footnote-ref { display: none; }`,
      `${scope} .sidenote .sidenote-num { display: none; }`,
      `${scope} section.footnotes { display: none; }`,
    ].join('\n');
  }
  // === 'side' mode ===========================================
  // Tufte-CSS approach: position the inline `.sidenote` span absolutely
  // in the outer gutter at the height of its anchor. Requires the
  // canonical margins so we know the gutter width; degrades silently
  // to plain hide if `marginMode === 'manual'`.
  if (textBlock === null || liveArea === null) {
    return `${scope} .sidenote { display: none; }`;
  }
  const outerGutter = Math.max(0, textBlock.outer - liveArea.outer);
  const innerGutter = Math.max(0, textBlock.inner - liveArea.inner);
  // Visual breathing between the text block and the sidenote area.
  // Default rule §9.7.1: gap = innerGutter / 4 (sound when innerGutter
  // is itself derived; clamp to a sensible minimum so very tight live
  // areas don't end up with sidenotes glued to the text).
  const gap = Math.max(1.5, innerGutter / 4);
  const noteWidth = Math.max(5, outerGutter - gap);
  // §9.7.5 — margin figures (`img.margin`) share the same outer-gutter
  // positioning as sidenotes. The selector targets BOTH so authors
  // can mix `[^id]` footnote anchors with `![alt](url){.margin}`
  // images in the same flow without writing separate CSS.
  const recto =
    `${scope} :is(.sidenote, img.margin) {\n` +
    `  display: inline-block;\n` +
    `  position: absolute;\n` +
    `  right: -${outerGutter}mm;\n` +
    `  width: ${noteWidth}mm;\n` +
    `  font-size: 0.85em;\n` +
    `  line-height: 1.3;\n` +
    `  text-indent: 0;\n` +
    `  text-align: left;\n` +
    `}\n` +
    // Margin images cap their max-width to the sidenote area so an
    // oversized source file doesn't blow out the outer gutter; height
    // is auto for aspect-ratio preservation.
    `${scope} img.margin {\n` +
    `  max-width: ${noteWidth}mm;\n` +
    `  height: auto;\n` +
    `}`;
  // Numeric prefix inside the sidenote (small superscript with a
  // half-space after it). Matches the convention where the same
  // number appears as the body anchor AND at the start of the note.
  const sidenoteNum =
    `${scope} .sidenote .sidenote-num {\n` +
    `  font-size: 0.75em;\n` +
    `  vertical-align: super;\n` +
    `  margin-right: 0.25em;\n` +
    `}`;
  // Paragraphs (and related block hosts) need a positioning context.
  const relative =
    `${scope} :where(p, li, blockquote, .pagedjs_page_content) { position: relative; }`;
  // Only the document-tail footnote section is hidden in side mode —
  // the body `.footnote-ref` superscript stays visible as the anchor.
  const hides = `${scope} section.footnotes { display: none; }`;
  // Duplex: on verso pages, flip to the opposite side.
  if (!duplex) {
    return [hides, relative, recto, sidenoteNum].join('\n');
  }
  const verso =
    `${scope} .pagedjs_left_page :is(.sidenote, img.margin) {\n` +
    `  left: -${outerGutter}mm;\n` +
    `  right: auto;\n` +
    `}`;
  return [hides, relative, recto, sidenoteNum, verso].join('\n');
}

/**
 * Purpose: Map the PageSize enum to physical mm dimensions.
 * How: Switch over standard ISO + US sizes; matches pdfmake's table.
 */
export function pageSizeMm(s: PdfSettings): { w: number; h: number } {
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
 * Purpose: The body text-block size in px, computed *deterministically* from
 *   settings — same geometry the @page CSS uses (derived canon vs manual
 *   margins). Used by the mosaic packer so its row count doesn't depend on a
 *   prior render being measured (which made the first/cold render flip between
 *   one and two rows).
 */
export function pageContentGeomPx(s: PdfSettings): {
  width: number;
  height: number;
} {
  const PX_PER_MM = 96 / 25.4;
  const sizeMm = pageSizeMm(s);
  if (s.marginMode === 'derived') {
    // Mosaic content sits in the text block; its width is the canonical
    // measure (measureChars × char width), matching pagedCss.
    const bodyName = (s.styles.body.family ?? '').trim() || s.fonts.body;
    const charWidthMm = measureAverageCharWidth(
      bodyName,
      s.styles.body.fontSize ?? 11,
    );
    const tb = computeCanonicalMargins(
      sizeMm.w,
      sizeMm.h,
      s.measureChars,
      charWidthMm,
    );
    return { width: tb.width * PX_PER_MM, height: tb.height * PX_PER_MM };
  }
  const m = s.margins;
  return {
    width: Math.max(1, (sizeMm.w - m.left - m.right) * PX_PER_MM),
    height: Math.max(1, (sizeMm.h - m.top - m.bottom) * PX_PER_MM),
  };
}

/**
 * Purpose: Apply the user-configured header / footer typography (font,
 *   size, colour, weight, italic) to every @top-* / @bottom-* margin
 *   box at once, so author-supplied fences pick up the requested
 *   defaults without per-box repetition.
 * How: Target the @margin BOX selectors (`.pagedjs_margin-top-left`
 *   etc.) rather than the inner `.pagedjs_margin-content` wrapper.
 *   Reason: paged.js renders fence content via `::after` on
 *   `.pagedjs_margin-content`, and a direct rule on that wrapper would
 *   override (via the cascade) any per-slot styling we extract from
 *   `**...**` whole-slot bold / italic markers — those get emitted on
 *   the @margin BOX itself (e.g. `.pagedjs_margin-top-right`). Putting
 *   our running-content defaults on the same selector level lets the
 *   per-slot rule win by source order (page-running.css is injected
 *   AFTER paged-rules.css, so its declarations override on tie).
 *   The inner `.pagedjs_margin-content` and `::after` inherit
 *   font-family / font-size / color / weight / style from the box.
 */
function runningContentCss(style: Style): string {
  const decls: string[] = [];
  if (style.family !== undefined && style.family.trim() !== '') {
    decls.push(`font-family: ${quoteFontFamily(style.family)};`);
  }
  if (style.fontSize !== undefined) {
    decls.push(`font-size: ${style.fontSize}pt;`);
  }
  if (style.color !== undefined) {
    decls.push(`color: ${style.color};`);
  }
  if (style.weight !== undefined) {
    decls.push(`font-weight: ${style.weight};`);
  }
  if (style.italic) {
    decls.push('font-style: italic;');
  }
  if (decls.length === 0) return '';
  // All eight @margin-box positions (4 sides × top/center/bottom or
  // left/center/right) plus the 4 corners. Listing them explicitly
  // matches what paged.js generates from @top-* / @bottom-* etc. rules,
  // so author per-slot extracts (also class selectors on these names)
  // sit at the same specificity tier — page-running.css is injected
  // after paged-rules.css so per-slot wins on tie.
  const boxes = [
    '.pagedjs_margin-top-left-corner',
    '.pagedjs_margin-top-left',
    '.pagedjs_margin-top-center',
    '.pagedjs_margin-top-right',
    '.pagedjs_margin-top-right-corner',
    '.pagedjs_margin-bottom-left-corner',
    '.pagedjs_margin-bottom-left',
    '.pagedjs_margin-bottom-center',
    '.pagedjs_margin-bottom-right',
    '.pagedjs_margin-bottom-right-corner',
  ].join(', ');
  return `:where(#preview-pane, #markpage-print-target) :is(${boxes}) { ${decls.join(' ')} }`;
}
