// Markdown → LaTeX converter. Walks the token tree produced by
// marked.lexer (not marked.parse — we don't want HTML in between)
// and emits LaTeX directly. Output is a stand-alone `.tex` ready to
// compile with `pdflatex` / `xelatex`. SPEC §21.
//
// Stage A coverage: headings, paragraphs, inline runs (strong / em /
// del / code), code blocks, lists (bullet / ordered / task),
// blockquotes, links / autolinks, hr, images (placeholder) and math
// passthrough. Math back-conversion (§21.6), images bundle (§21.5)
// and the custom extensions (admonitions, footnotes, def lists,
// csv, inference) are scheduled for later stages.

import { marked, type Tokens } from 'marked';
import { formatDate, type PdfSettings } from './settings';
import { mathBodyToLatex } from './latex-math-symbols';
import { collectImageRefs } from './image';
import { getImage } from './image-store';
import { renderMermaid } from './mermaid';
import { renderChart } from './chart';

export interface LatexExportResult {
  tex: string;
  // path-relative-to-zip-root → blob. Empty when the doc references
  // no images / mermaid / chart blocks; main.ts then ships the .tex
  // alone instead of zipping.
  resources: Map<string, Blob>;
}

export async function exportLatex(
  markdown: string,
  settings: PdfSettings,
): Promise<LatexExportResult> {
  const tokens = marked.lexer(markdown);
  const ctx: Ctx = {
    settings,
    title: null,
    titleConsumed: false,
    warnings: [],
    unmappedMath: new Set(),
    resources: new Map(),
    imageBySha: new Map(),
    mermaidBySource: new Map(),
    chartBySourceInfo: new Map(),
    mermaidCount: 0,
    chartCount: 0,
    footnoteDefs: new Map(),
    footnoteSlots: new Map(),
    footnoteCount: 0,
  };
  // Sync pre-pass: build the footnoteDefs map so the very first
  // `[^id]` reference (which may sit before the matching def in
  // source order) can inline the def's content.
  collectFootnoteDefs(tokens, ctx.footnoteDefs);
  // Resolve every image / mermaid / chart in parallel so the sync
  // walk below has every blob URL ready in the lookup maps.
  await preloadResources(tokens, markdown, ctx);
  const body = renderBlocks(tokens, ctx);
  return { tex: buildDocument(ctx, body), resources: ctx.resources };
}

// ---- context ----------------------------------------------------------

interface Ctx {
  settings: PdfSettings;
  // First-h1 source text, captured the first time we see one so it
  // can feed `\title{}` and not appear in the flow.
  title: string | null;
  titleConsumed: boolean;
  warnings: string[];
  // Math characters we didn't know how to back-convert. Accumulated
  // across every $…$ / $$…$$ / ```math block, surfaced in the
  // output's top comment so the user can patch them by hand.
  unmappedMath: Set<string>;
  // Resources to bundle alongside the .tex. Keys are relative paths
  // ('images/<sha>.png', 'images/mermaid-1.svg', …); values are the
  // raw blobs. main.ts decides whether to zip based on map.size.
  resources: Map<string, Blob>;
  // SHA → relative path for img://<sha> refs we already resolved,
  // so the same image used twice ends up as one entry in the zip
  // and one \includegraphics call referencing it.
  imageBySha: Map<string, string>;
  // mermaid source string → relative path. Same source twice = one
  // SVG file, two \includegraphics.
  mermaidBySource: Map<string, string>;
  // chart source + '\n#info' → relative path. Same idea, but we
  // disambiguate by the lang qualifier (`chart line` vs `chart bar`)
  // because identical CSV with a different chart type produces a
  // different SVG.
  chartBySourceInfo: Map<string, string>;
  mermaidCount: number;
  chartCount: number;
  // Footnote machinery. We assign each id a slot number on its
  // first reference (LaTeX numbers \footnote calls in source order);
  // subsequent refs emit \footnotemark[N] using that slot.
  footnoteDefs: Map<string, FootnoteDefToken>;
  footnoteSlots: Map<string, number>;
  footnoteCount: number;
}

// Map of markdown fence languages to the `language=` value listings
// recognises out of the box. The values must match exactly one of
// the stock listings keywords (case-sensitive: "Python" not
// "python") otherwise the package aborts compilation. Aliased
// where the markdown source uses a different name from listings'.
// Anything not in this map is emitted without `language=`, which
// keeps the doc compilable at the cost of syntax colouring.
const LISTINGS_LANGUAGE_MAP: Record<string, string> = {
  c: 'C',
  'c++': 'C++',
  cpp: 'C++',
  'c#': '[Sharp]C',
  csharp: '[Sharp]C',
  java: 'Java',
  python: 'Python',
  py: 'Python',
  ruby: 'Ruby',
  perl: 'Perl',
  php: 'PHP',
  sql: 'SQL',
  html: 'HTML',
  xml: 'XML',
  tex: 'TeX',
  latex: '[LaTeX]TeX',
  lua: 'Lua',
  r: 'R',
  haskell: 'Haskell',
  hs: 'Haskell',
  ocaml: '[Objective]Caml',
  ml: 'ML',
  scala: 'Scala',
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
  pascal: 'Pascal',
  fortran: 'Fortran',
  matlab: 'Matlab',
  awk: 'Awk',
  make: 'make',
  makefile: 'make',
  lisp: 'Lisp',
  prolog: 'Prolog',
  erlang: 'erlang',
  tcl: 'tcl',
  mathematica: 'Mathematica',
  delphi: 'Delphi',
  vhdl: 'VHDL',
  verilog: 'Verilog',
  vbscript: 'VBScript',
  postscript: 'PostScript',
};

// xelatex / lualatex hand UTF-8 to listings natively, so we don't
// need the literate table that pdflatex required.
const LSTSET_BLOCK = String.raw`\lstset{
  basicstyle=\ttfamily\small,
  breaklines=true,
  frame=single,
  framesep=4pt,
}`;

// ---- document framing -------------------------------------------------

function buildDocument(ctx: Ctx, body: string): string {
  const preamble = buildPreamble(ctx);
  const titleBlock = ctx.title === null ? '' : '\\maketitle\n\n';
  const banner = buildWarningBanner(ctx);
  return `${banner}${preamble}\\begin{document}\n${titleBlock}${body}\\end{document}\n`;
}

