// preview.ts — runs inside the webview. Renders the document text with
// @orlarey/markpage-render (phase A) and resolves image srcs to webview URIs.
//
// v0.1: transform only. Phase B (MathJax / Mermaid via hydratePreview) is the
// next increment — math shows as placeholders and mermaid as a code block until
// then.

import { renderMarkpageMarkdown } from '@orlarey/markpage-render';

interface RenderMessage {
  type: 'render';
  md: string;
  baseUri: string;
}

const root = document.getElementById('markpage-preview') as HTMLElement;

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as RenderMessage | undefined;
  if (!msg || msg.type !== 'render') return;
  const base = msg.baseUri ? msg.baseUri.replace(/\/?$/, '/') : '';
  root.innerHTML = renderMarkpageMarkdown(stripFrontmatter(msg.md), {
    resolveImageSrc: (src) => resolveSrc(src, base),
  });
});

/** Resolve a relative image src against the document folder's webview URI. */
function resolveSrc(src: string, base: string): string {
  if (!base) return src;
  // Already absolute (scheme, protocol-relative or data:) → leave it.
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src;
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}

/** Drop a leading YAML frontmatter block so it isn't rendered as text. */
function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}
