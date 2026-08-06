/********************************* preview.ts **********************************
 *
 * Purpose: Fluid (non-paginated) HTML preview pipeline — marked → DOM,
 *   metadata block, math/mermaid placeholders, source-line annotation, styles.
 * How: A pipeline of independent `target`-mutating functions; each step
 *   walks the rendered DOM once and swaps placeholders or injects nodes.
 *
 *******************************************************************************/

import { marked } from 'marked';
import {
  metadataLines,
  type HeadingNumbering,
  type PdfSettings,
  type Style,
} from './settings';
import { parseFrontmatter, type Frontmatter } from '@orlarey/markpage-render';
import { numberForRender } from './numbering';
import { wrapHeadingNumbers } from './preview-paginated';
import { blockBoxCss, capsCss, filetCss, headingNumberCss, inlineCss } from './style-emit';
import { quoteFontFamily, fontFamilyStack } from './font-loader';

/**
 * Purpose: Heading "filet" (rule) CSS fragment for the fluid editor preview.
 * How: A resolved `rule` (editor compiler) wins and uses its own colour; else
 *   the legacy `underline` boolean draws a themed `var(--border)` rule below,
 *   and the off case emits `border-bottom: none` so the dynamic rule wins.
 */
function underlineRule(s: Style): string {
  if (s.rule) return filetCss(s);
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
  return `${fam}font-style: ${s.italic ? 'italic' : 'normal'}; font-weight: ${s.weight ?? 500}; text-align: ${s.align ?? 'left'}; ${capsCss(s)}`;
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
export function renderPreview(
  target: HTMLElement,
  source: string,
  numbering?: HeadingNumbering,
): void {
  const { meta, body } = parseFrontmatter(source);
  // Heading numbering (style-driven): strip typed numbers + apply the resolved
  // directive on a COPY of the body, before parsing. Absent = legacy no-op.
  const prepared = numbering
    ? numberForRender(body, numbering.on, numbering.depth)
    : body;
  target.innerHTML = marked.parse(prepared, { async: false });
  if (meta.title) {
    const h1 = document.createElement('h1');
    h1.classList.add('doc-title');
    h1.textContent = meta.title;
    target.prepend(h1);
  } else if (!numbering) {
    // Legacy fallback: promote the first body h1 to the document title. Skipped
    // under the new model (numbering present), where H1 is NEVER the document
    // title — that role belongs to the front-matter `title:` alone.
    // Skip h1s inside a `::: background` minipage — those are backdrop content.
    const first = [...target.querySelectorAll<HTMLElement>('h1')].find(
      (h) => !h.closest('.mp-bg'),
    );
    if (first) first.classList.add('doc-title');
  }
  // Cover subtitle: a `.doc-subtitle` block right under the document title,
  // styled by the `subtitle` element (front-matter `subtitle:`).
  if (meta.subtitle) {
    const docTitle = target.querySelector('h1.doc-title');
    if (docTitle) {
      const sub = document.createElement('div');
      sub.className = 'doc-subtitle';
      sub.textContent = meta.subtitle;
      docTitle.after(sub);
    }
  }
  // Hang the heading numbers (after .doc-title is tagged, which the wrap skips).
  if (numbering?.on) wrapHeadingNumbers(target);
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

  // Document types with no cover (a letter) get no identity block: without
  // this, a letter carrying only `document-type: letter` opened on a page
  // showing the profile's placeholder author and organization.
  // A letterhead document carries its own identity: the `sender` block names
  // who is writing, with address and legal identifiers. A generated cover would
  // restate it — and, with the profile's placeholder author and organization,
  // restate it WRONGLY: a letter whose frontmatter is just
  // `document-type: letter` opened on a page reading "Prénom Nom / Mon
  // organisation".
  //
  // Keyed on the letterhead rather than on the document type on purpose: the
  // type is a semantic shorthand expanded into concrete style keys when the
  // document is written, so it is not available here — settings are derived
  // from the flattened stack patch, which has no notion of "letter". The
  // presence of a sender block is both available and more truthful.
  if (target.querySelector('.letterhead-sender, .letterhead-recipient')) return;

  const lines = metadataLines(settings, frontmatter);
  if (lines.length === 0) return;

  // The metadata is a TITLE BLOCK — it belongs under the document title. Without
  // a title (an empty or untitled document) there is nothing to caption, so show
  // nothing rather than stamping a lone author/date onto a blank page.
  const firstH1 = [...target.querySelectorAll<HTMLElement>('h1')].find(
    (h) => !h.closest('.mp-bg'),
  );
  if (!firstH1) return;

  const block = document.createElement('div');
  block.className = 'preview-metadata';
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line.text;
    if (line.bold) div.classList.add('bold');
    block.appendChild(div);
  }
  // The title block sits under the whole cover identity: title, then the
  // OPTIONAL subtitle (renderPreview inserts it right after the title), then
  // this metadata. Anchoring after the subtitle keeps the visual order
  // title → subtitle → author AND keeps the cover-break rule correct — it
  // breaks before the first block after `.preview-metadata`, so the subtitle
  // must precede the metadata, not follow it (else it is stranded off-cover).
  const sub = firstH1.nextElementSibling;
  const anchor =
    sub && sub.classList.contains('doc-subtitle') ? sub : firstH1;
  anchor.after(block);
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
  // Justified is markpage's default body alignment; left is the exception.
  // This fallback only fires for a document whose style omits `align`.
  const align = s.body.align ?? 'justify';
  // `hyphens: auto` needs a language to pick a dictionary; without it the
  // browser declines to hyphenate and justification opens rivers of white.
  const pane = document.getElementById('preview-pane');
  if (pane) pane.lang = settings.language;
  const f = settings.fonts;
  // Per-element family overrides the trio; the trio is the fallback
  // when the matrix leaves `family` undefined.
  const bodyName = (s.body.family ?? '').trim() || f.body;
  const codeName = (s['code-inline'].family ?? '').trim() || f.code;
  const headFam = fontFamilyStack(f.headings);
  const bodyFam = fontFamilyStack(bodyName);
  const codeFam = fontFamilyStack(codeName, 'mono');
  // Inline code sized RELATIVE to context (em) so it shrinks inside a small
  // footnote/caption instead of staying at the body's absolute code size.
  const codeEm = (
    (s['code-inline'].fontSize ?? s.body.fontSize ?? 11) /
    (s.body.fontSize ?? 11)
  ).toFixed(3);
  el.textContent = `
    #preview-pane { font-family: ${bodyFam}; font-size: ${s.body.fontSize}pt; color: ${s.body.color}; line-height: ${s.body.lineHeight ?? 1.25}; }
    #preview-pane :is(h1, h2, h3, h4, h5, h6) { font-family: ${headFam}; }
    #preview-pane h1 { font-size: ${s.h1.fontSize}pt; color: ${s.h1.color}; ${underlineRule(s.h1)} ${headingExtras(s.h1)} ${headingMargin(s.h1)} }
    #preview-pane h1.doc-title { font-size: ${s.title.fontSize}pt; color: ${s.title.color}; ${underlineRule(s.title)} ${headingExtras(s.title)} ${headingMargin(s.title)} }
    #preview-pane .doc-subtitle { font-family: ${headFam}; ${inlineCss(s.subtitle)} }
    #preview-pane h2 { font-size: ${s.h2.fontSize}pt; color: ${s.h2.color}; ${underlineRule(s.h2)} ${headingExtras(s.h2)} ${headingMargin(s.h2)} }
    #preview-pane h3 { font-size: ${s.h3.fontSize}pt; color: ${s.h3.color}; ${underlineRule(s.h3)} ${headingExtras(s.h3)} ${headingMargin(s.h3)} }
    #preview-pane h4 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; ${underlineRule(s.h4)} ${headingExtras(s.h4)} ${headingMargin(s.h4)} }
    #preview-pane h5,
    #preview-pane h6 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; ${headingMargin(s.h4)} }
    ${headingNumberCss(settings.numbering, 'none', '#preview-pane', settings.pageGeometry?.sidenote?.gap ?? 3)}
    /* Suppress the first heading's top margin so the document doesn't
       start with empty space above the title. */
    #preview-pane > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
    #preview-pane.continuous p {
      margin: ${s.body.marginAbove ?? 1}em 0 ${s.body.marginBelow ?? 1}em;
      text-indent: 0;
    }
    #preview-pane.continuous p + p,
    #preview-pane.continuous p.mp-paragraph-continuation {
      text-indent: ${s.body.firstLineIndent ?? 0}em;
    }
    #preview-pane :is(code, pre) { font-family: ${codeFam}; font-size: ${codeEm}em; color: ${s['code-inline'].color}; }
    /* Inline code inside a heading: keep the mono font but track the
       heading's own font-size instead of the body-code one. */
    #preview-pane :is(h1, h2, h3, h4, h5, h6) code { font-size: inherit; }
    /* Block code: <pre> wrapper uses the code-block style box +
       per-element typography (family/fontSize/color/margins) that
       overrides the code-inline rule above for <pre> specifically.
       Tree SVG diagrams and algorithm listings share the same frame. */
    /* Preformatted content must escape the body's justification AND its
       hyphenation. Both are inherited from the page container, and both are
       wrong here: justifying code stretches its inter-token spaces into a
       ragged right edge, and hyphenation breaks identifiers across lines
       (attributes_of_dependencies became "cur-rent"). Only visible once
       justified became the default alignment. */
    #preview-pane :is(pre, code, kbd, samp),
    #preview-pane .algorithm,
    #preview-pane .algorithm-code {
      text-align: left;
      hyphens: none;
      -webkit-hyphens: none;
    }

    #preview-pane pre,
    #preview-pane .tree-svg-wrap,
    #preview-pane .algorithm { ${blockBoxCss(s['code-block'])} ${inlineCss(s['code-block'])} }
    #preview-pane blockquote { ${inlineCss(s.quote)} ${blockBoxCss(s.quote)} padding-left: ${s.quote.padding ?? 0.9}em; }
    /* Metadata block (author / organization / date) shown after h1. */
    #preview-pane .preview-metadata { ${inlineCss(s.metadata)} }
    /* Auto-numbered figure / algorithm / table / listing caption. */
    #preview-pane .caption { ${inlineCss(s.caption)} }
    /* Footnotes / sidenotes — one step below the body on the type scale. */
    #preview-pane .footnotes, #preview-pane .sidenote { ${inlineCss(s.footnote)} }
    /* Inline links — color and underline come from styles['inline-link']. */
    #preview-pane a { ${inlineCss(s['inline-link'])} text-decoration: ${s['inline-link'].underline ? 'underline' : 'none'}; }
    /* Block math, mermaid, admonitions, tables — user-configurable
       box + inline (align / margins). */
    #preview-pane .math-block { ${blockBoxCss(s['math-block'])} ${inlineCss(s['math-block'])} }
    #preview-pane .mermaid-block { ${blockBoxCss(s.mermaid)} ${inlineCss(s.mermaid)} }
    #preview-pane .admonition { ${blockBoxCss(s.callout)} ${inlineCss(s.callout)} }
    #preview-pane table { border-collapse: collapse; ${inlineCss(s.table)} ${blockBoxCss(s.table)} }
    #preview-pane p,
    #preview-pane li {
      text-align: ${align};
      /* Justified text without hyphenation opens rivers of white, and French
         suffers most (long words, short measure). The browser needs the
         document language to pick a dictionary; it is set on the pane above. */
      hyphens: auto;
      -webkit-hyphens: auto;
    }
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
