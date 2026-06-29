/********************************* @orlarey/markpage-render ********************
 *
 * Purpose: markpage's Markdown render pipeline (phase A — transform) as a
 *   reusable package: the fenced-block / callout / footnote / refs extensions
 *   wired onto the shared `marked` instance, plus the rendering primitives the
 *   host app (and the VS Code preview) reuse.
 * How: importing this module runs `marked-config` for its side effect — it calls
 *   `marked.use(...)` on the shared `marked` singleton (a peer dependency, so the
 *   host's `marked.parse()` sees the extensions). The named re-exports expose the
 *   helpers that app code outside the pipeline also needs.
 *
 *******************************************************************************/

// Side effect: register admonitions / math placeholders / fenced DSLs / etc.
// on the shared marked instance. Must run before any marked.parse().
import './marked-config';

// The public render entry + the image-resolution seam.
export {
  renderMarkpageMarkdown,
  renderMetadataBlock,
  rewriteImageSrc,
  type RenderOptions,
} from './render';

// Frontmatter parsing (title / author / date / mathjax-preamble / slides …)
// + the layout overrides (page-size / margins / page-numbers / fonts).
export {
  parseFrontmatter,
  embedProfileInFrontmatter,
  type Frontmatter,
  type ParseResult,
} from './frontmatter';

// Phase B — the DOM hydrate (MathJax + Mermaid) and the underlying renderers.
export {
  hydratePreview,
  renderMathInlines,
  renderMathBlocks,
  renderMermaidBlocks,
  type HydrateOptions,
} from './hydrate';
export { renderMath } from './math';
export { renderMermaid, voidTagsToXhtml, type MermaidResult } from './mermaid';
export { type MathFontSet, FONT_SETS, MATH_FONT_SETS } from './mathjax-fontsets';

// Rendering primitives reused outside the core pipeline (export-latex,
// paginated preview, the showcase demo, unit tests).
export { parseFenceInfo, resetCaptions, withCaption } from './captions';
export {
  parseMosaicInfo,
  parseMosaicBody,
  packRows,
  renderMosaic,
  layoutMosaicBlocks,
} from './mosaic';
export { highlightCode, isKnownLanguage } from './highlight';
export { renderLetterhead, groupLetterheads, letterheadCss } from './letterhead';
export type { LetterheadGeom } from './letterhead';
export {
  renderPageRunning,
  applyPageRunningRuns,
  prependDefaultFences,
  resetPageRunningCounter,
} from './page-running';
export { anchorId } from './refs';
export { applyBackgrounds } from './background';
export { paginationCss, keepLabelsWithNext } from './pagination';