// Top-of-file LaTeX comment listing anything the user should know
// before compiling: math characters we didn't back-convert,
// presence of SVG diagrams that need a SVG-aware compile chain.
function buildWarningBanner(ctx: Ctx): string {
  const lines: string[] = [];
  if (ctx.unmappedMath.size > 0) {
    const chars = [...ctx.unmappedMath].join(' ');
    lines.push(
      '% Caractères math non mappés (laissés tels quels — remplacez-les',
      `% par la commande LaTeX adéquate si la compilation échoue) :`,
      `%   ${chars}`,
    );
  }
  if (ctx.mermaidCount > 0 || ctx.chartCount > 0) {
    lines.push(
      '% Ce document inclut des diagrammes / graphiques au format SVG.',
      '% Le package `svg` est nécessaire et inkscape doit être accessible',
      '% en ligne de commande (passez `--shell-escape` à xelatex).',
    );
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n\n`;
}

// ---- resource preload ------------------------------------------------

// Walks the source / token tree once, collects every image SHA and
// every mermaid / chart fenced block, and resolves them in
// parallel. The sync renderer below uses the resulting maps to
// substitute paths without doing any I/O itself.
async function preloadResources(
  tokens: Tokens.Generic[],
  source: string,
  ctx: Ctx,
): Promise<void> {
  const shaSet = collectImageRefs(source);
  const mermaidSources: string[] = [];
  const chartItems: Array<{ source: string; info: string }> = [];
  collectFencedResources(tokens, mermaidSources, chartItems);

  await Promise.all([
    ...[...shaSet].map((sha) => loadImageResource(sha, ctx)),
    ...mermaidSources.map((src) => loadMermaidResource(src, ctx)),
    ...chartItems.map((it) => loadChartResource(it.source, it.info, ctx)),
  ]);
}

function collectFencedResources(
  tokens: Tokens.Generic[],
  mermaidOut: string[],
  chartOut: Array<{ source: string; info: string }>,
): void {
  for (const tok of tokens) {
    if (tok.type === 'code') {
      const c = tok as Tokens.Code;
      const lang = (c.lang ?? '').trim().split(/\s+/)[0] ?? '';
      if (lang === 'mermaid') mermaidOut.push(c.text);
      if (lang === 'chart') {
        chartOut.push({ source: c.text, info: c.lang ?? 'chart' });
      }
    } else if (tok.type === 'list') {
      for (const item of (tok as Tokens.List).items) {
        collectFencedResources(item.tokens, mermaidOut, chartOut);
      }
    } else if (tok.type === 'blockquote') {
      collectFencedResources(
        (tok as Tokens.Blockquote).tokens,
        mermaidOut,
        chartOut,
      );
    } else if (tok.type === 'admonition') {
      collectFencedResources(
        (tok as unknown as { tokens: Tokens.Generic[] }).tokens,
        mermaidOut,
        chartOut,
      );
    }
  }
}

async function loadImageResource(sha: string, ctx: Ctx): Promise<void> {
  if (ctx.imageBySha.has(sha)) return;
  const blob = await getImage(sha);
  if (!blob) {
    ctx.warnings.push(`Image ${sha.slice(0, 8)}… missing from store`);
    return;
  }
  const ext = mimeToExt(blob.type);
  const path = `images/${sha}.${ext}`;
  ctx.resources.set(path, blob);
  ctx.imageBySha.set(sha, path);
}

async function loadMermaidResource(src: string, ctx: Ctx): Promise<void> {
  if (ctx.mermaidBySource.has(src)) return;
  // Reserve the slot synchronously to keep the numbering stable
  // even when two parallel loads race for the same map.
  ctx.mermaidCount += 1;
  const path = `images/mermaid-${ctx.mermaidCount}.svg`;
  ctx.mermaidBySource.set(src, path);
  const result = await renderMermaid(src);
  if (!result.ok) {
    ctx.warnings.push(`Mermaid render failed: ${result.error}`);
    ctx.mermaidBySource.delete(src);
    return;
  }
  ctx.resources.set(
    path,
    new Blob([sanitizeSvgForInkscape(result.svg)], { type: 'image/svg+xml' }),
  );
}

async function loadChartResource(
  src: string,
  info: string,
  ctx: Ctx,
): Promise<void> {
  const key = `${info}\n${src}`;
  if (ctx.chartBySourceInfo.has(key)) return;
  ctx.chartCount += 1;
  const path = `images/chart-${ctx.chartCount}.svg`;
  ctx.chartBySourceInfo.set(key, path);
  // renderChart is sync today; await Promise.resolve so the call
  // shape matches the others if that ever changes.
  const svg = await Promise.resolve(renderChart(src, info));
  ctx.resources.set(
    path,
    new Blob([sanitizeSvgForInkscape(svg)], { type: 'image/svg+xml' }),
  );
}

// Mermaid (and occasionally chart) SVGs lean on browser-only
// features that inkscape doesn't implement:
//  - <foreignObject> wrapping HTML labels (sequence diagrams,
//    class diagrams). Inkscape silently drops them, so the labels
//    in the rendered PDF go missing.
//  - <filter> referenced by `filter=...` (drop shadows). Inkscape
//    can't apply them; they just emit a warning and skip the
//    decoration.
// We rewrite each foreignObject to a centred <text> carrying its
// plain-text content, and strip every filter so the warnings
// disappear. Position is recovered from the foreignObject's
// x/y/width/height so the label lands roughly where the original
// HTML box sat.
function sanitizeSvgForInkscape(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const NS = 'http://www.w3.org/2000/svg';

  // 1. Strip CSS properties inkscape doesn't understand
  //    (`max-width`, `background-color`) so it stops warning on
  //    every render. Also strip `display:` and `visibility:` —
  //    mermaid often pins a fallback `<text>` element to
  //    `display: none` when the SVG also contains a foreignObject
  //    carrying the same label as HTML; once we remove the
  //    foreignObject the fallback is the only label left, so it
  //    has to be visible.
  //
  //    `querySelectorAll('[style]')` matches descendants only — we
  //    have to include the root <svg> explicitly because mermaid
  //    pins `style="max-width: …"` on it.
  const styledElems: Element[] = [root, ...root.querySelectorAll('[style]')];
  for (const el of styledElems) {
    if (!el.hasAttribute('style')) continue;
    const before = el.getAttribute('style') ?? '';
    const after = before
      .replaceAll(/(?:^|;)\s*max-width\s*:[^;]*/g, '')
      .replaceAll(/(?:^|;)\s*background-color\s*:[^;]*/g, '')
      .replaceAll(/(?:^|;)\s*display\s*:[^;]*/g, '')
      .replaceAll(/(?:^|;)\s*visibility\s*:[^;]*/g, '')
      .replace(/^\s*;+/, '');
    if (after === before) continue;
    if (after.trim() === '') el.removeAttribute('style');
    else el.setAttribute('style', after);
  }
  for (const styleEl of [...root.querySelectorAll('style')]) {
    const css = styleEl.textContent ?? '';
    styleEl.textContent = css
      .replaceAll(/max-width\s*:[^;}]+;?/g, '')
      .replaceAll(/background-color\s*:[^;}]+;?/g, '')
      .replaceAll(/display\s*:[^;}]+;?/g, '')
      .replaceAll(/visibility\s*:[^;}]+;?/g, '');
  }

  // 2. Replace each <foreignObject> with a centred <text>. Font
  //    size is scaled to the foreignObject's height so labels stay
  //    readable even when adjustbox shrinks the diagram. We set an
  //    explicit fill / font-family so inkscape can't fall back to
  //    a different style than the surrounding glyphs.
  //
  //    Vertical positioning uses explicit baseline math
  //    (`y = bbox.center + 0.32 * fontSize`) rather than
  //    `dominant-baseline: middle` — inkscape's SVG → PDF path
  //    doesn't honour the attribute reliably, which left actor
  //    labels off the visible rect in sequence diagrams.
  //
  //    The replacement <text> is *appended* to the parent group
  //    (not inserted at the foreignObject's old location), so it
  //    renders last and stays on top of any sibling rect/path that
  //    would otherwise mask it. Sequence-diagram actor labels were
  //    hidden by the actor's <rect> background drawn after a
  //    leading fallback <text>; appending guarantees ours wins.
  for (const fo of [...root.querySelectorAll('foreignObject')]) {
    const x = parseFloat(fo.getAttribute('x') ?? '0');
    const y = parseFloat(fo.getAttribute('y') ?? '0');
    const w = parseFloat(fo.getAttribute('width') ?? '0');
    const h = parseFloat(fo.getAttribute('height') ?? '0');
    const text = (fo.textContent ?? '').replaceAll(/\s+/g, ' ').trim();
    const fontSize = Math.max(12, Math.min(h * 0.55, 24));
    const tx = doc.createElementNS(NS, 'text');
    tx.setAttribute('x', String(x + w / 2));
    tx.setAttribute('y', String(y + h / 2 + fontSize * 0.35));
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('font-size', String(fontSize));
    tx.setAttribute('font-family', 'DejaVu Sans, sans-serif');
    tx.setAttribute('fill', '#000');
    tx.textContent = text;
    const parent = fo.parentElement;
    fo.remove();
    if (parent) parent.appendChild(tx);
  }

  // 3. Drop drop-shadow filters — inkscape doesn't apply them and
  //    they'd just be ignored with a warning otherwise.
  for (const el of [...root.querySelectorAll('filter')]) el.remove();
  for (const el of [...root.querySelectorAll('[filter]')]) {
    el.removeAttribute('filter');
  }
  // 4. Force a dark fill on every <text> / <tspan> that doesn't
  //    already carry one. Why: mermaid's sequence diagrams share
  //    the `.actor` class between a light-grey background <rect>
  //    and the <text> label sitting on it; mermaid disambiguates
  //    via `text.actor>tspan{fill:#333}`, but inkscape's CSS
  //    doesn't always honour the descendant combinator, so the
  //    tspan inherits the rect's `fill:#eee` and the label
  //    vanishes into the background. Inline `style` has the
  //    highest priority in CSS specificity and always wins.
  //
  //    While we're walking texts, also resolve `em` units in `dy`
  //    / `dx` attributes against the element's font-size — inkscape
  //    treats those as 0 instead of "1× font-size", which makes
  //    mermaid's message labels (positioned via `dy="1em"` to sit
  //    just above the arrow) appear far too high.
  for (const el of [...root.querySelectorAll('text, tspan')]) {
    const before = el.getAttribute('style') ?? '';
    if (!/(?:^|[\s;])fill\s*:/i.test(before)) {
      el.setAttribute('style', before ? `${before};fill:#333` : 'fill:#333');
    }
    resolveEmUnits(el);
  }
  return new XMLSerializer().serializeToString(root);
}

// Two fixes rolled into one:
//   (a) `dy="1em"` / `dx="0.5em"` use CSS units that inkscape
//       silently drops; resolve them against the element's
//       font-size first.
//   (b) Inkscape only honours `dy` / `dx` on `<tspan>`, not on
//       `<text>` directly. For `<text>` elements we therefore
//       absorb the resolved offset into the base `y` / `x`
//       coordinate so the rendered position matches the browser's.
//       (Mermaid's sequence-diagram message labels are written
//       as `<text y="80" dy="1em">…</text>`; we rewrite to
//       `<text y="96">…</text>`.)
function resolveEmUnits(el: Element): void {
  const fontSize = readFontSize(el) ?? 16;
  for (const attr of ['dy', 'dx']) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    const em = /^([+-]?\d*\.?\d+)em$/i.exec(raw.trim());
    if (!em) continue;
    el.setAttribute(attr, String(parseFloat(em[1]) * fontSize));
  }
  if (el.tagName.toLowerCase() !== 'text') return;
  for (const [delta, base] of [
    ['dy', 'y'],
    ['dx', 'x'],
  ] as const) {
    const d = el.getAttribute(delta);
    const b = el.getAttribute(base);
    if (!d || !b) continue;
    const dN = parseFloat(d);
    const bN = parseFloat(b);
    if (!Number.isFinite(dN) || !Number.isFinite(bN)) continue;
    el.setAttribute(base, String(bN + dN));
    el.removeAttribute(delta);
  }
}

function readFontSize(el: Element): number | null {
  const style = el.getAttribute('style') ?? '';
  const m = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*(?:px|pt)?/i.exec(style);
  if (m) return parseFloat(m[1]);
  const attr = el.getAttribute('font-size');
  if (attr) {
    const v = parseFloat(attr);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// Maps a Blob mime type to a file extension. Falls back to 'bin'
// for the unexpected — the user will see it in the warning banner
// and can rename if needed.
function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

// ---- custom-token types ------------------------------------------------

// Custom tokens declared by marked-config.ts; we re-declare just
// the shape we need to read here so we don't have to import types
// across module boundaries.
interface AdmonitionLikeToken {
  type: 'admonition';
  raw: string;
  klass: string;
  customTitle: string | null;
  tokens: Tokens.Generic[];
}

interface FootnoteRefToken {
  type: 'footnoteRef';
  raw: string;
  id: string;
  isFirst: boolean;
}

interface FootnoteDefToken {
  type: 'footnoteDef';
  raw: string;
  id: string;
  tokens: Tokens.Generic[];
}

interface DefListLikeToken {
  type: 'defList';
  raw: string;
  items: Array<{
    termTokens: Tokens.Generic[];
    defsTokens: Tokens.Generic[][];
  }>;
}

// ---- admonitions ------------------------------------------------------

// Maps each ::: class to its LaTeX rendering. `env` means an
// amsthm-style environment (the preamble declares the matching
// \newtheorem); `box` means a coloured tcolorbox with the given
// background/frame colour pair. Default title is used when the user
// didn't write a custom title after the class name.
interface AdmonitionMapping {
  kind: 'env' | 'box';
  env?: string;
  defaultTitle?: string;
  bg?: string;
  frame?: string;
}

const ADMONITION_MAP: Record<string, AdmonitionMapping> = {
  // amsthm environments
  theorem: { kind: 'env', env: 'theorem' },
  lemma: { kind: 'env', env: 'lemma' },
  proposition: { kind: 'env', env: 'proposition' },
  corollary: { kind: 'env', env: 'corollary' },
  definition: { kind: 'env', env: 'definition' },
  example: { kind: 'env', env: 'example' },
  remark: { kind: 'env', env: 'remark' },
  proof: { kind: 'env', env: 'proof', defaultTitle: 'Démonstration' },
  // tcolorbox callouts (background + frame xcolor names with !blend)
  note: { kind: 'box', defaultTitle: 'Note', bg: 'blue!5', frame: 'blue!60' },
  tip: { kind: 'box', defaultTitle: 'Astuce', bg: 'green!5', frame: 'green!60' },
  warning: {
    kind: 'box',
    defaultTitle: 'Avertissement',
    bg: 'orange!5',
    frame: 'orange!70',
  },
  caution: {
    kind: 'box',
    defaultTitle: 'Attention',
    bg: 'red!5',
    frame: 'red!70',
  },
  important: {
    kind: 'box',
    defaultTitle: 'Important',
    bg: 'violet!5',
    frame: 'violet!70',
  },
};

function renderAdmonition(tok: AdmonitionLikeToken, ctx: Ctx): string {
  const mapping = ADMONITION_MAP[tok.klass.toLowerCase()];
  // Render the body once — used inside both environment variants.
  const body = renderBlocks(tok.tokens, ctx).trimEnd();
  if (mapping?.kind === 'env' && mapping.env) {
    const env = mapping.env;
    // amsthm theorems take an *optional* title in square brackets
    // alongside their auto-numbering. We pass the user's custom
    // title there ; the default class title is already on the env.
    const opt = tok.customTitle ? `[${escapeLatex(tok.customTitle)}]` : '';
    return `\\begin{${env}}${opt}\n${body}\n\\end{${env}}\n\n`;
  }
  // Generic / unknown class → tcolorbox callout.
  const title =
    tok.customTitle ?? mapping?.defaultTitle ?? cap(tok.klass);
  const bg = mapping?.bg ?? 'gray!5';
  const frame = mapping?.frame ?? 'gray!50';
  const titleOpt = title ? `, title=${escapeLatex(title)}` : '';
  return [
    `\\begin{tcolorbox}[breakable, colback=${bg}, colframe=${frame}${titleOpt}]`,
    body,
    `\\end{tcolorbox}`,
    '',
    '',
  ].join('\n');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- footnotes --------------------------------------------------------

// Pre-pass walker: collects every `footnoteDef` in the doc into a
// map by id, so the first `footnoteRef` we hit can inline the def's
// content. Recurses into list items / blockquotes / admonitions
// where a def could plausibly live, but skips deeper nesting that
// the marked extension doesn't actually use.
function collectFootnoteDefs(
  tokens: Tokens.Generic[],
  out: Map<string, FootnoteDefToken>,
): void {
  for (const tok of tokens) {
    if (tok.type === 'footnoteDef') {
      const t = tok as unknown as FootnoteDefToken;
      out.set(t.id, t);
    } else if (tok.type === 'list') {
      for (const item of (tok as Tokens.List).items) {
        collectFootnoteDefs(item.tokens, out);
      }
    } else if (tok.type === 'blockquote') {
      collectFootnoteDefs((tok as Tokens.Blockquote).tokens, out);
    } else if (tok.type === 'admonition') {
      collectFootnoteDefs(
        (tok as unknown as AdmonitionLikeToken).tokens,
        out,
      );
    }
  }
}

// First reference for an id emits `\footnote{<inlined body>}` and
// records the slot number; subsequent references for the same id
// emit `\footnotemark[N]`. Slot numbering assumes LaTeX numbers
// footnotes in document order, which holds inside a single
// \section/article.
function renderFootnoteRef(tok: FootnoteRefToken, ctx: Ctx): string {
  const recorded = ctx.footnoteSlots.get(tok.id);
  if (recorded !== undefined) return `\\footnotemark[${recorded}]`;
  const def = ctx.footnoteDefs.get(tok.id);
  ctx.footnoteCount += 1;
  const slot = ctx.footnoteCount;
  ctx.footnoteSlots.set(tok.id, slot);
  if (!def) {
    ctx.warnings.push(`Footnote ${tok.id} has no definition`);
    return `\\footnote{[définition manquante : ${escapeLatex(tok.id)}]}`;
  }
  // The def's body is usually a single paragraph token — flatten
  // any block content (paragraphs / lists / etc.) into inline so
  // it fits inside \footnote{}.
  const body = renderFootnoteBody(def.tokens, ctx);
  return `\\footnote{${body}}`;
}

// Footnote bodies live inline so we can't emit \begin{itemize}…
// Inside one. Use renderInline for the common single-paragraph
// case ; concatenate paragraph contents with `\par` for anything
// fancier.
function renderFootnoteBody(
  tokens: Tokens.Generic[],
  ctx: Ctx,
): string {
  const parts: string[] = [];
  for (const tok of tokens) {
    if (tok.type === 'paragraph') {
      parts.push(renderInline((tok as Tokens.Paragraph).tokens ?? [], ctx));
    } else if (tok.type === 'text') {
      const t = tok as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) {
        parts.push(renderInline(t.tokens, ctx));
      } else {
        parts.push(escapeLatex(t.text));
      }
    } else if (tok.type === 'space') {
      // skip
    } else {
      // Anything else (lists, code blocks, …) is summarised raw.
      // Footnotes really aren't meant to host structural content.
      parts.push(escapeLatex(tok.raw ?? ''));
    }
  }
  return parts.join('\\par ');
}

// ---- definition lists -------------------------------------------------

function renderDefList(tok: DefListLikeToken, ctx: Ctx): string {
  const lines: string[] = ['\\begin{description}'];
  for (const item of tok.items) {
    const term = renderInline(item.termTokens, ctx);
    for (const defTokens of item.defsTokens) {
      // Each def is rendered inline; the description env expects a
      // single body per \item, so multiple defs are joined with \par.
      const def = renderInline(defTokens, ctx);
      lines.push(`  \\item[${term}] ${def}`);
    }
  }
  lines.push('\\end{description}', '');
  return lines.join('\n');
}

// ---- pipe tables -----------------------------------------------------

function renderTable(tok: Tokens.Table, ctx: Ctx): string {
  const cols = tok.header.length;
  const align = tok.align ?? [];
  // tabularx with X columns so long cells wrap instead of
  // overflowing the right margin. Alignment is honoured via the
  // \arraybackslash forms; default is ragged-right because forced
  // justification inside a narrow column produces ugly word-spacing.
  const colSpec = (a: 'center' | 'left' | 'right' | null | undefined): string => {
    if (a === 'center') return '>{\\centering\\arraybackslash}X';
    if (a === 'right') return '>{\\raggedleft\\arraybackslash}X';
    return '>{\\raggedright\\arraybackslash}X';
  };
  const spec =
    align.length > 0
      ? align.map(colSpec).join('')
      : Array<string>(cols).fill(colSpec('left')).join('');
  const renderRow = (row: Tokens.TableCell[]): string =>
    row.map((c) => renderInline(c.tokens, ctx)).join(' & ') + ' \\\\';
  const lines: string[] = [];
  lines.push(`\\begin{tabularx}{\\textwidth}{${spec}}`);
  lines.push('  \\toprule');
  lines.push(`  ${renderRow(tok.header)}`);
  lines.push('  \\midrule');
  for (const row of tok.rows) lines.push(`  ${renderRow(row)}`);
  lines.push('  \\bottomrule');
  lines.push('\\end{tabularx}');
  lines.push('', '');
  return lines.join('\n');
}

// ---- CSV / TSV --------------------------------------------------------

// Mini RFC-4180-ish parser: handles double-quoted fields with `""`
// inside. Doesn't handle newlines inside quoted fields — the same
// constraint as marked-config's renderer.
function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else if (c === '"' && cur.trim() === '') {
      inQuote = true;
    } else if (c === sep) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function renderDataTableLatex(src: string, sep: string): string {
  const rows = src
    .replaceAll(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => parseCsvLine(l, sep));
  if (rows.length === 0) return '';
  const cols = rows[0].length;
  const spec = 'l'.repeat(cols);
  const fmt = (row: string[]): string =>
    row.map((c) => escapeLatex(c)).join(' & ') + ' \\\\';
  const lines: string[] = [];
  lines.push(`\\begin{center}`);
  lines.push(`\\begin{tabular}{${spec}}`);
  lines.push(`  \\toprule`);
  lines.push(`  ${fmt(rows[0])}`);
  lines.push(`  \\midrule`);
  for (const r of rows.slice(1)) lines.push(`  ${fmt(r)}`);
  lines.push(`  \\bottomrule`);
  lines.push(`\\end{tabular}`);
  lines.push(`\\end{center}`);
  lines.push('', '');
  return lines.join('\n');
}

// ---- inference --------------------------------------------------------

// Same split logic as marked-config.renderInference but emits LaTeX
// directly (display math wrapping a \dfrac). Premises and
// conclusion travel through convertMath so the Unicode operators
// the user typed get back-converted.
function renderInferenceBlock(src: string, info: string, ctx: Ctx): string {
  const labelMatch = /^inference\s*(.*)$/.exec(info);
  const rawLabel = labelMatch ? labelMatch[1].trim() : '';
  const lines = src.replaceAll(/\r\n?/g, '\n').split('\n');
  const barIndex = lines.findIndex((l) => /^\s*-{3,}\s*$/.test(l));
  if (barIndex === -1) {
    // No bar — fall back to display math with the whole body.
    return emitDisplayMath(convertMath(src.trim(), ctx));
  }
  const QUAD = ' \\quad ';
  const premises = lines
    .slice(0, barIndex)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .flatMap((l) => l.split(';').map((s) => s.trim()).filter((s) => s !== ''))
    .map((p) => convertMath(p, ctx))
    .join(QUAD);
  const conclusion = lines
    .slice(barIndex + 1)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l) => convertMath(l, ctx))
    .join(QUAD);
  let latex = `\\dfrac{${premises}}{${conclusion}}`;
  if (rawLabel !== '') {
    const stripped = rawLabel.replaceAll(/^[([{]\s*|\s*[)\]}]$/g, '').trim();
    if (stripped !== '') {
      latex += ` \\quad \\textsf{(${escapeLatex(stripped)})}`;
    }
  }
  return emitDisplayMath(latex);
}

// Wraps a math body in display math (\[..\]) unless it already
// starts with a display environment (\begin{align*}, \begin{equation},
// \begin{gather}, \begin{multline}, …) — wrapping such bodies
// triggers "Erroneous nesting of equation structures" because
// amsmath forbids nesting display envs.
function emitDisplayMath(body: string): string {
  const trimmed = body.trim();
  if (
    /^\\begin\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat)\*?\}/.test(
      trimmed,
    )
  ) {
    return `${trimmed}\n\n`;
  }
  return `\\[\n${trimmed}\n\\]\n\n`;
}

