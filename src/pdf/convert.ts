import { marked, type Token, type Tokens } from 'marked';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  metadataLines,
  mmToPt,
  type PageSize,
  type PdfSettings,
} from '../settings';
import { renderMermaid } from '../mermaid';
import { renderMath } from '../math';
import { buildBaseDocDefinition } from './styles';

// Page dimensions in pt, matching pdfmake's internal table. Used to figure
// out the maximum width an image is allowed to take in the body content.
const PAGE_SIZE_PT: Record<PageSize, [number, number]> = {
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  B5: [498.9, 708.66],
  LETTER: [612, 792],
  LEGAL: [612, 1008],
};

function contentWidthPt(s: PdfSettings): number {
  const [pw] = PAGE_SIZE_PT[s.pageSize];
  return pw - mmToPt(s.margins.left) - mmToPt(s.margins.right);
}

function contentHeightPt(s: PdfSettings): number {
  const [, ph] = PAGE_SIZE_PT[s.pageSize];
  return ph - mmToPt(s.margins.top) - mmToPt(s.margins.bottom);
}

// Adjusts inter-block margins for a sequence of blocks that all came from
// the SAME source paragraph (image + caption, caption + image, etc.):
//   - a single image standing alone gets the standard breathing room above
//     and below, matching its previous solo-paragraph behaviour;
//   - in a multi-block sequence, all internal gaps go to 0 and only the
//     last block keeps a regular paragraph-style bottom margin so the
//     spacing to the next source paragraph stays normal.
function tightenBlocks(blocks: Content[]): void {
  if (blocks.length === 0) return;
  if (blocks.length === 1) {
    const sole = blocks[0] as {
      image?: string;
      margin?: [number, number, number, number];
    };
    if (sole.image !== undefined) sole.margin = [0, 6, 0, 6];
    return;
  }
  for (let i = 0; i < blocks.length; i += 1) {
    const isLast = i === blocks.length - 1;
    const b = blocks[i] as {
      image?: string;
      style?: string;
      margin?: [number, number, number, number];
    };
    if (b.image !== undefined) {
      // Image blocks set their own margin explicitly. Internal images go
      // tight; the last image keeps a paragraph-style bottom margin.
      b.margin = isLast ? [0, 0, 0, 6] : [0, 0, 0, 0];
    } else if (b.style === 'paragraph' && !isLast) {
      // Text blocks default to the 'paragraph' style margin (0, 0, 0, 6);
      // override to 0 for non-last blocks so they sit tight against the
      // following image.
      b.margin = [0, 0, 0, 0];
    }
  }
}

// Inline content as accepted by pdfmake's `text` field: a string, a styled run,
// or an array of those.
type InlineRun = string | { text: string | InlineRun[]; [k: string]: unknown };

// marked stores HTML-encoded text in its tokens (e.g. `&#39;` for an
// apostrophe), since it's primarily an HTML renderer. pdfmake takes plain
// text, so we round-trip through a textarea — its content is always treated
// as text, never HTML, which makes this safe even with arbitrary input.
let decodeBuf: HTMLTextAreaElement | null = null;
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  decodeBuf ??= document.createElement('textarea');
  decodeBuf.innerHTML = s;
  return decodeBuf.value;
}

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  decoration?: 'underline' | 'lineThrough';
  link?: string;
  style?: string;
}

export async function markdownToDocDefinition(
  source: string,
  settings: PdfSettings,
): Promise<TDocumentDefinitions> {
  // Trailing whitespace (extra blank lines) is the single most common cause
  // of pdfmake emitting an empty trailing page, so we drop it before lexing.
  const tokens = marked.lexer(source.replace(/\s+$/u, ''));
  // Pre-render every ```mermaid block and `$$…$$` math block to SVG, in
  // parallel. The token walker below is synchronous and looks each one
  // up by its source string in the maps we build here.
  const [mermaidSvgs, mathSvgs] = await Promise.all([
    preRenderMermaidBlocks(tokens),
    preRenderMathBlocks(tokens, settings),
  ]);
  const content = tokensToContent(tokens, settings, mermaidSvgs, mathSvgs);
  insertMetadataBlock(content, tokens, settings);
  clearTrailingMargin(content);
  return {
    ...buildBaseDocDefinition(settings),
    ...buildPageNumber(settings),
    content,
  };
}

interface RenderedMermaid {
  svg: string;
  width: number;
  height: number;
}

// Walks the token tree, finds every code block tagged `mermaid`, and renders
// each unique source to SVG in parallel. Returns a Map keyed by source so a
// single source shared between blocks renders once. Each entry carries the
// SVG plus its intrinsic dimensions, so the caller can size the pdfmake
// block exactly (using fit:[…] reserves the full box even if the diagram is
// smaller, which pushes content to the next page).
async function preRenderMermaidBlocks(
  tokens: Token[],
): Promise<Map<string, RenderedMermaid>> {
  const sources = new Set<string>();
  collectMermaidSources(tokens, sources);
  const map = new Map<string, RenderedMermaid>();
  await Promise.all(
    [...sources].map(async (src) => {
      const result = await renderMermaid(src);
      if (result.ok) map.set(src, sanitiseSvgForPdfmake(result.svg));
    }),
  );
  return map;
}

