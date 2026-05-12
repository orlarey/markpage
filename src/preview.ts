import { marked } from 'marked';
import { metadataLines, type PdfSettings, type TextStyle } from './settings';
import { renderMermaid } from './mermaid';
import { renderMath } from './math';
import { quoteFontFamily } from './font-loader';

// Heading underline CSS fragment. Returns either a `border-bottom`
// declaration in the editor's neutral border colour, or
// `border-bottom: none` so the rule consistently wins over any
// earlier static style.
function underlineRule(s: TextStyle): string {
  return s.underline
    ? `border-bottom: 1px solid var(--border); padding-bottom: 0.2em;`
    : `border-bottom: none;`;
}

// Per-heading italic + weight. Emits explicit declarations so the
// dynamic rule overrides the static `font-weight: 500` cascade
// applied to bold/strong (still useful for `<b>` and `<strong>`,
// but headings now drive their own weight).
function headingExtras(s: TextStyle): string {
  return `font-style: ${s.italic ? 'italic' : 'normal'}; font-weight: ${s.weight ?? 500};`;
}

// Asymmetric vertical spacing — more above than below — so each
// heading visually attaches to the section it introduces (Gestalt
// proximity). Two user-tunable ratios (Réglages → Styles), expressed
// in `em` so the absolute spacing tracks each heading's own font-size.
function headingMargin(settings: PdfSettings): string {
  const { above, below } = settings.headingSpacing;
  return `margin: ${above}em 0 ${below}em;`;
}

export function renderPreview(target: HTMLElement, source: string): void {
  target.innerHTML = marked.parse(source, { async: false });
}

// Inserts (or refreshes) the centered author/organization/date block right
// after the first <h1> in the preview, mirroring the PDF behaviour.
export function applyPreviewMetadata(
  target: HTMLElement,
  settings: PdfSettings,
): void {
  target.querySelector('.preview-metadata')?.remove();

  const lines = metadataLines(settings);
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

// Stamps each top-level block in the preview with `data-line="N"` (0-indexed
// source line of the corresponding markdown token), so the scroll-sync code
// can interpolate between blocks. Skips our own injected metadata block,
// which has no source counterpart.
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

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.codePointAt(i) === 10) n += 1;
  }
  return n;
}

// Same idea as renderMathBlocks but for inline `$…$` placeholders. The
// MathJax SVG is dropped in directly — the browser renders inline SVG in
// the text flow and applies the `vertical-align: -…ex` style MathJax
// emits, which lines the formula up with the surrounding baseline.
export async function renderMathInlines(target: HTMLElement): Promise<void> {
  const placeholders = Array.from(
    target.querySelectorAll<HTMLElement>('span.math-inline[data-math]'),
  );
  if (placeholders.length === 0) return;
  await Promise.all(
    placeholders.map(async (el) => {
      const source = el.dataset['math'] ?? '';
      const result = await renderMath(source, false);
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

// SVG `id` collisions across cached renders. mermaid/MathJax both
// generate SVGs that reference internal markers, glyph paths, masks etc.
// via `url(#some-id)`, `href="#some-id"`, AND CSS selectors like
// `#mermaid-1 .node rect { fill: ... }` inside `<style>`. Our render
// caches return the same SVG string for the same source; if that SVG
// is inserted in two places (e.g. the editor preview AND the print-
// target), browsers resolve `#some-id` references to the first match
// in document order — the second instance loses its markers, fills,
// and glyph references. Prefix every id and every internal reference
// with a per-call tag so each insertion is self-contained.
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

// Walks the rendered preview, finds the placeholders our marked-config
// extension left behind for `$$…$$` blocks, and swaps each one for the
// MathJax SVG. Errors render as a red-bordered block with the source
// still visible.
export async function renderMathBlocks(target: HTMLElement): Promise<void> {
  const placeholders = Array.from(
    target.querySelectorAll<HTMLElement>('.math-block[data-math]'),
  );
  if (placeholders.length === 0) return;
  await Promise.all(
    placeholders.map(async (el) => {
      const source = el.dataset['math'] ?? '';
      const result = await renderMath(source, true);
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

// Walks the rendered preview, finds every ```mermaid code block, renders it
// to SVG via the lazy-loaded mermaid library, and swaps the <pre> for a
// <div> holding the SVG. Errors are shown as a red-bordered block with the
// source still visible so the user can see what they typed.
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
        wrapper.className = 'mermaid-block';
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

const PREVIEW_STYLE_ID = 'md2pdf-preview-styles';

// Mirrors a subset of the PDF settings into the HTML preview so the user can
// see the effect of size/color changes without exporting. Layout-only fields
// (page size, margins, page number) are intentionally not reflected — the
// HTML preview is a flowing document, not a paged one.
export function applyPreviewStyles(settings: PdfSettings): void {
  let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = PREVIEW_STYLE_ID;
    document.head.appendChild(el);
  }
  const s = settings.styles;
  const align = settings.justify ? 'justify' : 'left';
  const f = settings.fonts;
  const headFam = `${quoteFontFamily(f.headings)}, "Roboto Condensed", sans-serif`;
  const bodyFam = `${quoteFontFamily(f.body)}, "Roboto Condensed", sans-serif`;
  const codeFam = `${quoteFontFamily(f.code)}, "Roboto Mono", monospace`;
  el.textContent = `
    #preview-pane { font-family: ${bodyFam}; font-size: ${s.body.fontSize}pt; color: ${s.body.color}; line-height: ${settings.lineHeight}; }
    #preview-pane :is(h1, h2, h3, h4, h5, h6) { font-family: ${headFam}; }
    #preview-pane h1 { font-size: ${s.h1.fontSize}pt; color: ${s.h1.color}; text-align: center; ${underlineRule(s.h1)} ${headingExtras(s.h1)} }
    #preview-pane h2 { font-size: ${s.h2.fontSize}pt; color: ${s.h2.color}; ${underlineRule(s.h2)} ${headingExtras(s.h2)} }
    #preview-pane h3 { font-size: ${s.h3.fontSize}pt; color: ${s.h3.color}; ${underlineRule(s.h3)} ${headingExtras(s.h3)} }
    #preview-pane h4 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; ${underlineRule(s.h4)} ${headingExtras(s.h4)} }
    #preview-pane h5,
    #preview-pane h6 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; }
    #preview-pane :is(h1, h2, h3, h4, h5, h6) { ${headingMargin(settings)} }
    /* Suppress the first heading's top margin so the document doesn't
       start with empty space above the title. */
    #preview-pane > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
    #preview-pane p { margin: ${settings.paragraphSpacing}em 0; }
    #preview-pane :is(code, pre) { font-family: ${codeFam}; font-size: ${s.code.fontSize}pt; color: ${s.code.color}; }
    #preview-pane blockquote {
      font-size: ${s.quote.fontSize}pt;
      color: ${s.quote.color};
      border-left-color: ${s.quote.barColor};
    }
    #preview-pane p,
    #preview-pane li,
    #preview-pane blockquote { text-align: ${align}; }
  `;
}

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
