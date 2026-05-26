/********************************* preview.ts **********************************
 *
 * Purpose: Fluid (non-paginated) HTML preview pipeline — marked → DOM,
 *   metadata block, math/mermaid placeholders, source-line annotation, styles.
 * How: A pipeline of independent `target`-mutating functions; each step
 *   walks the rendered DOM once and swaps placeholders or injects nodes.
 *
 *******************************************************************************/

import { marked } from 'marked';
import { metadataLines, type PdfSettings, type Style } from './settings';
import { parseFrontmatter, type Frontmatter } from './frontmatter';
import { blockBoxCss, inlineCss } from './style-emit';
import { renderMermaid } from './mermaid';
import { renderMath } from './math';
import { type MathFontSet } from './mathjax-fontsets';
import { quoteFontFamily } from './font-loader';

/**
 * Purpose: Heading underline CSS fragment using the editor's neutral border colour.
 * How: Emits a `border-bottom` declaration or `none` so the dynamic rule wins.
 */
function underlineRule(s: Style): string {
  return s.underline
    ? `border-bottom: 1px solid var(--border); padding-bottom: 0.2em;`
    : `border-bottom: none;`;
}

/**
 * Purpose: Per-heading family + italic + weight + text-align, overriding the
 *   static rules so the dynamic rule wins over the bold/strong + body-justify
 *   defaults.
 * How: Emits explicit `font-family` (when overridden), `font-style`,
 *   `font-weight`, `text-align`.
 */
function headingExtras(s: Style): string {
  const fam =
    s.family !== undefined && s.family.trim() !== ''
      ? `font-family: ${quoteFontFamily(s.family)}; `
      : '';
  return `${fam}font-style: ${s.italic ? 'italic' : 'normal'}; font-weight: ${s.weight ?? 500}; text-align: ${s.align ?? 'left'};`;
}

/**
 * Purpose: Asymmetric vertical spacing for a heading style, in em.
 * How: Reads `marginAbove` / `marginBelow` from the heading's Style;
 *   defaults preserved when either field is unset.
 */
function headingMargin(s: Style): string {
  return `margin: ${s.marginAbove ?? 1.6}em 0 ${s.marginBelow ?? 0.6}em;`;
}

/**
 * Purpose: Render the markdown source into the target's `innerHTML`,
 *   stripping any YAML frontmatter first and surfacing the doc title
 *   (from `title:` in the frontmatter, or fallback to the first body
 *   `<h1>`) tagged with `.doc-title` so it picks up `styles.title`.
 * How: Frontmatter parse → marked.parse on the body; if the meta has
 *   `title`, prepend a fresh `<h1.doc-title>`; otherwise promote the
 *   first body h1 to `.doc-title`.
 */
export function renderPreview(target: HTMLElement, source: string): void {
  const { meta, body } = parseFrontmatter(source);
  target.innerHTML = marked.parse(body, { async: false });
  if (meta.title) {
    const h1 = document.createElement('h1');
    h1.classList.add('doc-title');
    h1.textContent = meta.title;
    target.prepend(h1);
  } else {
    const first = target.querySelector('h1');
    if (first) first.classList.add('doc-title');
  }
}

/**
 * Purpose: Insert/refresh the centered author/organization/date block after the first h1.
 * How: Removes any prior `.preview-metadata`, builds one div per line, places after h1.
 *   `frontmatter` (optional) overrides the matching profile fields on a
 *   per-document basis — same precedence rule as `title`.
 */
export function applyPreviewMetadata(
  target: HTMLElement,
  settings: PdfSettings,
  frontmatter?: Frontmatter,
): void {
  target.querySelector('.preview-metadata')?.remove();

  const lines = metadataLines(settings, frontmatter);
  if (lines.length === 0) return;

  const block = document.createElement('div');
  block.className = 'preview-metadata';
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line.text;
    if (line.bold) div.classList.add('bold');
    block.appendChild(div);
  }

  const firstH1 = target.querySelector('h1');
  if (firstH1) {
    firstH1.after(block);
  } else {
    target.prepend(block);
  }
}

/**
 * Purpose: Stamp each top-level preview block with `data-line="N"` for scroll-sync.
 * How: Tokenise the source and pair each rendering token with a top-level child.
 */
