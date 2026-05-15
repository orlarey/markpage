// Renders an ` ```adt ` (Algebraic Data Type) fenced block. Format:
//
//   TypeName ::= Ctor1(arg1, ...)        (* annotation *)
//             |  Ctor2(arg2, ...)        (* annotation *)
//             |  Ctor3
//   OtherType ::= …
//
// Layout: a 4-column CSS grid (LHS | "::=" or "|" | alternative |
// annotation). `|` separators line up vertically across the block
// — LaTeX-style align. Capitalised identifiers inside the
// alternatives are highlighted as constructors / type references;
// lowercase identifiers and operators stay plain text.
//
// Pure function — anything outside a detected definition is
// skipped silently, so a stray prose line doesn't break the block.

interface AdtAlt {
  content: string;
  annotation?: string;
}

interface AdtDef {
  lhs: string;
  alts: AdtAlt[];
}

interface AdtWarning {
  // 1-based line number, counting from the first line of the
  // fenced block's body.
  line: number;
  text: string;
}

interface AdtParseResult {
  defs: AdtDef[];
  warnings: AdtWarning[];
}

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

    // Unrecognised: record as a warning so a typo (`Expr :=` instead
    // of `Expr ::=`, or a stray prose line inside the block) doesn't
    // silently disappear from the output. For a formal-spec tool,
    // visible feedback beats clever guesswork.
    warnings.push({ line: idx + 1, text: line });
  });

  if (current !== null) defs.push(current);
  return { defs, warnings };
}

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

function addAlts(def: AdtDef, rhs: string): void {
  for (const alt of splitOnPipe(rhs)) {
    const trimmed = alt.trim();
    if (trimmed === '') continue;
    def.alts.push(extractAnnotation(trimmed));
  }
}

// Splits `s` on `|` while respecting parentheses and `(* … *)`
// comments — otherwise an arg list like `Op(a | b, c)` or a
// comment containing `|` would be over-split.
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

// Pulls a trailing `(* … *)` off the end of an alternative and
// returns it as the annotation. Anything inside the comment is
// kept verbatim — Unicode math like `c ∈ ℝ` survives.
function extractAnnotation(s: string): AdtAlt {
  const m = /^(.*?)\s*\(\*\s*([\s\S]*?)\s*\*\)\s*$/.exec(s);
  if (m) {
    return { content: (m[1] ?? '').trim(), annotation: (m[2] ?? '').trim() };
  }
  return { content: s.trim() };
}

function renderDefs(defs: AdtDef[]): string {
  // Names that appear on the LEFT of `::=` are TYPES (defined by
  // rules). Capitalised names in alt content that match this set
  // are type references (e.g. recursive `Expr` inside an `Expr`
  // alternative); the rest are pure constructors (`Const`, `Vec`,
  // `Add`, …) and get the dedicated constructor colour.
  const typeNames = new Set(defs.map((d) => d.lhs));

  const rows: string[] = [];
  defs.forEach((def, defIndex) => {
    if (defIndex > 0) {
      rows.push(`<span class="adt-spacer"></span>`);
    }
    if (isInlineDef(def)) {
      const joined = def.alts
        .map((alt) => highlightContent(alt.content, typeNames))
        .join(' <span class="adt-sep-inline">|</span> ');
      rows.push(
        `<span class="adt-lhs">${escapeHtml(def.lhs)}</span>` +
          `<span class="adt-sep">::=</span>` +
          `<span class="adt-alt">${joined}</span>` +
          `<span class="adt-ann"></span>`,
      );
      return;
    }
    def.alts.forEach((alt, i) => {
      const lhs = i === 0 ? escapeHtml(def.lhs) : '';
      const sep = i === 0 ? '::=' : '|';
      rows.push(
        `<span class="adt-lhs">${lhs}</span>` +
          `<span class="adt-sep">${sep}</span>` +
          `<span class="adt-alt">${highlightContent(alt.content, typeNames)}</span>` +
          `<span class="adt-ann">${
            alt.annotation === undefined
              ? ''
              : escapeHtml(alt.annotation)
          }</span>`,
      );
    });
  });
  return `<div class="adt-block">${rows.join('')}</div>`;
}

function isInlineDef(def: AdtDef): boolean {
  return def.alts.every(
    (alt) => alt.annotation === undefined && !alt.content.includes('('),
  );
}

// Highlights capitalised identifiers. Names that appear elsewhere
// in the block as a LHS (i.e. defined by a rule) are TYPE
// references and get `adt-type`; the rest are pure constructors
// and get `adt-ctor`. Variables (lowercase) stay plain text.
function highlightContent(s: string, typeNames: ReadonlySet<string>): string {
  return escapeHtml(s).replaceAll(/\b([A-Z][\w]*)/g, (_match, name: string) => {
    const cls = typeNames.has(name) ? 'adt-type' : 'adt-ctor';
    return `<span class="${cls}">${name}</span>`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
