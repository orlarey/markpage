/********************************* frontmatter.ts ******************************
 *
 * Purpose: Parse a Pandoc-style YAML frontmatter block at the top of a
 *   Markdown source, returning the recognised metadata + the doc body.
 * How: Tiny purpose-built parser — we only need plain `key: value` lines
 *   and `key: |` block scalars (for `mathjax-preamble`). Avoids pulling
 *   a full YAML dependency for our 5 known keys.
 *
 *******************************************************************************/

/**
 * Purpose: Parsed frontmatter fields. All fields optional; unknown keys
 *   are kept in `extra` so the renderer can still surface them if needed
 *   (e.g. for debugging) without us having to whitelist every possible one.
 */
export interface Frontmatter {
  title?: string;
  author?: string;
  organization?: string;
  date?: string;
  // TeX source prepended to every MathJax invocation — define macros once
  // at the top of the doc and use them in every formula thereafter.
  'mathjax-preamble'?: string;
  // Per-doc override of the page format: when truthy the renderer
  // forces `pageSize: 'SLIDES_16_9'` so `## h2` starts a new slide
  // regardless of the active settings profile.
  slides?: boolean;

  // --- Layout / typography overrides (SPEC: applied on top of the active
  // profile by applyFrontmatterToSettings, and by the VS Code preview directly).
  // These make a document self-describing so it renders the same in the app
  // and in any host that reads the frontmatter. ---
  // Page format name (A4 / A5 / LETTER / …); case-insensitive.
  'page-size'?: string;
  // Page margins in mm. Authored as a CSS-shorthand list (`25`, `25 35`,
  // `20 30 25 30`) and stored already expanded to the four sides.
  margins?: { top: number; right: number; bottom: number; left: number };
  // Footer page numbers on/off (the default profile footer is ' | {page} | ').
  'page-numbers'?: boolean;
  // Font family overrides for the three slots (body / headings / monospace).
  'font-body'?: string;
  'font-heading'?: string;
  'font-mono'?: string;
  // A full style profile serialized as JSON (markpage's per-element `styles` +
  // fonts + layout), written by markpage for external renderers (the VS Code
  // preview) so a document carries its complete typography. Authored as a
  // `markpage-profile: |` block scalar. The flat keys above take precedence.
  'markpage-profile'?: string;
  extra: Record<string, string>;
}

/**
 * Purpose: Expand a CSS-shorthand margin list (1/2/3/4 values, mm) into the
 *   four explicit sides, so the app (→ PdfSettings.margins) and the VS Code
 *   preview (→ @page / padding) both read `margins:` identically.
 * How: CSS box model — [a]=all, [a,b]=(v,h), [a,b,c]=(t,h,b), [a,b,c,d]=(t,r,b,l).
 *   Returns null when there's no usable number.
 */
function marginBox(
  nums: number[],
): { top: number; right: number; bottom: number; left: number } | null {
  if (nums.length === 0) return null;
  const [a, b = a, c = a, d = b] = nums;
  if (nums.length === 2) return { top: a, right: b, bottom: a, left: b };
  if (nums.length === 3) return { top: a, right: b, bottom: c, left: b };
  if (nums.length >= 4) return { top: a, right: b, bottom: c, left: d };
  return { top: a, right: a, bottom: a, left: a };
}

export interface ParseResult {
  meta: Frontmatter;
  body: string;
}

const FENCE_RE = /^---\s*\r?\n/;

/**
 * Purpose: Split a Markdown source into (frontmatter, body). When no
 *   frontmatter is present, returns empty meta + the original body.
 * How: Look for a `---` opening fence on line 1; scan forward until the
 *   closing `---`; parse the lines in between with `parseLines`.
 */