// Same idea as preRenderMermaidBlocks, but for `$$…$$` display-math
// tokens. MathJax sizes its SVGs in `ex` units (height of an `x` glyph),
// which is what makes its math integrate with surrounding text in the
// browser. We must capture those ex dimensions *before* sanitisation —
// `sanitiseSvgForPdfmake` calls `cropSvgToContent`, which rewrites width
// /height to the bbox in internal math units (thousands), useless for
// pdfmake sizing. We then convert ex → pt using the body font size
// (1ex ≈ 0.5em ≈ fontSize/2) so the formula prints at body-text scale.
async function preRenderMathBlocks(
  tokens: Token[],
  settings: PdfSettings,
): Promise<Map<string, RenderedMermaid>> {
  const sources = new Set<string>();
  collectMathSources(tokens, sources);
  const map = new Map<string, RenderedMermaid>();
  const fontPt = settings.styles.body.fontSize;
  await Promise.all(
    [...sources].map(async (src) => {
      const result = await renderMath(src, true);
      if (!result.ok) return;
      const ex = readExDimensions(result.svg);
      const entry = sanitiseSvgForPdfmake(result.svg);
      if (ex) {
        // Override the bbox-derived numbers with ex-based pt dimensions.
        entry.width = ex.widthEx * 0.5 * fontPt;
        entry.height = ex.heightEx * 0.5 * fontPt;
      }
      map.set(src, entry);
    }),
  );
  return map;
}

function readExDimensions(svg: string): {
  widthEx: number;
  heightEx: number;
} | null {
  const w = /<svg[^>]*\swidth="([\d.]+)ex"/i.exec(svg);
  const h = /<svg[^>]*\sheight="([\d.]+)ex"/i.exec(svg);
  if (!w || !h) return null;
  const widthEx = Number.parseFloat(w[1] ?? '');
  const heightEx = Number.parseFloat(h[1] ?? '');
  if (!Number.isFinite(widthEx) || !Number.isFinite(heightEx)) return null;
  return { widthEx, heightEx };
}

function collectMathSources(tokens: Token[], out: Set<string>): void {
  for (const tok of tokens) {
    if (tok.type === 'mathBlock') {
      out.add((tok as unknown as { text: string }).text);
    }
    const nested = (tok as { tokens?: Token[] }).tokens;
    if (nested) collectMathSources(nested, out);
    if (tok.type === 'list') {
      for (const item of (tok as Tokens.List).items) {
        collectMathSources(item.tokens ?? [], out);
      }
    }
  }
}