// Applies the Unicode → LaTeX table to a math body, accumulating
// unmapped characters in the context for the top-of-file banner.
function convertMath(input: string, ctx: Ctx): string {
  const result = mathBodyToLatex(input);
  for (const ch of result.unmapped) ctx.unmappedMath.add(ch);
  return result.text;
}

function buildPreamble(ctx: Ctx): string {
  const s = ctx.settings;
  const authorLines = metadataAuthor(s);
  const dateStr = metadataDate(s);
  const title = ctx.title ?? '';
  // Pull `svg` only when the doc actually carries SVGs — it adds
  // an inkscape dependency we don't want to force on docs that
  // don't need it.
  const needsSvg = ctx.mermaidCount > 0 || ctx.chartCount > 0;
  const svgLine = needsSvg ? `\\usepackage{svg}` : '';
  return [
    `% md2pdf — export LaTeX (cible : xelatex ou lualatex).`,
    `% La compilation avec pdflatex échouera : fontspec + UTF-8 natif`,
    `% dans les blocs de code requièrent xelatex / lualatex.`,
    `\\documentclass[11pt,a4paper]{article}`,
    `\\usepackage{fontspec}`,
    // Latin Modern ships with xelatex but lacks box-drawing and a
    // good chunk of the arrow block. DejaVu covers them and is
    // ubiquitous on Linux / macOS / Windows; if it isn't installed
    // we fall back silently to the default font and live with the
    // "Missing character" warnings.
    `\\IfFontExistsTF{DejaVu Serif}{\\setmainfont{DejaVu Serif}}{}`,
    `\\IfFontExistsTF{DejaVu Sans}{\\setsansfont{DejaVu Sans}}{}`,
    `\\IfFontExistsTF{DejaVu Sans Mono}{\\setmonofont{DejaVu Sans Mono}}{}`,
    svgLine,
    // babel-french lives in texlive-lang-french; skip it
    // silently when absent so the document still compiles on a
    // minimal install (the user keeps English-style spacing).
    `\\IfFileExists{french.ldf}{\\usepackage[french]{babel}}{}`,
    `\\usepackage{amsmath,amssymb,amsthm}`,
    `\\usepackage{stmaryrd}`,
    `\\usepackage{graphicx}`,
    `\\usepackage[export]{adjustbox}`,
    `\\usepackage{hyperref}`,
    `\\usepackage{xcolor}`,
    `\\usepackage{listings}`,
    `\\usepackage{enumitem}`,
    `\\usepackage{booktabs}`,
    `\\usepackage{tabularx}`,
    `\\usepackage[normalem]{ulem}`,
    `\\usepackage[breakable,skins]{tcolorbox}`,
    `\\usepackage{newunicodechar}`,
    ``,
    `% DejaVu Serif (our main text font) doesn't ship the Unicode`,
    `% math-bracket / logic glyphs that show up in our prose (e.g.`,
    `% explanations of the editor's ligatures). Redirect each known`,
    `% glyph to its LaTeX command via \\ensuremath, so it renders`,
    `% from the math font even when typed in normal text.`,
    `\\newunicodechar{⟦}{\\ensuremath{\\llbracket}}`,
    `\\newunicodechar{⟧}{\\ensuremath{\\rrbracket}}`,
    `\\newunicodechar{⟨}{\\ensuremath{\\langle}}`,
    `\\newunicodechar{⟩}{\\ensuremath{\\rangle}}`,
    `\\newunicodechar{⊢}{\\ensuremath{\\vdash}}`,
    `\\newunicodechar{⊣}{\\ensuremath{\\dashv}}`,
    `\\newunicodechar{⊨}{\\ensuremath{\\models}}`,
    `\\newunicodechar{⊥}{\\ensuremath{\\bot}}`,
    `\\newunicodechar{⊤}{\\ensuremath{\\top}}`,
    `\\newunicodechar{∀}{\\ensuremath{\\forall}}`,
    `\\newunicodechar{∃}{\\ensuremath{\\exists}}`,
    `\\newunicodechar{∈}{\\ensuremath{\\in}}`,
    `\\newunicodechar{∉}{\\ensuremath{\\notin}}`,
    `\\newunicodechar{∅}{\\ensuremath{\\emptyset}}`,
    `\\newunicodechar{⊂}{\\ensuremath{\\subset}}`,
    `\\newunicodechar{⊆}{\\ensuremath{\\subseteq}}`,
    `\\newunicodechar{⊃}{\\ensuremath{\\supset}}`,
    `\\newunicodechar{⊇}{\\ensuremath{\\supseteq}}`,
    `\\newunicodechar{∪}{\\ensuremath{\\cup}}`,
    `\\newunicodechar{∩}{\\ensuremath{\\cap}}`,
    `\\newunicodechar{∧}{\\ensuremath{\\land}}`,
    `\\newunicodechar{∨}{\\ensuremath{\\lor}}`,
    `\\newunicodechar{¬}{\\ensuremath{\\neg}}`,
    `\\newunicodechar{★}{\\ensuremath{\\bigstar}}`,
    `\\newunicodechar{✓}{\\ensuremath{\\checkmark}}`,
    `\\newunicodechar{✗}{\\ensuremath{\\times}}`,
    `\\newunicodechar{♥}{\\ensuremath{\\heartsuit}}`,
    `\\newunicodechar{♦}{\\ensuremath{\\diamondsuit}}`,
    `\\newunicodechar{♠}{\\ensuremath{\\spadesuit}}`,
    `\\newunicodechar{♣}{\\ensuremath{\\clubsuit}}`,
    `\\newunicodechar{⚠}{\\textbf{[!]}}`,
    ``,
    `\\hypersetup{colorlinks=true, linkcolor=blue!50!black, urlcolor=blue!50!black}`,
    LSTSET_BLOCK,
    ``,
    `% Theorem-like environments matching the ::: admonitions (§17 of`,
    `% the md2pdf SPEC). The shared counter \`theorem\` keeps lemma /`,
    `% proposition / corollary numbered in the same sequence as the`,
    `% theorems themselves, which is the usual mathematical convention.`,
    `\\newtheorem{theorem}{Théorème}`,
    `\\newtheorem{lemma}[theorem]{Lemme}`,
    `\\newtheorem{proposition}[theorem]{Proposition}`,
    `\\newtheorem{corollary}[theorem]{Corollaire}`,
    `\\theoremstyle{definition}`,
    `\\newtheorem{definition}{Définition}`,
    `\\newtheorem{example}{Exemple}`,
    `\\newtheorem{remark}{Remarque}`,
    ``,
    `\\title{${escapeLatex(title)}}`,
    `\\author{${authorLines}}`,
    `\\date{${escapeLatex(dateStr)}}`,
    ``,
    '',
  ].join('\n');
}