export function parseFrontmatter(source: string): ParseResult {
  const empty: Frontmatter = { extra: {} };
  if (!FENCE_RE.test(source)) return { meta: empty, body: source };

  const lines = source.split(/\r?\n/);
  // First line is the opening `---`. Look for the matching closing fence.
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) {
    // Unterminated fence — treat the whole source as body so the user
    // sees their literal `---` text instead of silently losing content.
    return { meta: empty, body: source };
  }
  const yamlLines = lines.slice(1, end);
  const meta = parseLines(yamlLines);
  // Drop the fences + trailing blank line so the body starts cleanly.
  let bodyStart = end + 1;
  if (lines[bodyStart]?.trim() === '') bodyStart += 1;
  return { meta, body: lines.slice(bodyStart).join('\n') };
}

/**
 * Purpose: Parse the YAML-subset we accept: `key: value` and `key: |` blocks.
 * How: Linear scan. Quoted values are unquoted; block scalars accumulate
 *   indented follow-up lines, with the common indent stripped.
 */
function parseLines(lines: string[]): Frontmatter {
  const meta: Frontmatter = { extra: {} };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    const [, key, rest] = m;
    if (rest === '|' || rest === '|-') {
      // Block scalar: gather following indented lines, strip the common
      // leading indent (smallest non-zero indent across the block).
      const blockLines: string[] = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (next === '') {
          blockLines.push('');
          i += 1;
          continue;
        }
        // Stop when we hit an unindented non-blank line.
        if (!/^\s/.test(next)) break;
        blockLines.push(next);
        i += 1;
      }
      assign(meta, key, dedentBlock(blockLines));
      continue;
    }
    assign(meta, key, unquote(rest));
    i += 1;
  }
  return meta;
}

/**
 * Purpose: Strip the leading common indentation from a YAML block scalar.
 * How: Find the smallest non-empty indent, slice that many leading chars
 *   off every line. Trailing blank lines are dropped (matches YAML `|-`).
 */
function dedentBlock(lines: string[]): string {
  let minIndent = Infinity;
  for (const line of lines) {
    if (line === '') continue;
    const m = /^(\s*)/.exec(line);
    const indent = m ? m[1].length : 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (!Number.isFinite(minIndent)) minIndent = 0;
  const dedented = lines.map((l) => (l === '' ? '' : l.slice(minIndent)));
  // Drop trailing blanks for `|-`/`|` parity (we don't distinguish chomping).
  while (dedented.length > 0 && dedented[dedented.length - 1] === '') {
    dedented.pop();
  }
  return dedented.join('\n');
}

/**
 * Purpose: Strip surrounding ASCII quotes if present.
 * How: Match `"..."` or `'...'`; leave bare scalars alone.
 */
function unquote(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Purpose: Write a parsed (key, value) into the typed Frontmatter shape,
 *   routing known keys to their dedicated field and unknowns into `extra`.
 */
function assign(meta: Frontmatter, key: string, value: string): void {
  switch (key) {
    case 'title':
    case 'author':
    case 'organization':
    case 'date':
    case 'mathjax-preamble':
    case 'page-size':
    case 'font-body':
    case 'font-heading':
    case 'font-mono':
    case 'markpage-profile':
      meta[key] = value;
      break;
    case 'slides':
      meta.slides = parseBool(value);
      break;
    case 'page-numbers':
      meta['page-numbers'] = parseBool(value);
      break;
    case 'margins': {
      const box = marginBox(parseNumbers(value));
      if (box) meta.margins = box;
      break;
    }
    default:
      meta.extra[key] = value;
  }
}

/**
 * Purpose: Parse a whitespace/comma-separated list of numbers (e.g. margins).
 * How: split, coerce, drop non-finite tokens (so `25 35` → [25, 35]).
 */
function parseNumbers(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .filter((t) => t !== '')
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n));
}

/**
 * Purpose: YAML-lite boolean coercion — accepts `true`/`yes`/`on`/`1`
 *   (any case) as truthy, anything else as falsy.
 */
function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === 'on' || v === '1';
}
