/********************************* diff.ts *************************************
 *
 * Purpose: Render the ` ```diff ` fence — unified-diff text with per-line
 *   coloration (green added / red removed / grey context + hunk headers).
 * How: Walk lines, dispatch on the first character to a `<span>` with the
 *   right class; everything wrapped in a `<pre class="diff-block">`.
 *   Pure inline styling at this layer; colors live in style.css.
 *
 *******************************************************************************/

/**
 * Purpose: Convert a unified-diff source into HTML.
 * How: One classed `<span>` per line (`display:block` from CSS so the line's
 *   background spans the full code column). Trailing empty line dropped to
 *   avoid a hollow row at the bottom of the block.
 */
export function renderDiffBlock(text: string): string {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  // No `\n` between block-level spans — each `display:block` already
  // forces its own row; an inter-span newline in `white-space: pre`
  // would render as an extra blank line per pair.
  const html = lines.map(renderDiffLine).join('');
  return `<pre class="diff-block"><code>${html}</code></pre>\n`;
}

/**
 * Purpose: Classify one diff line by its leading prefix.
 * How: Order matters — `+++` / `---` (file headers) before `+` / `-`
 *   (added / removed), then `@@` for hunks; everything else is context.
 */
function renderDiffLine(line: string): string {
  const escaped = escapeHtml(line);
  if (line.startsWith('+++') || line.startsWith('---')) {
    return `<span class="diff-meta">${escaped}</span>`;
  }
  if (line.startsWith('@@')) {
    return `<span class="diff-hunk">${escaped}</span>`;
  }
  if (line.startsWith('+')) {
    return `<span class="diff-add">${escaped}</span>`;
  }
  if (line.startsWith('-')) {
    return `<span class="diff-del">${escaped}</span>`;
  }
  return `<span class="diff-ctx">${escaped}</span>`;
}

/**
 * Purpose: Escape HTML special characters for safe insertion in markup.
 * How: Replace each of `& < > " '` with the corresponding entity.
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
