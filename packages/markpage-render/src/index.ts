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

// Frontmatter parsing — the document keys only (title / author / organization /
// date / mathjax-preamble / document-style / language …); a document's look is
// its named style, never its front-matter.
export {
  parseFrontmatter,
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
// Unicode-math ↔ LaTeX table, shared by the render path (pre-MathJax) and the
// app's LaTeX export + editor ligatures, so both agree on every symbol.
export {
  mathBodyToLatex,
  latexToUnicode,
  type MathConvertResult,
} from './latex-math-symbols';
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
export { paginationCss } from './pagination';
export {
  runningApparatusCss,
  apparatusStringSets,
  materialToCss,
  zoneToCss,
  type RunningApparatus,
  type ApparatusBand,
  type ApparatusZones,
  type ApparatusMaterial,
} from './running-apparatus';
export {
  ATOMIC_MARGIN_BORROW_THRESHOLD,
  atomicFitDecision,
  markAtomicBlocks,
  fitAtomicBlocks,
  type AtomicPageGeometryPx,
  type AtomicFitDecision,
  type AtomicFitMode,
  type AtomicFitOptions,
  type AtomicFitResult,
} from './atomic-fit';
export {
  DEFAULT_MIN_TABLE_SCALE,
  fitWideTables,
  tableFitScale,
  type TableFitOptions,
  type TableFitResult,
} from './table-fit';
export {
  hsvToHex,
  cranToHex,
  parseCran,
  parseColorCrans,
  deriveElementColors,
  backgroundColor,
  FONT_PAIRINGS,
  FONT_STEPS,
  DEFAULT_FONT_RATIO,
  resolveFontPairing,
  deriveFontSizes,
  type Cran,
  type FontPairing,
} from './style-vocabulary';