export function annotateSourceLines(
  target: HTMLElement,
  source: string,
): void {
  const tokens = marked.lexer(source);
  const elements = Array.from(target.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && !el.classList.contains('preview-metadata'),
  );
  let elementIndex = 0;
  let line = 0;
  for (const tok of tokens) {
    // Skip token types that don't render to a DOM element of their own.
    // - 'space' / 'html' were already excluded.
    // - 'footnoteDef' is collected for the footnotes section and
    //   produces no inline output, so it would shift elementIndex past
    //   real elements if counted.
    const renders =
      tok.type !== 'space' &&
      tok.type !== 'html' &&
      tok.type !== 'footnoteDef';
    if (renders) {
      const el = elements[elementIndex];
      if (el) el.dataset.line = String(line);
      elementIndex += 1;
    }
    line += countNewlines(tok.raw);
  }
}

/**
 * Purpose: Count `\n` occurrences in a string.
 * How: Linear scan comparing each code point to 10.
 */
function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.codePointAt(i) === 10) n += 1;
  }
  return n;
}

/**
 * Purpose: Swap inline `$…$` placeholders for MathJax SVGs (or red error spans).
 * How: Query `.math-inline[data-math]`, render in parallel, set inner HTML.
 */
export async function renderMathInlines(
  target: HTMLElement,
  fontSet: MathFontSet = 'newcm',
  preamble = '',
): Promise<void> {
  const placeholders = Array.from(
    target.querySelectorAll<HTMLElement>('span.math-inline[data-math]'),
  );
  if (placeholders.length === 0) return;
  await Promise.all(
    placeholders.map(async (el) => {
      const source = el.dataset['math'] ?? '';
      const result = await renderMath(source, false, fontSet, preamble);
      if (result.ok) {
        el.innerHTML = makeIdsUnique(result.svg);
      } else {
        el.classList.add('math-error');
        el.textContent = source;
        el.title = `Erreur LaTeX : ${result.error}`;
      }
    }),
  );
}

/**
 * Purpose: Prefix every `id` and every `#id` reference in an SVG so duplicate
 *   inserts (preview + print target) don't collide on `url(#id)` resolution.
 * How: Parse, harvest ids into a map, rewrite attributes and `<style>` text.
 */
let uniqueIdCounter = 0;
function makeIdsUnique(svg: string): string {
  uniqueIdCounter += 1;
  const prefix = `mid${uniqueIdCounter}-`;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;

  // Build the id → newId map and stamp the new ids onto every element.
  const idMap = new Map<string, string>();
  for (const el of root.querySelectorAll<Element>('[id]')) {
    const oldId = el.getAttribute('id');
    if (!oldId) continue;
    const newId = prefix + oldId;
    idMap.set(oldId, newId);
    el.setAttribute('id', newId);
  }
  if (idMap.size === 0) return svg;

  // Rewrites every `#oldId` in a string to `#newId`, keeping unrelated
  // hash sequences (e.g. CSS colours `#fff`) untouched because `idMap`
  // only contains real ids harvested above.
  const rewrite = (s: string): string =>
    s.replaceAll(/#([\w-]+)/g, (match, id: string) => {
      const replaced = idMap.get(id);
      return replaced ? `#${replaced}` : match;
    });

  // 1. Attribute references (href, xlink:href, marker-end, fill,
  //    stroke, mask, clip-path, filter…). Walk every attribute that
  //    contains a `#` so we don't have to maintain a list.
  for (const el of root.querySelectorAll<Element>('*')) {
    for (const attr of el.attributes) {
      if (attr.name === 'id') continue;
      if (!attr.value.includes('#')) continue;
      const updated = rewrite(attr.value);
      if (updated !== attr.value) el.setAttribute(attr.name, updated);
    }
  }

  // 2. CSS selectors inside <style> blocks (e.g. `#mermaid-1 .node rect
  //    { fill: ... }`) — what we'd missed in the first regex pass and
  //    that made mermaid diagrams render as black rectangles.
  for (const styleEl of root.querySelectorAll<Element>('style')) {
    const css = styleEl.textContent ?? '';
    if (!css.includes('#')) continue;
    styleEl.textContent = rewrite(css);
  }

  return new XMLSerializer().serializeToString(root);
}