// Mermaid puts all of its colouring (box fills, text colour, stroke widths)
// in a single <style> block with class-based selectors. pdfmake's SVG
// engine (svg-to-pdfkit) doesn't resolve CSS selectors, so without this
// step every rect ends up black-on-black. We render the SVG into a hidden
// DOM container so the browser's CSS engine applies the rules, then copy
// the computed presentation values onto each element as SVG attributes
// (pdfmake is more reliable with attributes than with inline style="..."),
// and drop the now-redundant <style> blocks plus a few constructs pdfmake
// can't parse.
function sanitiseSvgForPdfmake(svg: string): RenderedMermaid {
  // Drop @import upfront (textually) so it can't fire during DOMParser load.
  const stripped = svg.replaceAll(/@import[^;]*;?/gi, '');

  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none';
  container.innerHTML = stripped;
  document.body.appendChild(container);
  try {
    const root = container.querySelector('svg');
    if (!root) return { svg: stripped, width: 800, height: 600 };
    // Convert <foreignObject> labels (mermaid uses these for node text even
    // when htmlLabels:false is requested) to native SVG <text> first, while
    // the layout box dimensions are still on the FO. Then drop any FO that
    // didn't have extractable text.
    foreignObjectsToText(root);
    for (const fo of root.querySelectorAll('foreignObject')) fo.remove();
    inlineComputedStyles(root);
    scrubInvalidDasharrays(root);
    forceRegisteredFont(root);
    // Bake markers as rotated <g> clones at line endpoints. svg-to-pdfkit
    // mishandles `orient="auto"` for right-to-left lines (sequence-diagram
    // reply arrows), so we compute the rotation ourselves and stop relying
    // on pdfmake to interpret marker-end / marker-start at all.
    inlineMarkers(root);
    for (const styleEl of root.querySelectorAll('style')) styleEl.remove();
    // Crop the SVG to the actual painted extent. Mermaid often sets
    // width="100%" or a height that pads the content with empty space, so
    // both the layout box pdfmake reserves AND what gets drawn inside it
    // become wrong. getBBox returns the real ink box — we resize the SVG
    // viewport (and its width/height attrs) to match.
    const { width, height } = cropSvgToContent(root);
    return {
      svg: new XMLSerializer().serializeToString(root),
      width,
      height,
    };
  } finally {
    container.remove();
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Crops the SVG to the actual extent of its painted content (via
// `getBBox`) and rewrites width/height/viewBox to match. Mermaid's own
// width/height attributes often pad the content with empty space (e.g.
// `width="100%"`, or a height calculated for a container that is not
// ours), which makes pdfmake reserve the wrong layout box AND draw the
// diagram in only one corner of it. getBBox is the canonical "ink box"
// the browser computed during rendering; we trust it.
function cropSvgToContent(svg: SVGElement): {
  width: number;
  height: number;
} {
  try {
    const bbox = (svg as unknown as SVGGraphicsElement).getBBox();
    if (bbox.width > 0 && bbox.height > 0) {
      // Pad slightly so stroke widths on the border of the diagram aren't
      // clipped (a 1px stroke centred on x=0 needs x=-0.5 visible).
      const pad = 2;
      const x = bbox.x - pad;
      const y = bbox.y - pad;
      const w = bbox.width + pad * 2;
      const h = bbox.height + pad * 2;
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      return { width: w, height: h };
    }
  } catch {
    // getBBox can throw if the element is not in the rendering tree; fall
    // through to the attribute/viewBox heuristic.
  }
  // Fallback: trust attributes (rejecting percentages) and viewBox.
  const wAttr = svg.getAttribute('width') ?? '';
  const hAttr = svg.getAttribute('height') ?? '';
  const px = (s: string) => (s.endsWith('%') ? Number.NaN : Number.parseFloat(s));
  let w = Number.isFinite(px(wAttr)) && px(wAttr) > 0 ? px(wAttr) : 0;
  let h = Number.isFinite(px(hAttr)) && px(hAttr) > 0 ? px(hAttr) : 0;
  if (!w || !h) {
    const vb = svg.getAttribute('viewBox');
    if (vb) {
      const parts = vb.split(/[\s,]+/).map((s) => Number.parseFloat(s));
      if (parts.length === 4) {
        if (!w && parts[2] && parts[2] > 0) w = parts[2];
        if (!h && parts[3] && parts[3] > 0) h = parts[3];
      }
    }
  }
  return { width: w || 800, height: h || 600 };
}

// Replaces each <foreignObject> with an SVG <text> centred at the FO's
// centre. Multi-line content (split by <br> or block-level boundaries) is
// emitted as one <tspan> per line, vertically centred as a block.
function foreignObjectsToText(svg: SVGElement): void {
  const fontSize = 14;
  const lineHeight = fontSize * 1.2;
  const fos = [...svg.querySelectorAll('foreignObject')];
  for (const fo of fos) {
    const lines = extractLines(fo);
    if (lines.length === 0) continue;
    const x = Number.parseFloat(fo.getAttribute('x') ?? '0') || 0;
    const y = Number.parseFloat(fo.getAttribute('y') ?? '0') || 0;
    const w = Number.parseFloat(fo.getAttribute('width') ?? '0') || 0;
    const h = Number.parseFloat(fo.getAttribute('height') ?? '0') || 0;
    const cx = x + w / 2;
    // Centre the multi-line block vertically: first baseline sits ~0.85em
    // below the block's visual top.
    const blockTop = y + (h - lines.length * lineHeight) / 2;
    const firstBaseline = blockTop + fontSize * 0.85;

    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(cx));
    t.setAttribute('y', String(firstBaseline));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-family', 'Roboto');
    t.setAttribute('font-size', String(fontSize));
    t.setAttribute('fill', '#333');
    for (const [i, line] of lines.entries()) {
      const span = document.createElementNS(SVG_NS, 'tspan');
      span.setAttribute('x', String(cx));
      if (i > 0) span.setAttribute('dy', String(lineHeight));
      span.textContent = line;
      t.appendChild(span);
    }
    fo.replaceWith(t);
  }
}

// Walks an HTML subtree and extracts its visual lines: splits on <br> and
// at the boundaries of block-level elements (<p>, <div>, <li>). Each line
// is whitespace-collapsed and trimmed. Empty lines are dropped.
function extractLines(root: Element): string[] {
  const lines: string[] = [];
  let buf = '';
  const flush = () => {
    const t = buf.replaceAll(/\s+/g, ' ').trim();
    if (t) lines.push(t);
    buf = '';
  };
  const BLOCK_TAGS = new Set(['p', 'div', 'li']);
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      buf += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      flush();
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) flush();
    for (const child of el.childNodes) walk(child);
    if (isBlock) flush();
  };
  for (const child of root.childNodes) walk(child);
  flush();
  return lines;
}