function metadataAuthor(s: PdfSettings): string {
  const lines: string[] = [];
  if (s.author.show && s.author.text.trim() !== '') {
    lines.push(escapeLatex(s.author.text.trim()));
  }
  if (s.organization.show && s.organization.text.trim() !== '') {
    lines.push(escapeLatex(s.organization.text.trim()));
  }
  return lines.join(' \\\\ ');
}

function metadataDate(s: PdfSettings): string {
  return formatDate(s.date) ?? '';
}

// ---- block walking ----------------------------------------------------

function renderBlocks(tokens: Tokens.Generic[], ctx: Ctx): string {
  let out = '';
  for (const tok of tokens) {
    out += renderBlock(tok, ctx);
  }
  return out;
}

function renderBlock(tok: Tokens.Generic, ctx: Ctx): string {
  switch (tok.type) {
    case 'space':
      // Blank lines between blocks; LaTeX handles them at the source
      // level same as Markdown. Two newlines suffice.
      return '\n';
    case 'heading':
      return renderHeading(tok as Tokens.Heading, ctx);
    case 'paragraph':
      return renderParagraph(tok as Tokens.Paragraph, ctx);
    case 'code':
      return renderCodeBlock(tok as Tokens.Code, ctx);
    case 'list':
      return renderList(tok as Tokens.List, ctx);
    case 'blockquote':
      return renderBlockquote(tok as Tokens.Blockquote, ctx);
    case 'hr':
      // A horizontal rule between blocks. `\hrulefill` alone would
      // sit on the baseline of an empty line; wrapping it in a
      // centered noindent paragraph keeps it readable.
      return '\n\\noindent\\hrulefill\\par\n\n';
    case 'html':
      // Raw HTML in markdown has no useful LaTeX mapping. Emit a
      // comment with the source so the user can patch it manually.
      return latexComment('inline HTML skipped', (tok as Tokens.HTML).raw);
    case 'mathBlock': {
      const body = convertMath(
        (tok as unknown as { text: string }).text,
        ctx,
      );
      return emitDisplayMath(body);
    }
    case 'def':
      // Marked link-reference definitions don't render directly —
      // they're consumed when resolving `[text][id]`. Nothing to
      // emit.
      return '';
    case 'admonition':
      return renderAdmonition(tok as AdmonitionLikeToken, ctx);
    case 'footnoteDef':
      // Definitions are consumed at footnote-ref time (we inline
      // their content into the first `\footnote{…}`). Nothing to
      // emit at block level.
      return '';
    case 'defList':
      return renderDefList(tok as DefListLikeToken, ctx);
    case 'table':
      return renderTable(tok as Tokens.Table, ctx);
    case 'text': {
      // Block-level "text" tokens appear inside loose list items —
      // their `tokens` array carries the actual inline run. Without
      // this branch, the default-case below would emit the raw
      // markdown as a comment and the item would render empty.
      const t = tok as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) {
        return `${renderInline(t.tokens, ctx)}\n\n`;
      }
      return `${escapeLatex(decodeEntities(t.text))}\n\n`;
    }
    default:
      ctx.warnings.push(`Unknown block token: ${tok.type}`);
      return latexComment(`Unknown block: ${tok.type}`, tok.raw ?? '');
  }
}

