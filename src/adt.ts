/********************************* adt.ts **************************************
 *
 * Purpose: Render the ` ```adt ` fence — algebraic-data-type definitions
 *   in BNF-ish form (`LHS ::= Ctor | Ctor(args) | …`) as an aligned grid.
 * How: Parse line-by-line into `(LHS, alternatives)` pairs, then emit a
 *   4-column CSS grid; unrecognised lines are surfaced in a warning panel.
 *
 *******************************************************************************/

/**
 * Purpose: One alternative of an ADT definition.
 * How: `content` = the body; `annotation` = trailing `(* … *)` text.
 */
interface AdtAlt {
  content: string;
  annotation?: string;
}

/**
 * Purpose: A single ADT definition (LHS + alternatives).
 * How: `lhs` is the name left of `::=`; `alts` are the `|`-separated branches.
 */
interface AdtDef {
  lhs: string;
  alts: AdtAlt[];
}

/**
 * Purpose: A line that didn't parse — surfaced to the reader.
 * How: 1-based `line` (from block start) + trimmed `text`.
 */
interface AdtWarning {
  line: number;
  text: string;
}

/**
 * Purpose: `parseAdtBlock` output bundle.
 * How: Successful `defs` plus accumulated `warnings`.
 */
interface AdtParseResult {
  defs: AdtDef[];
  warnings: AdtWarning[];
}

/**
 * Purpose: Entry point of the `adt` fence renderer.
 * How: Parse, render warnings (if any) then the grid, catch errors.
 */
