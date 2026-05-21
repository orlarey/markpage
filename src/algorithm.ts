/********************************* algorithm.ts ********************************
 *
 * Purpose: Render the ` ```algorithm ` fence body — pseudocode with line
 *   numbers, bolded keywords, leading indentation preserved (algorithm2e-
 *   style). The caption + auto-numbering (Algorithme N: …) is handled
 *   externally by [src/captions.ts], so this module only emits the body.
 * How: Walk the body line-by-line into a `<table>` with two columns (line
 *   number / code); keyword highlighting via a single regex over an
 *   easy-to-extend allowlist.
 *
 *******************************************************************************/

// Keywords typeset in bold inside the code column. Words are matched as
// whole tokens (case-sensitive) so `for` highlights but `forever` does
// not. The list is deliberately small + opinionated — extend on demand.
const KEYWORDS = [
  'for',
  'while',
  'do',
  'if',
  'then',
  'else',
  'elif',
  'end',
  'repeat',
  'until',
  'return',
  'break',
  'continue',
  'function',
  'procedure',
  'begin',
  'to',
  'in',
  'and',
  'or',
  'not',
  'Input',
  'Output',
  'Require',
  'Ensure',
];

const KEYWORD_RE = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g');

/**
 * Purpose: Render the fence body as a numbered, bold-keyword pseudocode block.
 * How: Split into lines, render each as a `<tr>` (line# + code). The caller
 *   wraps this in a `<figure>` with an optional `<figcaption>` via
 *   [captions.withCaption].
 */
export function renderAlgorithmBlock(text: string): string {
  const lines = text.split('\n');
  // Trim trailing blank lines (typical fence quirk) but keep blank lines
  // inside the body — users sometimes want an empty line to group steps.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  const rows = lines
    .map((line, i) => {
      const indent = leadingSpacesToNbsp(line);
      const trimmed = line.trimStart();
      const highlighted = highlightKeywords(escapeHtml(trimmed));
      return `<tr><td class="algorithm-line">${i + 1}</td><td class="algorithm-code">${indent}${highlighted}</td></tr>`;
    })
    .join('');

  return `<div class="algorithm"><table class="algorithm-body">${rows}</table></div>\n`;
}

/**
 * Purpose: Wrap recognised keywords in `<strong>`.
 * How: Single regex `replaceAll` on word-bounded matches against the
 *   curated keyword allowlist.
 */
function highlightKeywords(s: string): string {
  return s.replace(KEYWORD_RE, '<strong>$1</strong>');
}

/**
 * Purpose: Convert leading spaces / tabs to non-breaking entities so HTML
 *   collapse rules don't eat the indentation.
 * How: Match the leading whitespace; expand tabs to 2 spaces; map each
 *   space to `&nbsp;`.
 */
function leadingSpacesToNbsp(line: string): string {
  const m = /^[\s\t]*/.exec(line);
  if (!m) return '';
  const expanded = m[0].replaceAll('\t', '  ');
  return '&nbsp;'.repeat(expanded.length);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