// Replaces every `marker-end` / `marker-start` reference with a cloned,
// rotated copy of the marker's contents at the corresponding endpoint. We
// compute the angle from the line/path's local direction and apply it as
// an explicit `rotate(...)` transform, so pdfmake never has to interpret
// `orient="auto"` (which it gets wrong for non-LTR lines).
function inlineMarkers(svg: SVGElement): void {
  const markers = new Map<string, SVGElement>();
  for (const m of svg.querySelectorAll('marker')) {
    const id = m.getAttribute('id');
    if (id) markers.set(id, m as SVGElement);
  }
  if (markers.size === 0) return;

  for (const el of svg.querySelectorAll<SVGElement>('line, path, polyline')) {
    if (!el.hasAttribute('marker-end') && !el.hasAttribute('marker-start')) {
      continue;
    }
    const ends = endpointsOf(el);
    if (!ends) continue;
    bakeMarker(el, 'marker-start', ends.start, ends.startDir, markers);
    bakeMarker(el, 'marker-end', ends.end, ends.endDir, markers);
  }
}

interface Endpoints {
  start: { x: number; y: number };
  end: { x: number; y: number };
  startDir: { dx: number; dy: number };
  endDir: { dx: number; dy: number };
}

function endpointsOf(el: SVGElement): Endpoints | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'line') {
    const x1 = Number.parseFloat(el.getAttribute('x1') ?? '0') || 0;
    const y1 = Number.parseFloat(el.getAttribute('y1') ?? '0') || 0;
    const x2 = Number.parseFloat(el.getAttribute('x2') ?? '0') || 0;
    const y2 = Number.parseFloat(el.getAttribute('y2') ?? '0') || 0;
    // Both tangents point in the direction of travel (start → end). The
    // SVG spec defines the marker-start orient as the path's tangent at
    // the start *as it heads forward*, not as it points back at the
    // origin.
    const dx = x2 - x1;
    const dy = y2 - y1;
    return {
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      startDir: { dx, dy },
      endDir: { dx, dy },
    };
  }
  // <path> / <polyline>: use the geometry-element API to sample tangent
  // vectors at the two ends, both pointing in the direction of travel.
  try {
    const geom = el as unknown as SVGGeometryElement;
    const len = geom.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return null;
    const eps = Math.min(1, len / 100);
    const a = geom.getPointAtLength(0);
    const b = geom.getPointAtLength(eps);
    const c = geom.getPointAtLength(Math.max(0, len - eps));
    const d = geom.getPointAtLength(len);
    return {
      start: { x: a.x, y: a.y },
      end: { x: d.x, y: d.y },
      startDir: { dx: b.x - a.x, dy: b.y - a.y },
      endDir: { dx: d.x - c.x, dy: d.y - c.y },
    };
  } catch {
    return null;
  }
}

function bakeMarker(
  el: SVGElement,
  attr: 'marker-start' | 'marker-end',
  point: { x: number; y: number },
  dir: { dx: number; dy: number },
  markers: Map<string, SVGElement>,
): void {
  const ref = el.getAttribute(attr);
  if (!ref) return;
  const idMatch = /url\(\s*#?([^)\s]+?)\s*\)/.exec(ref);
  if (!idMatch) return;
  const marker = markers.get(idMatch[1] ?? '');
  if (!marker) {
    el.removeAttribute(attr);
    return;
  }
  const refX = Number.parseFloat(marker.getAttribute('refX') ?? '0') || 0;
  const refY = Number.parseFloat(marker.getAttribute('refY') ?? '0') || 0;
  const angle = computeMarkerAngle(marker, attr, dir);
  const g = el.ownerDocument.createElementNS(SVG_NS, 'g');
  g.setAttribute(
    'transform',
    `translate(${point.x},${point.y}) rotate(${angle}) translate(${-refX},${-refY})`,
  );
  for (const child of marker.children) {
    g.appendChild(child.cloneNode(true));
  }
  el.parentElement?.appendChild(g);
  el.removeAttribute(attr);
}

// Resolves the rotation angle for a marker according to its `orient`:
//  - "auto" (default): angle of the path tangent
//  - "auto-start-reverse": tangent + 180° at marker-start (so symbols meant
//    to be received from the other end keep facing inward); equivalent to
//    "auto" at marker-end
//  - any numeric value: that fixed angle in degrees, ignoring the tangent
function computeMarkerAngle(
  marker: SVGElement,
  attr: 'marker-start' | 'marker-end',
  dir: { dx: number; dy: number },
): number {
  const orient = (marker.getAttribute('orient') ?? 'auto').trim();
  if (orient !== 'auto' && orient !== 'auto-start-reverse') {
    const fixed = Number.parseFloat(orient);
    if (Number.isFinite(fixed)) return fixed;
  }
  const tangent = (Math.atan2(dir.dy, dir.dx) * 180) / Math.PI;
  if (orient === 'auto-start-reverse' && attr === 'marker-start') {
    return tangent + 180;
  }
  return tangent;
}

// pdfmake only paints text whose font is registered. Mermaid's neutral theme
// asks for `"trebuchet ms", verdana, …` — none of which we ship — so the
// labels would render blank. Override every text-bearing element to use
// "Roboto" (our embedded Roboto Condensed).
function forceRegisteredFont(svg: SVGElement): void {
  for (const el of svg.querySelectorAll<SVGElement>('text, tspan')) {
    el.setAttribute('font-family', 'Roboto');
    el.style.removeProperty('font-family');
  }
}

// Mermaid sets `stroke-dasharray="1 0"` (or similar) directly on the arrow
// marker path inside <defs>. PDFKit's `dash()` rejects any zero component,
// so strip those values everywhere — both the SVG attribute form and the
// inline-style form — and let the line render solid.
function scrubInvalidDasharrays(svg: SVGElement): void {
  for (const el of svg.querySelectorAll<SVGElement>('*')) {
    const attrVal = el.getAttribute('stroke-dasharray');
    if (attrVal && !isValidDasharray(attrVal)) {
      el.removeAttribute('stroke-dasharray');
    }
    const inline = el.style.strokeDasharray;
    if (inline && !isValidDasharray(inline)) {
      el.style.removeProperty('stroke-dasharray');
    }
  }
}

// SVG presentation attributes pdfmake honours. We copy each from the
// element's computed style, overwriting any existing attribute — the
// browser's computed value matches what the preview actually paints, and
// trusting attribute defaults breaks elements like sequence-diagram
// message lines (mermaid emits them without a stroke attribute, then
// styles them via a CSS rule we strip).
const SVG_PRESENTATION_ATTRS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
] as const;