/**
 * Purpose: Swap `$$…$$` block placeholders for MathJax SVGs (or red error blocks).
 * How: Query `.math-block[data-math]`, render in parallel, replace inner HTML.
 */
export async function renderMathBlocks(
  target: HTMLElement,
  fontSet: MathFontSet = 'newcm',
  preamble = '',
): Promise<void> {
  const placeholders = Array.from(
    target.querySelectorAll<HTMLElement>('.math-block[data-math]'),
  );
  if (placeholders.length === 0) return;
  await Promise.all(
    placeholders.map(async (el) => {
      const source = el.dataset['math'] ?? '';
      const result = await renderMath(source, true, fontSet, preamble);
      if (result.ok) {
        el.innerHTML = makeIdsUnique(result.svg);
      } else {
        el.classList.add('math-error');
        const msg = document.createElement('div');
        msg.className = 'math-error-msg';
        msg.textContent = `Erreur LaTeX : ${result.error}`;
        const sourcePre = document.createElement('pre');
        sourcePre.textContent = source;
        el.append(msg, sourcePre);
      }
    }),
  );
}

/**
 * Purpose: Replace every ```mermaid code block with its rendered SVG (or error block).
 * How: Find `<code.language-mermaid>`, render in parallel, swap the `<pre>` for a div.
 */
export async function renderMermaidBlocks(target: HTMLElement): Promise<void> {
  const codes = Array.from(
    target.querySelectorAll<HTMLElement>('code.language-mermaid'),
  );
  if (codes.length === 0) return;
  await Promise.all(
    codes.map(async (code) => {
      const pre = code.parentElement;
      if (!pre) return;
      const source = code.textContent ?? '';
      const result = await renderMermaid(source);
      // Preserve the `data-line` attribute so scroll-sync still works after
      // the swap.
      const dataLine = pre.dataset.line;
      const wrapper = document.createElement('div');
      if (dataLine !== undefined) wrapper.dataset.line = dataLine;
      // Stash the original markdown form on the wrapper so the help
      // window's insert-button machinery can offer "insert this" on
      // a rendered diagram (otherwise the source is lost when we
      // replace the <pre><code> with the SVG below).
      wrapper.dataset.source = `\`\`\`mermaid\n${source.replace(/\n$/, '')}\n\`\`\``;
      if (result.ok) {
        wrapper.className = 'mermaid-block block-rigid';
        wrapper.innerHTML = makeIdsUnique(result.svg);
      } else {
        wrapper.className = 'mermaid-error';
        const msg = document.createElement('div');
        msg.className = 'mermaid-error-msg';
        msg.textContent = `Erreur Mermaid : ${result.error}`;
        const sourcePre = document.createElement('pre');
        sourcePre.textContent = source;
        wrapper.append(msg, sourcePre);
      }
      pre.replaceWith(wrapper);
    }),
  );
}

const PREVIEW_STYLE_ID = 'markpage-preview-styles';

/**
 * Purpose: Mirror typography fields from `PdfSettings` into the fluid HTML preview.
 * How: Rewrite a single `<style id="markpage-preview-styles">` with scoped rules.
 */
