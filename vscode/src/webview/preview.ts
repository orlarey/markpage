// preview.ts — runs inside the webview. Renders the document text with
// @orlarey/markpage-render: phase A (transform) then phase B (hydratePreview —
// MathJax + Mermaid). MathJax/Mermaid load as on-demand ESM chunks.
//
// Scroll-sync: every top-level block is tagged with its source line (data-line)
// so the host can scroll the preview to the editor's position and vice versa.

import { renderMarkpageMarkdown, hydratePreview } from '@orlarey/markpage-render';
import { marked } from 'marked';
// Bundled into dist/webview.css by esbuild — the hljs colour theme markpage uses
// (light) and the @orlarey/blocks DSL styles. media/preview.css adds the paper
// look + the CSS variables these need, and loads after to win overrides.
import 'highlight.js/styles/atom-one-light.css';
import '@orlarey/blocks/styles.css';

interface RenderMessage {
  type: 'render';
  md: string;
  baseUri: string;
  paginated: boolean;
}
interface ScrollMessage {
  type: 'scrollToLine';
  line: number;
}

// A4 page rules for the paginated mode (paged.js reads @page).
const PAGE_CSS = `
@page { size: 210mm 297mm; margin: 18mm 16mm; }
`;

// Bridge to the extension host (absent in the plain-browser dev harness).
const vscode =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

const root = document.getElementById('markpage-preview') as HTMLElement;
let renderToken = 0;
let suppressScroll = false; // ignore the scroll event our own scrollToLine causes

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as RenderMessage | ScrollMessage | { type: 'print' } | undefined;
  if (!msg) return;
  if (msg.type === 'render') void render(msg);
  else if (msg.type === 'scrollToLine') scrollToLine(msg.line);
  else if (msg.type === 'print') window.print();
});

async function render(msg: RenderMessage): Promise<void> {
  const token = (renderToken += 1);
  const base = msg.baseUri ? msg.baseUri.replace(/\/?$/, '/') : '';
  const { body, lineOffset } = stripFrontmatter(msg.md);
  root.classList.remove('paginated');
  root.innerHTML = renderMarkpageMarkdown(body, {
    resolveImageSrc: (src) => resolveSrc(src, base),
  });
  annotateSourceLines(root, body, lineOffset);
  try {
    await hydratePreview(root, { fontSet: 'newcm' });
  } catch (err) {
    console.error('[markpage] hydrate failed', err);
  }
  if (token !== renderToken) return; // superseded
  if (msg.paginated) {
    try {
      await paginate(token);
    } catch (err) {
      console.error('[markpage] pagination failed', err);
    }
  }
}

/** Paginated mode: fragment the rendered content into A4 pages via paged.js. */
async function paginate(token: number): Promise<void> {
  // Snapshot the hydrated content (SVGs included) as the paged.js source.
  const source = document.createElement('div');
  source.innerHTML = root.innerHTML;
  const { Previewer } = await import('pagedjs');
  if (token !== renderToken) return; // a newer render started while loading
  root.classList.add('paginated');
  root.innerHTML = '';
  await new Previewer().preview(source, [{ 'markpage-page.css': PAGE_CSS }], root);
}

// ---- scroll-sync ----------------------------------------------------------

/** Host → preview: scroll so the block at `line` sits near the top. */
function scrollToLine(line: number): void {
  const el = elementForLine(line);
  if (!el) return;
  suppressScroll = true;
  el.scrollIntoView({ block: 'start' });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      suppressScroll = false;
    });
  });
}

/** The last annotated block whose source line is ≤ `line`. */
function elementForLine(line: number): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    if (Number(el.dataset.line) <= line) best = el;
    else break;
  }
  return best;
}

// Preview → host: report the top visible block's source line (debounced).
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener(
  'scroll',
  () => {
    if (suppressScroll || !vscode) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(reportTopLine, 100);
  },
  { passive: true },
);

function reportTopLine(): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-line]')) {
    if (el.getBoundingClientRect().top >= 0) {
      vscode?.postMessage({ type: 'revealLine', line: Number(el.dataset.line) });
      return;
    }
  }
}

// ---- source-line annotation (ported from markpage's annotateSourceLines) --

/** Tag each top-level rendered block with its source line (+ frontmatter offset). */
function annotateSourceLines(target: HTMLElement, source: string, offset: number): void {
  const tokens = marked.lexer(source);
  const elements = Array.from(target.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
  let i = 0;
  let line = 0;
  for (const tok of tokens) {
    const renders = tok.type !== 'space' && tok.type !== 'html' && tok.type !== 'footnoteDef';
    if (renders) {
      const el = elements[i];
      if (el) el.dataset.line = String(line + offset);
      i += 1;
    }
    line += countNewlines(tok.raw);
  }
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) if (s.codePointAt(i) === 10) n += 1;
  return n;
}

// ---- helpers --------------------------------------------------------------

/** Resolve a relative image src against the document folder's webview URI. */
function resolveSrc(src: string, base: string): string {
  if (!base) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src;
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

/** Drop a leading YAML frontmatter block; return the body + how many lines it spanned. */
function stripFrontmatter(md: string): { body: string; lineOffset: number } {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  if (!m) return { body: md, lineOffset: 0 };
  return { body: md.slice(m[0].length), lineOffset: countNewlines(m[0]) };
}

// VS Code injects this into webview scripts.
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
