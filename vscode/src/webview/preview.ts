// preview.ts — runs inside the webview. Renders the document text with
// @orlarey/markpage-render: phase A (transform) then phase B (hydratePreview —
// MathJax + Mermaid). MathJax/Mermaid load as on-demand ESM chunks.

import { renderMarkpageMarkdown, hydratePreview } from '@orlarey/markpage-render';

interface RenderMessage {
  type: 'render';
  md: string;
  baseUri: string;
}

const root = document.getElementById('markpage-preview') as HTMLElement;
let renderToken = 0;

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as RenderMessage | undefined;
  if (!msg || msg.type !== 'render') return;
  void render(msg);
});

async function render(msg: RenderMessage): Promise<void> {
  const token = (renderToken += 1);
  const base = msg.baseUri ? msg.baseUri.replace(/\/?$/, '/') : '';
  root.innerHTML = renderMarkpageMarkdown(stripFrontmatter(msg.md), {
    resolveImageSrc: (src) => resolveSrc(src, base),
  });
  // Phase B is async (lazy MathJax/Mermaid). Bail if a newer render started.
  try {
    await hydratePreview(root, { fontSet: 'newcm' });
  } catch (err) {
    console.error('[markpage] hydrate failed', err);
  }
  if (token !== renderToken) return; // superseded — leave the newer render alone
}

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