function renderHeading(tok: Tokens.Heading, ctx: Ctx): string {
  const depth = tok.depth;
  const inline = renderInline(tok.tokens ?? [], ctx);
  if (depth === 1 && !ctx.titleConsumed) {
    // First h1 fills \title{…} and disappears from the flow.
    ctx.title = inline;
    ctx.titleConsumed = true;
    return '';
  }
  // After the title is consumed we demote everything by one level
  // so h2's become \section. h1's then end up at "effective level
  // 0" — there's no \chapter in article class, so we render them
  // as unnumbered \section*{} which acts as a visually distinct
  // "part separator" without colliding with the \section numbering
  // of the h2's underneath.
  const effective = ctx.titleConsumed ? depth - 1 : depth;
  if (effective <= 0) return `\\section*{${inline}}\n\n`;
  const cmd =
    effective === 1
      ? '\\section'
      : effective === 2
        ? '\\subsection'
        : effective === 3
          ? '\\subsubsection'
          : '\\paragraph';
  return `${cmd}{${inline}}\n\n`;
}

function renderParagraph(tok: Tokens.Paragraph, ctx: Ctx): string {
  const inline = renderInline(tok.tokens ?? [], ctx);
  return `${inline}\n\n`;
}

function renderCodeBlock(tok: Tokens.Code, ctx: Ctx): string {
  // marked stores the language after the opening fence on `lang`.
  // Strip anything past the first whitespace — users sometimes type
  // ```ts copy or similar.
  const lang = (tok.lang ?? '').trim().split(/\s+/)[0] ?? '';
  // xelatex / lualatex handle UTF-8 in lstlisting natively — no
  // sanitisation needed. Pass the source through verbatim.
  const sanitizedText = tok.text;
  // ```math is the GitHub-style alias for display math; route it
  // through the same Unicode → LaTeX pipeline as $$…$$ so the
  // output is identical whichever syntax the user picked.
  if (lang === 'math') {
    return emitDisplayMath(convertMath(tok.text, ctx));
  }
  if (lang === 'mermaid') {
    return renderMermaidBlock(tok, ctx);
  }
  if (lang === 'chart') {
    return renderChartBlock(tok, ctx);
  }
  if (lang === 'csv') return renderDataTableLatex(tok.text, ',');
  if (lang === 'tsv') return renderDataTableLatex(tok.text, '\t');
  if (lang === 'inference' || (tok.lang ?? '').startsWith('inference ')) {
    return renderInferenceBlock(tok.text, tok.lang ?? 'inference', ctx);
  }
  // Only emit a `language=` option when listings actually
  // recognises the lang — otherwise it aborts with "Couldn't load
  // requested language" and breaks the whole compile. The list
  // below is the stock subset shipped by listings 1.x with a few
  // aliases for the names the markdown source typically uses (sh,
  // bash, …). Anything else falls through to the default
  // `\ttfamily` rendering, which is fine if uncoloured.
  const listingsLang = LISTINGS_LANGUAGE_MAP[lang.toLowerCase()];
  const opts = listingsLang ? `[language=${listingsLang}]` : '';
  return `\\begin{lstlisting}${opts}\n${sanitizedText}\n\\end{lstlisting}\n\n`;
}