export function applyPreviewStyles(settings: PdfSettings): void {
  let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = PREVIEW_STYLE_ID;
    document.head.appendChild(el);
  }
  const s = settings.styles;
  const align = s.body.align ?? 'left';
  const f = settings.fonts;
  // Per-element family overrides the trio; the trio is the fallback
  // when the matrix leaves `family` undefined.
  const bodyName = (s.body.family ?? '').trim() || f.body;
  const codeName = (s['code-inline'].family ?? '').trim() || f.code;
  const headFam = `${quoteFontFamily(f.headings)}, "Roboto Condensed", sans-serif`;
  const bodyFam = `${quoteFontFamily(bodyName)}, "Roboto Condensed", sans-serif`;
  const codeFam = `${quoteFontFamily(codeName)}, "Roboto Mono", monospace`;
  el.textContent = `
    #preview-pane { font-family: ${bodyFam}; font-size: ${s.body.fontSize}pt; color: ${s.body.color}; line-height: ${s.body.lineHeight ?? 1.25}; }
    #preview-pane :is(h1, h2, h3, h4, h5, h6) { font-family: ${headFam}; }
    #preview-pane h1 { font-size: ${s.h1.fontSize}pt; color: ${s.h1.color}; ${underlineRule(s.h1)} ${headingExtras(s.h1)} ${headingMargin(s.h1)} }
    #preview-pane h1.doc-title { font-size: ${s.title.fontSize}pt; color: ${s.title.color}; ${underlineRule(s.title)} ${headingExtras(s.title)} ${headingMargin(s.title)} }
    #preview-pane h2 { font-size: ${s.h2.fontSize}pt; color: ${s.h2.color}; ${underlineRule(s.h2)} ${headingExtras(s.h2)} ${headingMargin(s.h2)} }
    #preview-pane h3 { font-size: ${s.h3.fontSize}pt; color: ${s.h3.color}; ${underlineRule(s.h3)} ${headingExtras(s.h3)} ${headingMargin(s.h3)} }
    #preview-pane h4 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; ${underlineRule(s.h4)} ${headingExtras(s.h4)} ${headingMargin(s.h4)} }
    #preview-pane h5,
    #preview-pane h6 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; ${headingMargin(s.h4)} }
    /* Suppress the first heading's top margin so the document doesn't
       start with empty space above the title. */
    #preview-pane > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
    #preview-pane p { margin: ${s.body.marginAbove ?? 1}em 0 ${s.body.marginBelow ?? 1}em; }
    #preview-pane :is(code, pre) { font-family: ${codeFam}; font-size: ${s['code-inline'].fontSize}pt; color: ${s['code-inline'].color}; }
    /* Inline code inside a heading: keep the mono font but track the
       heading's own font-size instead of the body-code one. */
    #preview-pane :is(h1, h2, h3, h4, h5, h6) code { font-size: inherit; }
    /* Block code: <pre> wrapper uses the code-block style box +
       per-element typography (family/fontSize/color/margins) that
       overrides the code-inline rule above for <pre> specifically.
       Tree SVG diagrams and algorithm listings share the same frame. */
    #preview-pane pre,
    #preview-pane .tree-svg-wrap,
    #preview-pane .algorithm { ${blockBoxCss(s['code-block'])} ${inlineCss(s['code-block'])} }
    #preview-pane blockquote { ${inlineCss(s.quote)} ${blockBoxCss(s.quote)} padding-left: ${s.quote.padding ?? 0.9}em; }
    /* Metadata block (author / organization / date) shown after h1. */
    #preview-pane .preview-metadata { ${inlineCss(s.metadata)} }
    /* Auto-numbered figure / algorithm / table / listing caption. */
    #preview-pane .caption { ${inlineCss(s.caption)} }
    /* Inline links — color and underline come from styles['inline-link']. */
    #preview-pane a { ${inlineCss(s['inline-link'])} text-decoration: ${s['inline-link'].underline ? 'underline' : 'none'}; }
    /* Block math, mermaid, admonitions, tables — user-configurable
       box + inline (align / margins). */
    #preview-pane .math-block { ${blockBoxCss(s['math-block'])} ${inlineCss(s['math-block'])} }
    #preview-pane .mermaid-block { ${blockBoxCss(s.mermaid)} ${inlineCss(s.mermaid)} }
    #preview-pane .admonition { ${blockBoxCss(s.callout)} ${inlineCss(s.callout)} }
    #preview-pane table { border-collapse: collapse; ${inlineCss(s.table)} ${blockBoxCss(s.table)} }
    #preview-pane p,
    #preview-pane li { text-align: ${align}; }
    /* MathJax SVGs are sized in ex units (relative to the container's
       font-size), so scaling the math wrappers' font-size resizes the
       glyphs without re-rendering. */
    #preview-pane :is(.math-inline, .math-block) { font-size: ${settings.mathScale}em; }
  `;
}

/**
 * Purpose: Generic debouncer — collapse multiple calls into one delayed invocation.
 * How: Closure over a `setTimeout` handle; latest call wins.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