function inlineComputedStyles(svg: SVGElement): void {
  for (const el of svg.querySelectorAll<SVGElement>('*')) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'style' || tag === 'defs') continue;
    const computed = globalThis.getComputedStyle(el);
    for (const attr of SVG_PRESENTATION_ATTRS) {
      const value = computed.getPropertyValue(attr).trim();
      if (!value) continue;
      // PDFKit (pdfmake's backend) rejects any stroke-dasharray with a 0
      // component ("lengths must be numeric and greater than zero"). The
      // browser often returns "1 0" or "0" for solid strokes — skip them
      // so the line just renders solid.
      if (attr === 'stroke-dasharray' && !isValidDasharray(value)) continue;
      el.setAttribute(attr, value);
    }
  }
}

function isValidDasharray(value: string): boolean {
  if (value === 'none' || value === '0') return false;
  const parts = value.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => {
    const n = Number.parseFloat(p);
    return Number.isFinite(n) && n > 0;
  });
}

function collectMermaidSources(tokens: Token[], out: Set<string>): void {
  for (const tok of tokens) {
    if (tok.type === 'code' && (tok as Tokens.Code).lang === 'mermaid') {
      out.add((tok as Tokens.Code).text);
    }
    const nested = (tok as { tokens?: Token[] }).tokens;
    if (nested) collectMermaidSources(nested, out);
    if (tok.type === 'list') {
      for (const item of (tok as Tokens.List).items) {
        collectMermaidSources(item.tokens ?? [], out);
      }
    }
  }
}

// Resets the bottom margin of the very last block so the page break logic
// doesn't add a phantom trailing page when the previous content ends near
// the bottom of a page.
function clearTrailingMargin(content: Content[]): void {
  const last = content.at(-1);
  if (!last || typeof last !== 'object' || Array.isArray(last)) return;
  const obj = last as { margin?: number | [number, number, number, number] };
  if (typeof obj.margin === 'number') {
    obj.margin = [obj.margin, obj.margin, obj.margin, 0];
  } else if (Array.isArray(obj.margin)) {
    obj.margin = [obj.margin[0], obj.margin[1], obj.margin[2], 0];
  } else {
    obj.margin = [0, 0, 0, 0];
  }
}

// Inserts the centered author/organization/date block right after the first
// h1 in the produced content. If there is no h1, prepends it at the top of
// the document. No-op when no metadata is enabled.
function insertMetadataBlock(
  content: Content[],
  tokens: Token[],
  settings: PdfSettings,
): void {
  const lines = metadataLines(settings);
  if (lines.length === 0) return;
  const block: Content = {
    stack: lines.map((line) => ({ text: line.text, bold: line.bold })),
    style: 'metadata',
    margin: [0, 4, 0, 12],
  };
  // Walk the original tokens in parallel with the produced content; each
  // non-skipped token corresponds to one slot in `content`. We need this to
  // locate the first h1's position in `content`.
  let contentIdx = 0;
  for (const tok of tokens) {
    const skipped = tok.type === 'space' || tok.type === 'html';
    if (
      !skipped &&
      tok.type === 'heading' &&
      (tok as Tokens.Heading).depth === 1
    ) {
      content.splice(contentIdx + 1, 0, block);
      return;
    }
    if (!skipped) contentIdx += 1;
  }
  content.unshift(block);
}