function renderList(tok: Tokens.List, ctx: Ctx): string {
  const env = tok.ordered ? 'enumerate' : 'itemize';
  // Task lists are mixed in regular lists; we override the bullet
  // glyph item-by-item via enumitem's [label=...]. Marked sets
  // `task` and `checked` on the matched item.
  const items: string[] = [];
  for (const item of tok.items) {
    items.push(renderListItem(item, ctx));
  }
  const start =
    tok.ordered && typeof tok.start === 'number' && tok.start > 1
      ? `[start=${tok.start}]`
      : '';
  return `\\begin{${env}}${start}\n${items.join('')}\\end{${env}}\n\n`;
}

function renderListItem(item: Tokens.ListItem, ctx: Ctx): string {
  const body = renderBlocks(item.tokens, ctx).trimEnd();
  if (item.task) {
    const marker = item.checked ? '$\\boxtimes$' : '$\\square$';
    return `  \\item[${marker}] ${body}\n`;
  }
  return `  \\item ${body}\n`;
}

function renderBlockquote(tok: Tokens.Blockquote, ctx: Ctx): string {
  const inner = renderBlocks(tok.tokens, ctx).trimEnd();
  return `\\begin{quote}\n${inner}\n\\end{quote}\n\n`;
}

// ---- inline -----------------------------------------------------------

