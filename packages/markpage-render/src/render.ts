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
import type { Frontmatter } from './frontmatter';

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

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Render the document-title + author / organization / date header from parsed
 * frontmatter, mirroring the web app's `renderPreview` (doc-title h1) +
 * `applyPreviewMetadata` (centered metadata block). Hosts without the app's
 * `PdfSettings` (the VS Code preview) call this to get the same header markpage
 * shows: `title` → a centered `<h1 class="doc-title">`, then author + org (bold)
 * and date (plain) inside `.preview-metadata`. Returns '' when there's nothing
 * to show. The block is meant to be PREPENDED to `renderMarkpageMarkdown(body)`
 * output; scroll-sync code should skip `.preview-metadata` (it has no source
 * line). The values are HTML-escaped here since they come from the parser as
 * plain text.
 */
export function renderMetadataBlock(meta: Frontmatter): string {
  const title = meta.title?.trim();
  const lines: { text: string; bold: boolean }[] = [];
  const author = meta.author?.trim();
  if (author) lines.push({ text: author, bold: true });
  const org = meta.organization?.trim();
  if (org) lines.push({ text: org, bold: true });
  const date = meta.date?.trim();
  if (date) lines.push({ text: date, bold: false });

  if (!title && lines.length === 0) return '';

  const parts: string[] = [];
  if (title) parts.push(`<h1 class="doc-title">${escapeHtml(title)}</h1>`);
  if (lines.length > 0) {
    const divs = lines
      .map((l) => `<div${l.bold ? ' class="bold"' : ''}>${escapeHtml(l.text)}</div>`)
      .join('');
    parts.push(`<div class="preview-metadata">${divs}</div>`);
  }
  return parts.join('');
}
