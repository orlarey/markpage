/********************************* render.ts **********************************
 *
 * Purpose: The package's public render entry — `renderMarkpageMarkdown(md)` →
 *   HTML string, with every markpage extension applied. This is what a host
 *   (the web app, the VS Code preview) calls instead of reaching for the global
 *   `marked` singleton.
 * How: importing `./marked-config` (side effect) has registered the extensions
 *   on the shared `marked` peer; we parse synchronously. Image refs are left
 *   intact unless the host passes `resolveImageSrc` — the one environment seam
 *   (markpage resolves `img://<sha>` from its store; an editor/IDE resolves a
 *   relative path to a local/URI form).
 *
 *******************************************************************************/

import { marked } from 'marked';
import './marked-config'; // ensure the extensions are registered (idempotent)

export interface RenderOptions {
  /**
   * Map an image `src` (as it appears in the source) to a displayable URL.
   * markpage passes a sha→blob resolver; a VS Code preview passes a
   * relative-path→webview-URI resolver. When omitted, srcs are left verbatim.
   */
  resolveImageSrc?: (src: string) => string;
}

const IMG_SRC_RE = /(<img\b[^>]*?\bsrc=")([^"]*)(")/g;

/** Rewrite every `<img src="…">` through `resolve` (the image seam). */
export function rewriteImageSrc(html: string, resolve: (src: string) => string): string {
  return html.replace(IMG_SRC_RE, (_full, pre: string, src: string, post: string) => {
    return `${pre}${resolve(src) ?? src}${post}`;
  });
}

/**
 * Render markpage Markdown to an HTML string (phase A). `md` is the document
 * BODY (frontmatter, if any, is the caller's concern). Math stays as inline/
 * block placeholders and mermaid as `<code class="language-mermaid">` — a host
 * runs the phase-B hydrate (MathJax / Mermaid) on the live DOM.
 */
export function renderMarkpageMarkdown(md: string, opts: RenderOptions = {}): string {
  let html = marked.parse(md, { async: false }) as string;
  if (opts.resolveImageSrc) html = rewriteImageSrc(html, opts.resolveImageSrc);
  return html;
}