function buildPageNumber(
  s: PdfSettings,
): Pick<TDocumentDefinitions, 'header' | 'footer'> {
  const pn = s.pageNumber;
  if (pn.position === 'none') return {};

  const [vSide, hSide] = pn.position.split('-') as [
    'top' | 'bottom',
    'left' | 'center' | 'right',
  ];

  const marginMm = vSide === 'top' ? s.margins.top : s.margins.bottom;
  const marginPt = mmToPt(marginMm);
  const fontSize = pn.style.fontSize;
  // Center the text vertically in the page margin: y = marginPt/2 minus half
  // the line height. fontSize ≈ ascent+descent in pt, so / 2 is a fair
  // approximation for visual centering.
  const verticalOffset = Math.max(0, marginPt / 2 - fontSize / 2);

  const renderer = (currentPage: number) => ({
    text: String(currentPage),
    alignment: hSide,
    fontSize,
    italics: pn.style.italics,
    color: pn.style.color,
    margin: [
      mmToPt(s.margins.left),
      verticalOffset,
      mmToPt(s.margins.right),
      0,
    ] as [number, number, number, number],
  });

  return vSide === 'top' ? { header: renderer } : { footer: renderer };
}

function tokensToContent(
  tokens: Token[],
  settings: PdfSettings,
  mermaidSvgs: Map<string, RenderedMermaid>,
  mathSvgs: Map<string, RenderedMermaid>,
): Content[] {
  const out: Content[] = [];
  for (const tok of tokens) {
    const node = tokenToContent(tok, settings, mermaidSvgs, mathSvgs);
    if (node === null) continue;
    if (Array.isArray(node)) out.push(...node);
    else out.push(node);
  }
  return out;
}