function renderInline(tokens: Tokens.Generic[], ctx: Ctx): string {
  let out = '';
  for (const tok of tokens) out += renderInlineToken(tok, ctx);
  return out;
}

function renderInlineToken(tok: Tokens.Generic, ctx: Ctx): string {
  switch (tok.type) {
    case 'text': {
      const t = tok as Tokens.Text;
      // Inline `text` tokens can carry nested children (e.g. when
      // resolving entities). Walk them if present, escape the raw
      // text otherwise. Decode HTML entities first — marked emits
      // `&#39;` `&quot;` `&gt;` etc. that would otherwise survive
      // the LaTeX escape pass intact.
      if (t.tokens && t.tokens.length > 0) return renderInline(t.tokens, ctx);
      return escapeLatex(decodeEntities(t.text));
    }
    case 'strong':
      return `\\textbf{${renderInline((tok as Tokens.Strong).tokens ?? [], ctx)}}`;
    case 'em':
      return `\\emph{${renderInline((tok as Tokens.Em).tokens ?? [], ctx)}}`;
    case 'del':
      return `\\sout{${renderInline((tok as Tokens.Del).tokens ?? [], ctx)}}`;
    case 'codespan':
      return verb(decodeEntities((tok as Tokens.Codespan).text));
    case 'br':
      return '\\\\\n';
    case 'link': {
      const t = tok as Tokens.Link;
      const inner = renderInline(t.tokens ?? [], ctx);
      // Marked tags autolinks as `link` too; in that case the
      // visible text equals the href.
      if (t.href === t.text) return `\\url{${escapeLatexUrl(t.href)}}`;
      return `\\href{${escapeLatexUrl(t.href)}}{${inner}}`;
    }
    case 'image':
      return renderImageToken(tok as Tokens.Image, ctx);
    case 'mathInline':
      return `$${convertMath((tok as unknown as { text: string }).text, ctx)}$`;
    case 'escape':
      return escapeLatex((tok as Tokens.Escape).text);
    case 'html':
      return `% inline HTML skipped: ${stripNewlines((tok as Tokens.HTML).raw)}`;
    case 'footnoteRef':
      return renderFootnoteRef(tok as unknown as FootnoteRefToken, ctx);
    default:
      ctx.warnings.push(`Unknown inline token: ${tok.type}`);
      return escapeLatex((tok as { raw?: string }).raw ?? '');
  }
}

