/********************************* pre-split.ts ********************************
 *
 * Purpose: Split `<pre>` code blocks that exceed a page into multiple contiguous
 *   chunks, so paged.js gets natural fragmentation points. Without this, a
 *   `<pre>` taller than a page either drops downstream content (no wrapper)
 *   or triggers paged.js's "blank page + duplicate" bug (with the
 *   `keep-with-next` wrapper around it). Cf. SPEC §13.3.
 * How: For each oversized `<pre>`, scan its raw text with a balance tracker
 *   (bracket depth, multi-line strings, block comments, template literals),
 *   pick safe split points using a scoring heuristic (blank lines, line
 *   endings, indent-min, depth-zero), and replace the original element with
 *   N consecutive re-highlighted `<pre>` siblings. Chunks share the original
 *   language class and get `pre-chunk-{first,middle,last}` markers for
 *   visual continuity CSS.
 *
 *******************************************************************************/

import { highlightCode, isKnownLanguage } from '@orlarey/markpage-render';

/** End-of-line state used to decide whether a line is a safe split point. */
interface LineState {
  /** Inside a C-style `/* ... *\/` block comment. */
  inBlockComment: boolean;
  /** Inside an OCaml `(* ... *)` comment; nested, so a depth counter. */
  ocamlCommentDepth: number;
  /** Inside a Python triple-double-quoted string `"""..."""`. */
  inTripleDouble: boolean;
  /** Inside a Python triple-single-quoted string `'''...'''`. */
  inTripleSingle: boolean;
  /** Inside a JS template literal `` `...` `` (multi-line). */
  inTemplate: boolean;
  /** Running bracket nesting depth (`{` `(` `[` increment, `}` `)` `]` decrement). */
  bracketDepth: number;
}

const INITIAL_STATE: LineState = {
  inBlockComment: false,
  ocamlCommentDepth: 0,
  inTripleDouble: false,
  inTripleSingle: false,
  inTemplate: false,
  bracketDepth: 0,
};

/**
 * Purpose: Advance the lex state across one line of code.
 * How: Walk char-by-char. While in a multi-line context (block comment, triple
 *   string, template), only look for the matching close. Otherwise, detect
 *   openings (block comments, triple strings, templates), skip line comments
 *   (`//`, `#`, `--`) to end of line, walk through single-line strings with
 *   `\` escape handling (treating an unterminated string as closed at EOL —
 *   the syntax-error case in most languages), and tally bracket depth.
 */