function tokenToContent(
  tok: Token,
  settings: PdfSettings,
  mermaidSvgs: Map<string, RenderedMermaid>,
  mathSvgs: Map<string, RenderedMermaid>,
): Content | Content[] | null {
  switch (tok.type) {
    case 'space':
      return null;

    case 'heading': {
      const h = tok as Tokens.Heading;
      return {
        text: renderInline(
          h.tokens ?? [{ type: 'text', raw: h.text, text: h.text } as Token],
        ),
        style: `h${h.depth}`,
      };
    }

    case 'paragraph': {
      const p = tok as Tokens.Paragraph;
      const inlineTokens = p.tokens ?? [];
      // pdfmake has no real inline-image support, so we walk the paragraph
      // tokens in source order and split into text runs and image blocks.
      // Walking in order preserves the user's "image then caption"
      // (or "caption then image") layout.
      const cw = contentWidthPt(settings);
      const blocks: Content[] = [];
      let textBuf: Token[] = [];

      const flushText = () => {
        if (textBuf.length === 0) return;
        const hasContent = textBuf.some(
          (t) =>
            !(t.type === 'text' && /^\s*$/.test((t as Tokens.Text).text)),
        );
        if (hasContent) {
          blocks.push({ text: renderInline(textBuf), style: 'paragraph' });
        }
        textBuf = [];
      };

      for (const t of inlineTokens) {
        if (t.type === 'image') {
          flushText();
          const img = t as Tokens.Image;
          blocks.push({
            image: img.href,
            fit: [cw, cw * 3] as [number, number],
            alignment: 'center' as const,
            // Initial margin; tightened or expanded below depending on
            // whether this image is alone in its paragraph or part of a
            // mixed run.
            margin: [0, 0, 0, 0] as [number, number, number, number],
          });
        } else {
          textBuf.push(t);
        }
      }
      flushText();

      if (blocks.length === 0) {
        return { text: renderInline(inlineTokens), style: 'paragraph' };
      }

      tightenBlocks(blocks);
      return blocks.length === 1 ? blocks[0] : blocks;
    }

    case 'code': {
      const c = tok as Tokens.Code;
      if (c.lang === 'mermaid') {
        const entry = mermaidSvgs.get(c.text);
        if (entry) {
          const maxW = contentWidthPt(settings) * settings.mermaidMaxWidthPct;
          const maxH = contentHeightPt(settings) * settings.mermaidMaxHeightPct;
          // scale = min(a, maxW/w, maxH/h): upscale up to `mermaidMaxScale`
          // but never beyond either bound. Equivalent to picking f ∈ [0,1]
          // such that f·a·w ≤ maxW and f·a·h ≤ maxH, then scale = f·a.
          const scale = Math.min(
            settings.mermaidMaxScale,
            maxW / entry.width,
            maxH / entry.height,
          );
          const w = entry.width * scale;
          const h = entry.height * scale;
          // Wrap the SVG in a borderless 3-column table: empty `*` on each
          // side, fixed-width SVG cell in the middle. Two reasons for the
          // table dance:
          //   1. A bare `{svg, width, height}` makes pdfmake's layout
          //      reserve more vertical space than it draws and force a
          //      page break before fairly small diagrams.
          //   2. `alignment: 'center'` is ignored on a top-level block —
          //      the `*` star columns are how you actually centre a
          //      narrower element on the page in pdfmake.
          return {
            table: {
              widths: ['*', w, '*'],
              body: [
                [
                  { text: '' },
                  { svg: entry.svg, width: w, height: h },
                  { text: '' },
                ],
              ],
            },
            layout: 'noBorders',
            margin: [0, 6, 0, 6] as [number, number, number, number],
          };
        }
        // Render failed: fall back to showing the source as a code block
        // so the user notices and can fix the syntax.
      }
      return { text: decodeEntities(c.text), style: 'codeBlock' };
    }

    case 'mathBlock': {
      const text = (tok as unknown as { text: string }).text;
      const entry = mathSvgs.get(text);
      if (!entry) {
        // MathJax couldn't parse the source: fall back to showing the
        // raw TeX as a code block so the user sees something to fix.
        return { text, style: 'codeBlock' };
      }
      // entry.width / entry.height are already in PDF points
      // (preRenderMathBlocks converted from MathJax's ex units against the
      // body font size). Only shrink if a very wide formula would
      // overflow the column.
      const cw = contentWidthPt(settings);
      const fit = Math.min(1, cw / entry.width);
      const w = entry.width * fit;
      const h = entry.height * fit;
      return {
        table: {
          widths: ['*', w, '*'],
          body: [
            [
              { text: '' },
              { svg: entry.svg, width: w, height: h },
              { text: '' },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 6, 0, 6] as [number, number, number, number],
      };
    }

    case 'blockquote': {
      const b = tok as Tokens.Blockquote;
      const inner = tokensToContent(
        b.tokens ?? [],
        settings,
        mermaidSvgs,
        mathSvgs,
      );
      // Wrap the quote in a 1-cell table so we can paint a left bar via a
      // custom layout. pdfmake doesn't support per-element borders outside
      // of tables.
      const barColor = settings.styles.quote.barColor;
      return {
        table: { widths: ['*'], body: [[{ stack: inner, style: 'blockquote' }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (i: number) => (i === 0 ? 3 : 0),
          vLineColor: () => barColor,
          paddingLeft: () => 11,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 6],
      };
    }

    case 'list': {
      const l = tok as Tokens.List;
      const items = l.items.map((item) =>
        listItemToContent(item, settings, mermaidSvgs, mathSvgs),
      );
      return l.ordered ? { ol: items } : { ul: items };
    }

    case 'hr':
      return {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 4,
            x2: 515,
            y2: 4,
            lineWidth: 0.5,
            lineColor: '#d0d7de',
          },
        ],
        margin: [0, 4, 0, 8],
      };

    case 'html':
      // MVP: ignore raw HTML.
      return null;

    case 'text': {
      // Block-level "text" token (rare top-level, common inside list items).
      const t = tok as Tokens.Text;
      const inline = t.tokens
        ? renderInline(t.tokens)
        : renderInline([{ type: 'text', raw: t.text, text: t.text } as Token]);
      return { text: inline, style: 'paragraph' };
    }

    default:
      return null;
  }
}

function listItemToContent(
  item: Tokens.ListItem,
  settings: PdfSettings,
  mermaidSvgs: Map<string, RenderedMermaid>,
  mathSvgs: Map<string, RenderedMermaid>,
): Content {
  const blocks = tokensToContent(
    item.tokens ?? [],
    settings,
    mermaidSvgs,
    mathSvgs,
  );
  if (blocks.length === 0) return '';
  if (blocks.length === 1) return blocks[0]!;
  return { stack: blocks };
}

// --- inline rendering ----------------------------------------------------

function renderInline(tokens: Token[], style: InlineStyle = {}): InlineRun[] {
  const out: InlineRun[] = [];
  for (const tok of tokens) {
    const run = inlineTokenToRun(tok, style);
    if (run === null) continue;
    if (Array.isArray(run)) out.push(...run);
    else out.push(run);
  }
  return out;
}

function inlineTokenToRun(
  tok: Token,
  style: InlineStyle,
): InlineRun | InlineRun[] | null {
  switch (tok.type) {
    case 'text': {
      const t = tok as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) return renderInline(t.tokens, style);
      return applyStyle(decodeEntities(t.text), style);
    }
    case 'escape':
      return applyStyle(decodeEntities((tok as Tokens.Escape).text), style);

    case 'strong': {
      const s = tok as Tokens.Strong;
      return renderInline(s.tokens ?? [], { ...style, bold: true });
    }
    case 'em': {
      const e = tok as Tokens.Em;
      return renderInline(e.tokens ?? [], { ...style, italics: true });
    }
    case 'del': {
      const d = tok as Tokens.Del;
      return renderInline(d.tokens ?? [], { ...style, decoration: 'lineThrough' });
    }
    case 'codespan':
      return applyStyle(decodeEntities((tok as Tokens.Codespan).text), {
        ...style,
        style: 'code',
      });

    case 'link': {
      const l = tok as Tokens.Link;
      return renderInline(l.tokens ?? [], {
        ...style,
        link: l.href,
        style: 'link',
      });
    }

    case 'br':
      return { text: '\n' };

    case 'html':
      return null;

    default:
      return null;
  }
}

function applyStyle(text: string, style: InlineStyle): InlineRun {
  // Soft line breaks within a paragraph (a bare `\n` inside the text-token
  // value) should render as spaces — that's how Markdown renders them in
  // HTML. pdfmake would otherwise treat the `\n` as a forced line break
  // and insert a blank line of vertical space the user didn't ask for.
  // Code spans are exempt: their content may legitimately contain a `\n`.
  if (style.style !== 'code') {
    text = text.replaceAll('\n', ' ');
  }
  const segments = splitByFont(text);
  const hasStyle = !!(
    style.bold ||
    style.italics ||
    style.decoration ||
    style.link ||
    style.style
  );

  if (segments.length === 1) {
    const seg = segments[0];
    if (!seg.font && !hasStyle) return seg.text;
    return {
      text: seg.text,
      ...style,
      ...(seg.font ? { font: seg.font } : {}),
    };
  }

  // Multiple segments: emit a nested array of runs. pdfmake propagates
  // outer styles (bold, italics, decoration, link, style) to children, so
  // we don't need to repeat them on every segment.
  const runs: InlineRun[] = segments.map((seg) =>
    seg.font ? { text: seg.text, font: seg.font } : seg.text,
  );
  return hasStyle ? { text: runs, ...style } : { text: runs };
}

type FallbackFont = 'Math' | 'Symbols';

interface FontSegment {
  text: string;
  font?: FallbackFont;
}

// Order matters: we test each fallback against the codepoint and pick the
// first that has the glyph. Math is tried before Symbols because some
// characters (e.g. ⊕, ⊗) live in both fonts, and Math draws them at the
// proportions expected for mathematical use.
const FALLBACK_FONTS: ReadonlyArray<{ font: FallbackFont; family: string }> = [
  { font: 'Math', family: 'Noto Sans Math' },
  { font: 'Symbols', family: 'Noto Sans Symbols' },
];

function makeSegment(text: string, font: FallbackFont | undefined): FontSegment {
  return font ? { text, font } : { text };
}

// Splits a string into runs, marking each codepoint with the font that
// should render it. The default font is "Roboto" (Roboto Condensed); chars
// outside its glyph coverage get tagged with the first fallback that has
// them, or are left untagged (and will tofu) if no fallback covers them.
function splitByFont(text: string): FontSegment[] {
  if (text === '') return [{ text }];
  const out: FontSegment[] = [];
  let buf = '';
  let bufFont: FallbackFont | undefined;
  let started = false;
  for (const ch of text) {
    const font = pickFontFor(ch.codePointAt(0) ?? 0);
    if (started && font === bufFont) {
      buf += ch;
      continue;
    }
    if (buf) out.push(makeSegment(buf, bufFont));
    buf = ch;
    bufFont = font;
    started = true;
  }
  if (buf) out.push(makeSegment(buf, bufFont));
  return out;
}

const fontPickCache = new Map<number, FallbackFont | undefined>();

// Returns the fallback font to use for `codepoint`, or undefined when
// Roboto Condensed already has a glyph (or no fallback covers it).
function pickFontFor(codepoint: number): FallbackFont | undefined {
  if (codepoint <= 0x024f) return undefined; // ASCII + Latin Extended A/B
  if (fontPickCache.has(codepoint)) return fontPickCache.get(codepoint);
  let chosen: FallbackFont | undefined;
  if (!canvasHasGlyph(codepoint, 'Roboto Condensed')) {
    for (const { font, family } of FALLBACK_FONTS) {
      if (canvasHasGlyph(codepoint, family)) {
        chosen = font;
        break;
      }
    }
  }
  fontPickCache.set(codepoint, chosen);
  return chosen;
}

let widthCanvas: HTMLCanvasElement | null = null;

function canvasHasGlyph(codepoint: number, fontFamily: string): boolean {
  widthCanvas ??= document.createElement('canvas');
  const ctx = widthCanvas.getContext('2d');
  if (!ctx) return true; // No way to detect; assume yes to avoid breaking.
  const ch = String.fromCodePoint(codepoint);
  // Compare width with `fontFamily, monospace` against `something-fake,
  // monospace`. If the test char isn't in fontFamily, both fall through to
  // monospace and produce the same width.
  ctx.font = `64px "${fontFamily}", monospace`;
  const w1 = ctx.measureText(ch).width;
  ctx.font = '64px "__no_such_font_xyz__", monospace';
  const w2 = ctx.measureText(ch).width;
  return Math.abs(w1 - w2) > 0.5;
}
