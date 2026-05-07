import { marked } from 'marked';
import { metadataLines, type PdfSettings } from './settings';

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
    if (tok.type !== 'space' && tok.type !== 'html') {
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
  el.textContent = `
    #preview-pane { font-size: ${s.body.fontSize}pt; color: ${s.body.color}; line-height: ${settings.lineHeight}; }
    #preview-pane h1 { font-size: ${s.h1.fontSize}pt; color: ${s.h1.color}; text-align: center; border-bottom: none; }
    #preview-pane h2 { font-size: ${s.h2.fontSize}pt; color: ${s.h2.color}; }
    #preview-pane h3 { font-size: ${s.h3.fontSize}pt; color: ${s.h3.color}; }
    #preview-pane h4 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; }
    #preview-pane h5,
    #preview-pane h6 { font-size: ${s.h4.fontSize}pt; color: ${s.h4.color}; }
    #preview-pane code { font-size: ${s.code.fontSize}pt; color: ${s.code.color}; }
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