export function renderAdtBlock(source: string): string {
  try {
    const { defs, warnings } = parseAdtBlock(source);
    if (defs.length === 0 && warnings.length === 0) {
      return `<pre class="adt-error">No ADT definitions found.</pre>`;
    }
    const warn =
      warnings.length === 0 ? '' : renderWarnings(warnings);
    const body = defs.length === 0 ? '' : renderDefs(defs);
    return warn + body;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<pre class="adt-error">ADT parse error: ${escapeHtml(msg)}</pre>`;
  }
}

const HEAD_RE = /^([A-Za-z_]\w*)\s*::=\s*(.*)$/;
const CONT_RE = /^\|\s*(.*)$/;

/**
 * Purpose: Tokenise the block into defs + warnings.
 * How: Match each line against HEAD_RE / CONT_RE; otherwise record a warning.
 */
function parseAdtBlock(source: string): AdtParseResult {
  const defs: AdtDef[] = [];
  const warnings: AdtWarning[] = [];
  let current: AdtDef | null = null;

  source.split('\n').forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (line === '') return;

    const head = HEAD_RE.exec(line);
    if (head) {
      if (current !== null) defs.push(current);
      current = { lhs: head[1] ?? '', alts: [] };
      addAlts(current, head[2] ?? '');
      return;
    }

    const cont = CONT_RE.exec(line);
    if (cont && current !== null) {
      addAlts(current, cont[1] ?? '');
      return;
    }

    warnings.push({ line: idx + 1, text: line });
  });

  if (current !== null) defs.push(current);
  return { defs, warnings };
}

/**
 * Purpose: HTML panel listing every unrecognised line above the rendered defs.
 * How: `<div class="adt-warnings" role="alert">` containing an `<ol>`.
 */
function renderWarnings(warnings: AdtWarning[]): string {
  const items = warnings
    .map(
      (w) =>
        `<li>Line ${w.line}: <code>${escapeHtml(w.text)}</code></li>`,
    )
    .join('');
  return (
    `<div class="adt-warnings" role="alert">` +
    `<strong>Unrecognised line${warnings.length > 1 ? 's' : ''}` +
    ` in this ADT block — neither a <code>LHS ::= …</code> head` +
    ` nor a <code>| …</code> continuation:</strong>` +
    `<ol>${items}</ol>` +
    `</div>`
  );
}

/**
 * Purpose: Append the alternatives from a `|`-separated RHS to a definition.
 * How: `splitOnPipe` then `extractAnnotation` on each non-empty branch.
 */
function addAlts(def: AdtDef, rhs: string): void {
  for (const alt of splitOnPipe(rhs)) {
    const trimmed = alt.trim();
    if (trimmed === '') continue;
    def.alts.push(extractAnnotation(trimmed));
  }
}

/**
 * Purpose: Split a RHS on `|`, ignoring `|` inside `(…)` and `(* … *)`.
 * How: One-pass scan with two depth flags (`depth` for parens, `inComment`).
 */
function splitOnPipe(s: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  let inComment = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] ?? '';
    if (!inComment && c === '(' && s[i + 1] === '*') {
      inComment = true;
      cur += '(*';
      i += 1;
      continue;
    }
    if (inComment) {
      if (c === '*' && s[i + 1] === ')') {
        inComment = false;
        cur += '*)';
        i += 1;
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '(') {
      depth += 1;
      cur += c;
      continue;
    }
    if (c === ')') {
      depth -= 1;
      cur += c;
      continue;
    }
    if (c === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}

/**
 * Purpose: Strip a trailing `(* … *)` from an alternative as its annotation.
 * How: One regex match; falls through to a bare `{ content }` otherwise.
 */
function extractAnnotation(s: string): AdtAlt {
  const m = /^(.*?)\s*\(\*\s*([\s\S]*?)\s*\*\)\s*$/.exec(s);
  if (m) {
    return { content: (m[1] ?? '').trim(), annotation: (m[2] ?? '').trim() };
  }
  return { content: s.trim() };
}

const SEP_INLINE = ' <span class="adt-sep-inline">|</span> ';

/**
 * Purpose: Render one row of the 4-column grid as concatenated `<span>`s.
 * How: Plain template, escaping done by the caller.
 */
function row(lhs: string, sep: string, alt: string, ann: string): string {
  return (
    `<span class="adt-lhs">${lhs}</span>` +
    `<span class="adt-sep">${sep}</span>` +
    `<span class="adt-alt">${alt}</span>` +
    `<span class="adt-ann">${ann}</span>`
  );
}

/**
 * Purpose: Emit the 4-column grid of `<span>`s for the rendered defs.
 * How: Inline def → one joined row; expanded def → one row per alt.
 */
function renderDefs(defs: AdtDef[]): string {
  const typeNames = new Set(defs.map((d) => d.lhs));
  const rows: string[] = [];
  defs.forEach((def, defIndex) => {
    if (defIndex > 0) rows.push(`<span class="adt-spacer"></span>`);
    if (isInlineDef(def)) {
      const alts = def.alts.map((a) => highlightContent(a.content, typeNames));
      rows.push(row(escapeHtml(def.lhs), '::=', alts.join(SEP_INLINE), ''));
      return;
    }
    def.alts.forEach((alt, i) => {
      rows.push(
        row(
          i === 0 ? escapeHtml(def.lhs) : '',
          i === 0 ? '::=' : '|',
          highlightContent(alt.content, typeNames),
          alt.annotation === undefined ? '' : escapeHtml(alt.annotation),
        ),
      );
    });
  });
  return `<div class="adt-block">${rows.join('')}</div>`;
}

/**
 * Purpose: Decide whether a def renders inline (all alts on one row).
 * How: True iff every alt is a bare name — no `(` and no annotation.
 */
function isInlineDef(def: AdtDef): boolean {
  return def.alts.every(
    (alt) => alt.annotation === undefined && !alt.content.includes('('),
  );
}

/**
 * Purpose: Tag capitalised identifiers as types or constructors.
 * How: Regex over the escaped string; class picked from `typeNames` lookup.
 */
function highlightContent(s: string, typeNames: ReadonlySet<string>): string {
  return escapeHtml(s).replaceAll(/\b([A-Z][\w]*)/g, (_match, name: string) => {
    const cls = typeNames.has(name) ? 'adt-type' : 'adt-ctor';
    return `<span class="${cls}">${name}</span>`;
  });
}

/**
 * Purpose: Minimal HTML entity escape for `&`, `<`, `>`, `"`.
 * How: Sequential `replaceAll`; single quotes left alone (safe in `"`-quoted attrs).
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