// Resolves an `image` inline token to either an \includegraphics
// referencing a file we wrote into the resources map, or — for
// external URLs / unresolved refs — a placeholder italic note.
function renderImageToken(tok: Tokens.Image, ctx: Ctx): string {
  const href = tok.href;
  const m = /^img:\/\/([a-f0-9]+)$/.exec(href);
  if (m) {
    const path = ctx.imageBySha.get(m[1]);
    if (path) return includegraphics(path);
    // Pre-load failed (blob missing). Italic placeholder so the .tex
    // still compiles.
    return `\\textit{[${escapeLatex(tok.text || 'image manquante')}]}`;
  }
  // External URLs — no good way to bundle them; leave as a placeholder
  // pointing to the original location.
  return `\\textit{[${escapeLatex(tok.text || 'image')} — ${escapeLatex(href)}]}`;
}

// Emits the \includegraphics declaration paged with sane defaults
// (auto width/height clamped to the column). Wrapped in a centered
// figure-like environment for spacing parity with the HTML preview.
function includegraphics(path: string): string {
  return `\\begin{center}\n\\includegraphics[max width=\\textwidth, max height=0.5\\textheight, keepaspectratio]{${path}}\n\\end{center}\n\n`;
}

// Same as includegraphics but for SVG resources, routed through the
// `svg` package so xelatex can shell-escape into inkscape on the
// fly. The path can carry the .svg extension or not — \includesvg
// is tolerant.
//
// We wrap in an adjustbox so the diagram is capped to the column
// width and half the page height. Without that, narrow but tall
// diagrams (class diagrams, sequence diagrams) get stretched
// horizontally to \textwidth and their height grows
// proportionally — pages become mostly empty for one diagram.
function includesvg(path: string): string {
  return [
    '\\begin{center}',
    '\\begin{adjustbox}{max width=\\textwidth, max totalheight=0.6\\textheight}',
    `\\includesvg{${path}}`,
    '\\end{adjustbox}',
    '\\end{center}',
    '',
    '',
  ].join('\n');
}

function renderMermaidBlock(tok: Tokens.Code, ctx: Ctx): string {
  const path = ctx.mermaidBySource.get(tok.text);
  // Source comment above the include so the user can regenerate /
  // tweak the diagram from inside the .tex.
  const sourceComment = latexComment('mermaid source', tok.text).trimEnd();
  if (!path) {
    return `${sourceComment}\n\\textit{[diagramme mermaid non rendu]}\n\n`;
  }
  return `${sourceComment}\n${includesvg(path)}`;
}

function renderChartBlock(tok: Tokens.Code, ctx: Ctx): string {
  const info = tok.lang ?? 'chart';
  const key = `${info}\n${tok.text}`;
  const path = ctx.chartBySourceInfo.get(key);
  const sourceComment = latexComment(
    `chart source (${info})`,
    tok.text,
  ).trimEnd();
  if (!path) {
    return `${sourceComment}\n\\textit{[graphique non rendu]}\n\n`;
  }
  return `${sourceComment}\n${includesvg(path)}`;
}

// ---- escaping ---------------------------------------------------------

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '$': '\\$',
  '&': '\\&',
  '%': '\\%',
  '#': '\\#',
  '_': '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

export function escapeLatex(s: string): string {
  return s.replaceAll(/[\\{}$&%#_~^]/g, (c) => LATEX_ESCAPES[c] ?? c);
}

// marked tokenises text and writes `&` `<` `>` `"` `'` as HTML
// entities into `text.text` / `codespan.text` — needed for safe
// HTML rendering but wrong for LaTeX, where we want the raw glyph.
// Decode at the point we read the token's text. Also handles
// numeric (`&#39;`) and hex (`&#x27;`) references for completeness.
export function decodeEntities(s: string): string {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll(/&#(\d+);/g, (_, n: string) =>
      String.fromCodePoint(Number(n)),
    )
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    );
}

// URLs go inside \url{} / \href{…}{}. We don't want to break their
// content with full LaTeX escapes (the braces would corrupt the
// URL); only `%` and `#` need protecting because hyperref still
// treats them as catcodes inside the macro argument.
function escapeLatexUrl(s: string): string {
  return s.replaceAll(/[%#]/g, (c) => `\\${c}`);
}

// \verb is the classic LaTeX command for inline verbatim, but it
// has a sharp restriction: it CAN'T be used inside the argument of
// any macro (\item[…], \footnote{…}, \section{…}, table cells…).
// We hit that all over the place (e.g. a def-list term containing
// a codespan), so we use \texttt{} with proper escaping instead.
// The visual is the same monospace family ; only the literal
// preservation of multiple spaces / tabs differs, which doesn't
// matter for inline code.
function verb(text: string): string {
  return `\\texttt{${escapeLatex(text)}}`;
}

function stripNewlines(s: string): string {
  return s.replaceAll(/\s+/g, ' ').trim();
}

function latexComment(label: string, raw: string): string {
  const body = raw
    .split('\n')
    .map((l) => `% ${l}`)
    .join('\n');
  return `% ${label}:\n${body}\n\n`;
}
