/********************************* numbering.ts ********************************
 *
 * Purpose: "Numbering by example" for headings — detect the style each heading
 *   level uses from its first occurrence, then rewrite every other heading at
 *   that level to match (flat decimal, letter, Roman, hierarchical, or none).
 * How: Two passes over the lines — `detectStyles` parses the first heading per
 *   level via `parseStyle`; `renumber` walks again applying `formatPrefix`.
 *
 *******************************************************************************/

// "Numbering by example" for headings.
//
// The user writes the FIRST heading at each level the way they want all
// of that level's headings to look — "1. Intro", "1.1 Foo", "A. Bar",
// or no prefix at all. The renumberer detects the style from that first
// occurrence and rewrites every other heading at that level to match.
//
// Supported styles per level:
//   none                                  — strip any existing number-like prefix
//   1.  /  1)  /  (1)                     — flat decimal, three suffixes
//   A.  /  a.                             — flat letter (uppercase / lowercase)
//   I.  /  i.                             — flat Roman (uppercase / lowercase)
//   1.1 / 1.1.1 / …                       — hierarchical decimal, with optional trailing dot
//
// Hierarchical numbering at level k uses the running counters of all
// ancestor levels, so it requires the parent levels to also carry a
// numeric style — typical case: h1 = "1.", h2 = "1.1", h3 = "1.1.1".

export type LevelStyle =
  | { kind: 'none' }
  | { kind: 'decimal'; open: '' | '('; close: '.' | ')' }
  | { kind: 'letter'; upper: boolean; close: '.' }
  | { kind: 'roman'; upper: boolean; close: '.' }
  | { kind: 'hierarchical'; trailingDot: boolean };

/**
 * Purpose: Numbering style for each heading level of a document.
 * How: `levels[0]` is h1's style, … `levels[5]` is h6's; `none` = no prefix.
 */
export interface DocStyle {
  // Index 0 = h1 … 5 = h6.
  levels: LevelStyle[];
}

const NONE: LevelStyle = { kind: 'none' };

const ROMAN_VALID = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

// Heading regex. ATX form only (`#` to `######` followed by space and
// title). Setext (`Title\n====`) is intentionally out of scope for v1.
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * Purpose: Parse an existing heading title and split it into `{style, rest}`.
 * How: Try regex branches in disambiguating order (hierarchical → decimal variants → roman → letter).
 */
// Parse an existing heading title and split it into (style, rest)
// where `rest` is the title text with the number prefix removed.
// Returns null if no number prefix is recognized.
function parseStyle(
  title: string,
): { style: LevelStyle; rest: string } | null {
  // Hierarchical decimal: "1.1 Foo" or "1.1. Foo" — at least 2
  // dot-separated components. Tested first because a flat-decimal
  // pattern would otherwise match the leading "1." part of "1.1".
  let m = /^((?:\d+\.)+\d+)(\.?)\s+(.*)$/.exec(title);
  if (m) {
    return {
      style: { kind: 'hierarchical', trailingDot: m[2] === '.' },
      rest: m[3] ?? '',
    };
  }
  // Flat decimal in parens: "(1) Foo".
  m = /^\(\d+\)\s+(.*)$/.exec(title);
  if (m) {
    return {
      style: { kind: 'decimal', open: '(', close: ')' },
      rest: m[1] ?? '',
    };
  }
  // Flat decimal with paren: "1) Foo".
  m = /^\d+\)\s+(.*)$/.exec(title);
  if (m) {
    return {
      style: { kind: 'decimal', open: '', close: ')' },
      rest: m[1] ?? '',
    };
  }
  // Flat decimal with dot: "1. Foo".
  m = /^\d+\.\s+(.*)$/.exec(title);
  if (m) {
    return {
      style: { kind: 'decimal', open: '', close: '.' },
      rest: m[1] ?? '',
    };
  }
  // Roman numeral: "I. Foo" / "ii. Foo". Tested before single-letter
  // because "I." / "i." would otherwise match the letter pattern.
  m = /^([IVXLCDM]+)\.\s+(.*)$/.exec(title);
  if (m && ROMAN_VALID.test(m[1] ?? '')) {
    return {
      style: { kind: 'roman', upper: true, close: '.' },
      rest: m[2] ?? '',
    };
  }
  m = /^([ivxlcdm]+)\.\s+(.*)$/.exec(title);
  if (m && ROMAN_VALID.test((m[1] ?? '').toUpperCase())) {
    return {
      style: { kind: 'roman', upper: false, close: '.' },
      rest: m[2] ?? '',
    };
  }
  // Single letter: "A. Foo" / "a. Foo". Excludes I / i which were
  // captured by the Roman branch above.
  m = /^([A-Z])\.\s+(.*)$/.exec(title);
  if (m) {
    return {
      style: { kind: 'letter', upper: true, close: '.' },
      rest: m[2] ?? '',
    };
  }
  m = /^([a-z])\.\s+(.*)$/.exec(title);
  if (m) {
    return {
      style: { kind: 'letter', upper: false, close: '.' },
      rest: m[2] ?? '',
    };
  }
  return null;
}

