/********************************* escape.ts ***********************************
 *
 * Purpose: HTML/XML escaping + fence-info helpers shared by the block
 *   renderers. Self-contained for @markpage/blocks (no app dependency).
 *
 *******************************************************************************/

/** Escape text for safe insertion into HTML element content / attributes. */
export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Purpose: The bare-word positional args of a fence info string (everything
 *   after the language word, with any quoted caption removed).
 * How: Drop the first whitespace-delimited word (the language), strip the
 *   first quoted run (the caption) and any `\label{…}`, then split on spaces.
 */
export function fenceArgs(info: string): string[] {
  let body = info.replace(/^\S+\s*/, '');
  body = body.replace(/"[^"\n]*"|'[^'\n]*'/, ' ');
  body = body.replaceAll(/\\label\{[^}\n]+\}/g, ' ');
  const trimmed = body.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/);
}