export function walkLine(line: string, prevState: LineState): LineState {
  const s: LineState = { ...prevState };
  let i = 0;
  while (i < line.length) {
    const c = line[i] ?? '';
    const next = line[i + 1] ?? '';
    const next2 = line[i + 2] ?? '';

    // ─── Inside a multi-line context: only look for the matching close.
    if (s.inBlockComment) {
      if (c === '*' && next === '/') {
        s.inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (s.ocamlCommentDepth > 0) {
      if (c === '(' && next === '*') {
        s.ocamlCommentDepth += 1;
        i += 2;
        continue;
      }
      if (c === '*' && next === ')') {
        s.ocamlCommentDepth -= 1;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (s.inTripleDouble) {
      if (c === '"' && next === '"' && next2 === '"') {
        s.inTripleDouble = false;
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }
    if (s.inTripleSingle) {
      if (c === "'" && next === "'" && next2 === "'") {
        s.inTripleSingle = false;
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }
    if (s.inTemplate) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') {
        s.inTemplate = false;
        i += 1;
        continue;
      }
      // We don't dive into `${...}` interpolation — its contents are code,
      // but the depth count would risk going off-track. Best effort: stay
      // in template mode until the closing backtick.
      i += 1;
      continue;
    }

    // ─── Top-level code: line comments terminate the rest of the line.
    if (c === '/' && next === '/') break;
    if (c === '-' && next === '-') break;
    if (c === '#') break;

    // ─── Block comment / OCaml comment openings.
    if (c === '/' && next === '*') {
      s.inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === '(' && next === '*') {
      s.ocamlCommentDepth += 1;
      i += 2;
      continue;
    }

    // ─── Multi-line string openings (must come before single-quote handling).
    if (c === '"' && next === '"' && next2 === '"') {
      s.inTripleDouble = true;
      i += 3;
      continue;
    }
    if (c === "'" && next === "'" && next2 === "'") {
      s.inTripleSingle = true;
      i += 3;
      continue;
    }
    if (c === '`') {
      s.inTemplate = true;
      i += 1;
      continue;
    }

    // ─── Single-line strings: walk to the matching close on the same line,
    // honouring `\` escapes. If no close, treat as syntax error → string
    // ends at EOL (we don't carry single-quote state across lines).
    if (c === '"' || c === "'") {
      const quote = c;
      i += 1;
      while (i < line.length) {
        const ch = line[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // ─── Brackets contribute to depth.
    if (c === '{' || c === '(' || c === '[') s.bracketDepth += 1;
    if (c === '}' || c === ')' || c === ']') s.bracketDepth -= 1;

    i += 1;
  }
  return s;
}

/**
 * Purpose: Compute the end-of-line state for every line in `lines`.
 * How: Fold `walkLine` from the initial state.
 */
export function computeLineStates(lines: string[]): LineState[] {
  const states: LineState[] = [];
  let s = INITIAL_STATE;
  for (const line of lines) {
    s = walkLine(line, s);
    states.push(s);
  }
  return states;
}

/**
 * Purpose: Decide whether we can safely cut after line `i`.
 * How: No open multi-line construct at the end of the line. Bracket depth
 *   doesn't disqualify (multi-line objects/arrays are common and tolerated),
 *   it only affects the score.
 */
function isSafeCut(state: LineState): boolean {
  return (
    !state.inBlockComment &&
    state.ocamlCommentDepth === 0 &&
    !state.inTripleDouble &&
    !state.inTripleSingle &&
    !state.inTemplate
  );
}

/**
 * Purpose: Score a candidate cut after line `i` (higher = better).
 * How: Base score from structural signals (blank line, ends with `}`/`;`,
 *   line at indent minimum). Bonus when depth is back to zero / minimum.
 *   Distance penalty centred on `pivot` keeps chunks balanced.
 */
function scoreCandidate(
  lines: string[],
  states: LineState[],
  i: number,
  pivot: number,
  minIndentInBlock: number,
  minDepthInBlock: number,
): number {
  if (!isSafeCut(states[i] ?? INITIAL_STATE)) return -Infinity;
  const line = lines[i] ?? '';
  const trimmed = line.trim();
  const indent = line.length - line.trimStart().length;
  let base = 20;
  if (trimmed === '') {
    base = 100;
  } else if (trimmed.endsWith('}')) {
    base = 80;
  } else if (trimmed.endsWith(';') || trimmed.endsWith(',')) {
    base = 60;
  } else if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    base = 50;
  } else if (indent === minIndentInBlock) {
    base = 40;
  }
  const depth = states[i]?.bracketDepth ?? 0;
  const depthBonus =
    depth === 0 ? 30 : depth === minDepthInBlock ? 15 : 0;
  const distancePenalty = Math.abs(i - pivot) * 2;
  return base + depthBonus - distancePenalty;
}

/**
 * Purpose: Find the best line index to cut after, within `[pivot - slack,
 *   pivot + slack]` (clamped to valid range).
 * How: Score every candidate via `scoreCandidate`, return the argmax.
 *   Returns `null` if no safe candidate found (caller falls back to a hard
 *   cut at the pivot).
 */
function findBestSplit(
  lines: string[],
  states: LineState[],
  pivot: number,
  slack: number,
  minIndentInBlock: number,
  minDepthInBlock: number,
): number | null {
  const lo = Math.max(0, pivot - slack);
  const hi = Math.min(lines.length - 1, pivot + slack);
  let bestScore = -Infinity;
  let bestIdx: number | null = null;
  for (let i = lo; i <= hi; i += 1) {
    const score = scoreCandidate(
      lines,
      states,
      i,
      pivot,
      minIndentInBlock,
      minDepthInBlock,
    );
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore > -Infinity ? bestIdx : null;
}

/**
 * Purpose: Drive splitting across an entire block — return cut indices.
 * How: Greedy walk from line 0; at each step, target `cursor + targetSize`,
 *   pick the best candidate via `findBestSplit`, fall back to a hard cut
 *   at the pivot if no safe candidate exists. Stop when the remaining
 *   tail fits in a single chunk.
 */
export function findAllSplits(
  lines: string[],
  targetSize: number,
  slack: number,
): number[] {
  if (lines.length <= targetSize + slack) return [];
  const states = computeLineStates(lines);
  // Establish "min indent" and "min depth" over the whole block once, to
  // give the scorer a stable reference.
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (indent < minIndent) minIndent = indent;
  }
  if (minIndent === Infinity) minIndent = 0;
  let minDepth = Infinity;
  for (const s of states) {
    if (s.bracketDepth < minDepth) minDepth = s.bracketDepth;
  }
  if (minDepth === Infinity) minDepth = 0;

  const cuts: number[] = [];
  let cursor = 0;
  // `cursor` is the start of the current chunk. We keep emitting cuts while
  // the remaining tail exceeds one chunk-worth of lines.
  while (lines.length - cursor > targetSize + slack) {
    const pivot = cursor + targetSize;
    const best = findBestSplit(
      lines,
      states,
      pivot,
      slack,
      minIndent,
      minDepth,
    );
    const cut = best ?? pivot;
    cuts.push(cut);
    cursor = cut + 1;
  }
  return cuts;
}

/**
 * Purpose: Rewrite `<pre>` elements taller than the threshold into several
 *   contiguous `<pre>` siblings, each re-highlighted.
 * How: For each oversized `<pre>`, extract raw text + language, call
 *   `findAllSplits`, then insert one new `<pre>` per chunk. The original
 *   `<pre>`'s `data-line` is copied to the first chunk so scroll-sync
 *   still resolves. Chunks get `pre-chunk-{first,middle,last}` classes
 *   for the visual-continuity CSS (cf. `pagedCss`).
 */
export function splitLongPreBlocks(
  root: HTMLElement,
  targetSize: number,
  slack: number,
): void {
  const pres = [...root.querySelectorAll<HTMLPreElement>('pre')];
  for (const pre of pres) {
    // Skip non-code <pre> (some custom blocks emit bare <pre>).
    const code = pre.querySelector('code');
    if (!code) continue;
    const text = code.textContent ?? '';
    const lines = text.split('\n');
    // Drop a trailing empty line that highlight.js / marked sometimes
    // emits — it shifts the line count by one without being visible.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length <= targetSize + slack) continue;
    const cuts = findAllSplits(lines, targetSize, slack);
    if (cuts.length === 0) continue;

    // Extract language hint from the original `<code class="language-X">`.
    const className = code.className;
    const langMatch = /language-([\w+-]+)/.exec(className);
    const lang = langMatch ? langMatch[1]! : '';

    // Build chunk arrays from cuts.
    const chunks: string[][] = [];
    let start = 0;
    for (const cut of cuts) {
      chunks.push(lines.slice(start, cut + 1));
      start = cut + 1;
    }
    chunks.push(lines.slice(start));

    // Create replacement <pre> elements.
    const parent = pre.parentNode;
    if (!parent) continue;
    const dataLine = pre.dataset.line;
    const doc = pre.ownerDocument;
    const fragments: HTMLElement[] = [];
    chunks.forEach((chunkLines, idx) => {
      const chunkText = chunkLines.join('\n');
      let html: string;
      if (lang && isKnownLanguage(lang)) {
        html = highlightCode(chunkText, lang);
      } else {
        // Unknown language → keep raw text inside a plain <pre><code>.
        html =
          `<pre><code${lang ? ` class="language-${lang}"` : ''}>` +
          escapeHtml(chunkText) +
          `</code></pre>`;
      }
      const tmpl = doc.createElement('template');
      tmpl.innerHTML = html.trim();
      const newPre = tmpl.content.firstElementChild as HTMLElement | null;
      if (!newPre) return;
      // Visual-continuity marker.
      const role =
        idx === 0
          ? 'pre-chunk-first'
          : idx === chunks.length - 1
            ? 'pre-chunk-last'
            : 'pre-chunk-middle';
      newPre.classList.add(role);
      // Keep scroll-sync pointing at the original source line on the first
      // chunk only — subsequent chunks resolve to the first via the closest
      // `[data-line]` ancestor walk done in scroll-sync.
      if (idx === 0 && dataLine !== undefined) {
        newPre.dataset.line = dataLine;
      }
      fragments.push(newPre);
    });

    for (const f of fragments) parent.insertBefore(f, pre);
    parent.removeChild(pre);
  }
}

/**
 * Purpose: Minimal HTML escape for the no-language fallback (raw text only).
 * How: Replace `&`, `<`, `>` with named entities. Quotes don't need escaping
 *   because we're inserting into text content, not attribute values.
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