/**
 * Purpose: Format an Arabic 1-based number as a letter sequence (1→A, 27→AA, …).
 * How: Repeated base-26 division with case selected by `upper`.
 */
// Format an Arabic number 1-N as a letter sequence. 1 → A, 26 → Z,
// 27 → AA, etc.
function letterFor(n: number, upper: boolean): string {
  let r = '';
  let v = n;
  const base = upper ? 0x41 : 0x61;
  while (v > 0) {
    v -= 1;
    r = String.fromCodePoint(base + (v % 26)) + r;
    v = Math.floor(v / 26);
  }
  return r;
}

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/**
 * Purpose: Format an Arabic number as a Roman numeral.
 * How: Greedy subtraction over `ROMAN_NUMERALS`; lowercased if `upper === false`.
 */
function toRoman(n: number, upper: boolean): string {
  let v = n;
  let r = '';
  for (const [val, sym] of ROMAN_NUMERALS) {
    while (v >= val) {
      r += sym;
      v -= val;
    }
  }
  return upper ? r : r.toLowerCase();
}

/**
 * Purpose: Build the textual prefix for one heading given its style and counters.
 * How: Switch on `style.kind`; hierarchical joins `counters[0..level]` with dots.
 */
// Build the prefix for the i-th heading at the given level, given the
// per-level counters (counters[k] = how many headings at level k+1
// have been seen so far INCLUDING the current one).
function formatPrefix(
  style: LevelStyle,
  level: number,
  counters: number[],
): string {
  const own = counters[level - 1] ?? 0;
  switch (style.kind) {
    case 'none':
      return '';
    case 'decimal':
      return `${style.open}${own}${style.close}`;
    case 'letter':
      return `${letterFor(own, style.upper)}${style.close}`;
    case 'roman':
      return `${toRoman(own, style.upper)}${style.close}`;
    case 'hierarchical': {
      const chain = counters.slice(0, level).join('.');
      return `${chain}${style.trailingDot ? '.' : ''}`;
    }
  }
}

/**
 * Purpose: Return the line index right after a YAML frontmatter block, or 0 if none.
 * How: If line 0 is `---`, scan forward for the closing `---`; malformed = no frontmatter.
 */
// Returns the line index just after a YAML frontmatter block (`---\n
// …\n---`), or 0 if there isn't one. Malformed YAML (no closing fence)
// is treated as "no frontmatter" rather than swallowing the rest of
// the doc.
function skipYamlFrontmatter(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') return i + 1;
  }
  return 0;
}

/**
 * Purpose: Return the index of the first non-blank line at or after `from`, else -1.
 * How: Linear scan; `trim() !== ''` decides.
 */
function firstNonBlankLine(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trim() !== '') return i;
  }
  return -1;
}

/**
 * Purpose: Decide whether the document's only `#` heading is the document title (not a section).
 * How: True iff there's exactly one h1 and it's the first non-blank line after frontmatter.
 */
// Detects whether the document's first `# Heading` is acting as the
// document **title** rather than a section. Heuristic:
//   - exactly one `#` heading in the whole document, AND
//   - that heading is the first non-blank line after any YAML
//     frontmatter.
// When this is true, callers shift their level numbering up by 1 so
// the first `##` becomes "section level 1" — matching the LaTeX
// `article` convention and the way most academic / GitHub-style READMEs
// are organised.
function isFirstH1ATitle(source: string): boolean {
  const lines = source.split('\n');
  const start = skipYamlFrontmatter(lines);
  const first = firstNonBlankLine(lines, start);
  if (first === -1) return false;
  let h1Count = 0;
  let firstH1Line = -1;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (m && (m[1] ?? '').length === 1) {
      h1Count += 1;
      if (firstH1Line === -1) firstH1Line = i;
    }
  }
  return h1Count === 1 && firstH1Line === first;
}

/**
 * Purpose: Walk the source and record the style of each level's FIRST heading.
 * How: Skip ``` fences, parse the first heading per effective level via `parseStyle`.
 */
// Walk the source line by line and collect, for each (effective) level,
// the style of the FIRST heading at that level. Skips lines inside ```
// fences. Levels that never appear in the document get `none` (no-op).
//
// If the document has a single top-level `# Title` acting as the
// document title (see isFirstH1ATitle), the effective level is one less
// than the raw `#` count: `##` → effective level 1, `###` → 2, etc.
// Raw level 1 (the title itself) is skipped entirely — its style stays
// as `none` so renumber() leaves it alone.
export function detectStyles(source: string): DocStyle {
  const levels: LevelStyle[] = Array.from({ length: 6 }, () => NONE);
  const seen = new Set<number>();
  const shift = isFirstH1ATitle(source) ? 1 : 0;
  let inFence = false;
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const rawLevel = (m[1] ?? '').length;
    const effLevel = rawLevel - shift;
    if (effLevel < 1) continue; // title — leave alone
    if (seen.has(effLevel)) continue;
    seen.add(effLevel);
    const parsed = parseStyle(m[2] ?? '');
    if (parsed) levels[effLevel - 1] = parsed.style;
  }
  return { levels };
}

/**
 * Purpose: Rewrite every heading by applying the matching level's style.
 * How: Walk lines (skip fences and the title `#`), bump counters, replace prefix via `formatPrefix`.
 */
// Walk the source again, applying each level's detected style to every
// heading at that level. The existing prefix (if any) is stripped and
// replaced with the freshly computed one. Headings inside fenced code
// blocks are left alone, and so is the document title (the unique
// top-level `#` that opens the doc — see isFirstH1ATitle).
export function renumber(source: string, doc: DocStyle): string {
  const lines = source.split('\n');
  const counters = [0, 0, 0, 0, 0, 0];
  const shift = isFirstH1ATitle(source) ? 1 : 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const rawLevel = (m[1] ?? '').length;
    const effLevel = rawLevel - shift;
    if (effLevel < 1) continue; // title — leave alone
    counters[effLevel - 1] = (counters[effLevel - 1] ?? 0) + 1;
    for (let j = effLevel; j < 6; j += 1) counters[j] = 0;
    const style = doc.levels[effLevel - 1] ?? NONE;
    const parsed = parseStyle(m[2] ?? '');
    const rest = parsed ? parsed.rest : (m[2] ?? '');
    const prefix = formatPrefix(style, effLevel, counters);
    lines[i] = prefix === ''
      ? `${m[1]} ${rest}`.trimEnd()
      : `${m[1]} ${prefix} ${rest}`.trimEnd();
  }
  return lines.join('\n');
}

/**
 * Purpose: One-shot helper combining `detectStyles` + `renumber` (the editor entry point).
 * How: Pipe `detectStyles(source)` into `renumber(source, …)`.
 */
// One-shot helper: detect the styles in `source` then renumber. The
// usual entry point from the editor command.
export function renumberByExample(source: string): string {
  return renumber(source, detectStyles(source));
}
