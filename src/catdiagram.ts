/********************************* catdiagram.ts *******************************
 *
 * Purpose: Parse + typecheck the `catdiagram` DSL (CD-SPEC.md) — a textual
 *   description of a small category (signature + commutativity equations +
 *   universal arrows) intended for transpilation to a graphical backend
 *   (SVG native by default, Mermaid fallback). See [catdiagram-svg.ts] /
 *   [catdiagram-mermaid.ts].
 * How: Hand-written recursive-descent parser, one declaration per line.
 *   Lines are classified by their tokens — `:` + `->` for a morphism
 *   declaration (with `by (…)` it's induced; with `= path` after the
 *   endpoints it carries a shortcut equation), bare `path = path` for a
 *   standalone equation, leading `direction:` / `objects:` for the two
 *   directives. No section keywords; order doesn't matter.
 *
 *   Typechecker walks the AST after parsing: every object referenced in
 *   a morphism / induced clause must exist (inferred from endpoints, or
 *   explicitly listed if `objects:` was given); every morphism in an
 *   `induced … by (…)` must be in the morphism table; every equation's
 *   two sides must have matching dom + cod after right-to-left
 *   composition (`g . f` = $g \circ f$).
 *
 *******************************************************************************/

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export type MorphismProp = 'epi' | 'mono' | 'iso';

export interface Morphism {
  line: number; // 1-based, for error messages
  name: string;
  dom: string;
  cod: string;
  props: MorphismProp[];
}

export interface Induced {
  line: number;
  name: string;
  dom: string;
  cod: string;
  by: string[]; // empty for absolute universals (terminal / initial)
}

export interface Equation {
  line: number;
  lhs: string[]; // path read right-to-left: `g . f` → ['g', 'f']
  rhs: string[];
}

export interface CdAst {
  direction: Direction;
  objects: { line: number; name: string }[];
  morphisms: Morphism[];
  induced: Induced[];
  equations: Equation[];
  // True when the source contained an explicit `objects:` directive.
  // Drives stricter typo detection (every morphism endpoint must be in
  // the declared list); when false, objects are inferred from endpoints.
  objectsDeclared: boolean;
}

export interface CdError {
  line: number; // 0 when the error doesn't tie to a specific line
  message: string;
}

export interface CdParseResult {
  ok: boolean;
  ast: CdAst;
  errors: CdError[];
}

// Unicode-aware identifier matcher — `letter` and `digit` follow Unicode
// categories L and N (per CD-SPEC §3.1). Greek (`π`, `Γ`), subscripts
// (`π₁`, `x₂`), blackboard bold (`ℕ`), digits all participate naturally.
// One optional level of balanced `(…)` lets `F(X)`, `Hom(A, B)` parse
// without admitting unbalanced runs like `F(X(`.
const NAME_RE = String.raw`[\p{L}][\p{L}\p{N}_]*`;
const IDENT_RE = new RegExp(
  String.raw`^${NAME_RE}(?:\(\s*${NAME_RE}(?:\s*,\s*${NAME_RE})*\s*\))?$`,
  'u',
);
// Same pattern but as a capture for use inside larger regexes.
const IDENT = `(?:${NAME_RE}(?:\\(\\s*${NAME_RE}(?:\\s*,\\s*${NAME_RE})*\\s*\\))?)`;

// Reserved words: can't be used as object or morphism names.
const RESERVED = new Set([
  'direction',
  'objects',
  'by',
  'epi',
  'mono',
  'iso',
  'TB',
  'BT',
  'LR',
  'RL',
]);

/**
 * Purpose: Parse a `catdiagram` source string into an AST + diagnostics.
 * How: Normalise Unicode arrows to ASCII, strip comments, walk each non-
 *   blank line through `parseLine`. Diagnostics are collected — we
 *   don't abort on first error so the user sees them all at once.
 *   Typecheck happens separately via `typecheck` below.
 */
export function parse(source: string): CdParseResult {
  const errors: CdError[] = [];
  const ast: CdAst = {
    direction: 'LR',
    objects: [],
    morphisms: [],
    induced: [],
    equations: [],
    objectsDeclared: false,
  };

  // The editor's input ligatures convert `->` to `→` at typing time —
  // so a catdiagram written naturally in the editor arrives with
  // Unicode arrows. Normalise to ASCII so the rest of the parser stays
  // purely ASCII for the syntactic markers.
  const normalized = source.replaceAll('→', '->').replaceAll('⟶', '->');

  const lines = normalized.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    // Strip comment (`#` to EOL) — but only at top level, not inside
    // an identifier (we don't have `#` in identifiers, so simple).
    const stripped = (lines[i] ?? '').replace(/#.*$/u, '').trim();
    if (stripped === '') continue;
    parseLine(stripped, lineNum, ast, errors);
  }

  if (ast.morphisms.length === 0 && ast.induced.length === 0) {
    errors.push({
      line: 0,
      message: 'empty diagram — declare at least one morphism (`f : A -> B`)',
    });
  }

  // Sanity-check: every morphism / induced endpoint produces an inferred
  // object. Collect those into the objects list (deduplicated, preserving
  // first-mention order) unless an explicit `objects:` was given.
  if (!ast.objectsDeclared) {
    const seen = new Set<string>();
    for (const o of ast.objects) seen.add(o.name);
    const consider = (name: string, line: number): void => {
      if (name === '' || seen.has(name)) return;
      seen.add(name);
      ast.objects.push({ line, name });
    };
    for (const m of ast.morphisms) {
      consider(m.dom, m.line);
      consider(m.cod, m.line);
    }
    for (const i of ast.induced) {
      consider(i.dom, i.line);
      consider(i.cod, i.line);
    }
  }

  return { ok: errors.length === 0, ast, errors };
}

/**
 * Purpose: Classify one source line and dispatch to the right parser.
 * How: Cheap prefix / token tests determine the line's kind (directive,
 *   morphism, induced, equation). Each branch validates + pushes to AST
 *   or errors.
 */
function parseLine(text: string, line: number, ast: CdAst, errors: CdError[]): void {
  // Directives — start with a keyword + colon.
  const dirMatch = /^(direction|objects)\s*:\s*(.*)$/u.exec(text);
  if (dirMatch) {
    const keyword = dirMatch[1];
    const rest = (dirMatch[2] ?? '').trim();
    if (keyword === 'direction') parseDirection(rest, line, ast, errors);
    else parseObjects(rest, line, ast, errors);
    return;
  }

  // Morphism / induced — must have `:` (after the name) AND `->`. The
  // `:` distinguishes from a bare equation `g . f = h . k`.
  // The check is structural: a morphism line matches the pattern
  //   <name> : <dom> -> <cod>  [optional (modifier)]  [optional = path]  [optional by (…)]
  if (/^[^=]*:[^=]*->/u.test(text)) {
    parseMorphismLine(text, line, ast, errors);
    return;
  }

  // Equation — contains `=` but no morphism-declaration pattern.
  if (text.includes('=')) {
    parseEquation(text, line, ast, errors);
    return;
  }

  errors.push({
    line,
    message: `unrecognised line (expected morphism, equation, or directive): "${text}"`,
  });
}

function parseDirection(rest: string, line: number, ast: CdAst, errors: CdError[]): void {
  if (!/^(TB|BT|LR|RL)$/u.test(rest)) {
    errors.push({ line, message: `direction must be TB / BT / LR / RL, got "${rest}"` });
    return;
  }
  ast.direction = rest as Direction;
}

function parseObjects(rest: string, line: number, ast: CdAst, errors: CdError[]): void {
  ast.objectsDeclared = true;
  const names = rest.split(',').map((s) => s.trim()).filter((s) => s !== '');
  for (const n of names) {
    if (!IDENT_RE.test(n)) {
      errors.push({ line, message: `invalid object identifier: "${n}"` });
      continue;
    }
    if (RESERVED.has(n)) {
      errors.push({ line, message: `"${n}" is a reserved keyword, can't be an object name` });
      continue;
    }
    if (ast.objects.some((o) => o.name === n)) {
      errors.push({ line, message: `duplicate object: "${n}"` });
      continue;
    }
    ast.objects.push({ line, name: n });
  }
}

// Morphism declaration matcher:
//   <name> ":" <dom> "->" <cod>  [<modifier>]  ([= <path>]  |  [by (<args>)])
//
// The two trailing forms are mutually exclusive — `=` for a shortcut
// equation, `by (...)` for an induced morphism. Both are forbidden on
// the same line.
const MORPHISM_HEAD_RE = new RegExp(
  `^(${NAME_RE}(?:\\(\\s*${NAME_RE}(?:\\s*,\\s*${NAME_RE})*\\s*\\))?)` +
    `\\s*:\\s*` +
    `(${NAME_RE}(?:\\(\\s*${NAME_RE}(?:\\s*,\\s*${NAME_RE})*\\s*\\))?)` +
    `\\s*->\\s*` +
    `(${NAME_RE}(?:\\(\\s*${NAME_RE}(?:\\s*,\\s*${NAME_RE})*\\s*\\))?)` +
    `(?:\\s*\\(\\s*([^)]+?)\\s*\\))?` + // optional (mono, epi, iso)
    `\\s*(.*)$`, // trailing: either `= path` or `by (...)` or nothing
  'u',
);

function parseMorphismLine(text: string, line: number, ast: CdAst, errors: CdError[]): void {
  const m = MORPHISM_HEAD_RE.exec(text);
  if (!m) {
    errors.push({
      line,
      message: `morphism syntax: expected "name : Dom -> Cod [(mono|epi|iso)] [= path | by (args)]", got "${text}"`,
    });
    return;
  }
  const [, name, dom, cod, modRaw, trailRaw] = m;
  if (RESERVED.has(name ?? '')) {
    errors.push({ line, message: `"${name}" is a reserved keyword, can't be a morphism name` });
    return;
  }
  const props: MorphismProp[] = [];
  if (modRaw !== undefined) {
    for (const p of modRaw.split(',').map((s) => s.trim())) {
      if (p === 'epi' || p === 'mono' || p === 'iso') {
        if (!props.includes(p)) props.push(p);
      } else {
        errors.push({ line, message: `unknown modifier "${p}" (allowed: epi, mono, iso)` });
      }
    }
  }
  const trail = (trailRaw ?? '').trim();
  if (trail === '') {
    ast.morphisms.push({ line, name: name ?? '', dom: dom ?? '', cod: cod ?? '', props });
    return;
  }
  // `by (...)` — induced morphism.
  const byMatch = /^by\s*\(\s*([^)]*)\s*\)\s*$/u.exec(trail);
  if (byMatch) {
    const argRaw = byMatch[1] ?? '';
    const by = argRaw.trim() === ''
      ? []
      : argRaw.split(',').map((s) => s.trim()).filter((s) => s !== '');
    for (const a of by) {
      if (!IDENT_RE.test(a)) {
        errors.push({ line, message: `invalid morphism reference in by(): "${a}"` });
      }
    }
    ast.induced.push({ line, name: name ?? '', dom: dom ?? '', cod: cod ?? '', by });
    return;
  }
  // `= path` — shortcut equation co-located with declaration.
  if (trail.startsWith('=')) {
    const rhs = trail.slice(1).trim();
    const path = parsePath(rhs, line, errors);
    if (path === null) return;
    ast.morphisms.push({ line, name: name ?? '', dom: dom ?? '', cod: cod ?? '', props });
    ast.equations.push({ line, lhs: [name ?? ''], rhs: path });
    return;
  }
  errors.push({
    line,
    message: `unexpected trailing tokens after morphism declaration: "${trail}" (expected "= path" or "by (args)")`,
  });
}

function parseEquation(text: string, line: number, ast: CdAst, errors: CdError[]): void {
  const eqIdx = text.indexOf('=');
  const lhsTxt = text.slice(0, eqIdx).trim();
  const rhsTxt = text.slice(eqIdx + 1).trim();
  const lhs = parsePath(lhsTxt, line, errors);
  const rhs = parsePath(rhsTxt, line, errors);
  if (lhs === null || rhs === null) return;
  ast.equations.push({ line, lhs, rhs });
}

/**
 * Purpose: Parse a path `g . f . h` into the list `['g', 'f', 'h']`.
 * How: Split on `.`, trim, validate each as an identifier. Empty path is
 *   an error.
 */
function parsePath(text: string, line: number, errors: CdError[]): string[] | null {
  if (text === '') {
    errors.push({ line, message: 'empty path in equation' });
    return null;
  }
  const parts = text.split('.').map((p) => p.trim());
  for (const p of parts) {
    if (!IDENT_RE.test(p)) {
      errors.push({ line, message: `invalid morphism name in path: "${p}"` });
      return null;
    }
  }
  return parts;
}

// ---- Typechecker --------------------------------------------------------

/**
 * Purpose: Verify the AST is internally consistent — every reference
 *   resolves, every composition is well-typed, every equation's sides
 *   agree on (dom, cod).
 * How: Build a single morphism table (regular + induced share the same
 *   namespace), then walk equations applying COMPOSE and WELLTYPED-EQ
 *   (CD-SPEC §4.3). When `objects:` was declared explicitly, validate
 *   each endpoint is in that list; otherwise the parser already
 *   inferred them, so just check the morphism table cross-refs.
 */
export function typecheck(ast: CdAst): CdError[] {
  const errors: CdError[] = [];
  const objSet = new Set(ast.objects.map((o) => o.name));
  const morTable = new Map<string, { dom: string; cod: string; line: number }>();

  for (const m of ast.morphisms) {
    if (ast.objectsDeclared) {
      if (!objSet.has(m.dom)) {
        errors.push({ line: m.line, message: `unknown object "${m.dom}" (domain of ${m.name})` });
      }
      if (!objSet.has(m.cod)) {
        errors.push({ line: m.line, message: `unknown object "${m.cod}" (codomain of ${m.name})` });
      }
    }
    if (morTable.has(m.name)) {
      errors.push({ line: m.line, message: `duplicate morphism name "${m.name}"` });
    } else {
      morTable.set(m.name, { dom: m.dom, cod: m.cod, line: m.line });
    }
  }

  for (const i of ast.induced) {
    if (ast.objectsDeclared) {
      if (!objSet.has(i.dom)) {
        errors.push({ line: i.line, message: `unknown object "${i.dom}" (domain of ${i.name})` });
      }
      if (!objSet.has(i.cod)) {
        errors.push({ line: i.line, message: `unknown object "${i.cod}" (codomain of ${i.name})` });
      }
    }
    if (morTable.has(i.name)) {
      errors.push({ line: i.line, message: `duplicate morphism name "${i.name}"` });
    } else {
      morTable.set(i.name, { dom: i.dom, cod: i.cod, line: i.line });
    }
    for (const ref of i.by) {
      if (!morTable.has(ref)) {
        errors.push({ line: i.line, message: `unknown morphism "${ref}" in by(…) for ${i.name}` });
      }
    }
  }

  for (const eq of ast.equations) {
    const lhsType = typeOfPath(eq.lhs, morTable, eq.line, errors);
    const rhsType = typeOfPath(eq.rhs, morTable, eq.line, errors);
    if (lhsType === null || rhsType === null) continue;
    // WELLTYPED-EQ (§4.3): both sides must share dom and cod.
    if (lhsType.dom !== rhsType.dom || lhsType.cod !== rhsType.cod) {
      errors.push({
        line: eq.line,
        message: `equation endpoints differ: lhs is ${lhsType.dom}→${lhsType.cod}, rhs is ${rhsType.dom}→${rhsType.cod}`,
      });
    }
  }

  return errors;
}

/**
 * Purpose: Compute the (dom, cod) type of a composed path, applying COMPOSE
 *   (§4.3) right-to-left as $g \circ f$ reads.
 * How: The rightmost morphism is applied first. Iterate from the right;
 *   each new morphism on the left must have its domain equal to the
 *   current accumulated codomain.
 */
function typeOfPath(
  path: string[],
  morTable: Map<string, { dom: string; cod: string; line: number }>,
  line: number,
  errors: CdError[],
): { dom: string; cod: string } | null {
  if (path.length === 0) return null;
  const last = morTable.get(path[path.length - 1] ?? '');
  if (!last) {
    errors.push({ line, message: `unknown morphism "${path[path.length - 1] ?? ''}"` });
    return null;
  }
  let { dom, cod } = last;
  for (let i = path.length - 2; i >= 0; i -= 1) {
    const m = morTable.get(path[i] ?? '');
    if (!m) {
      errors.push({ line, message: `unknown morphism "${path[i] ?? ''}"` });
      return null;
    }
    // COMPOSE: cod(prev) must equal dom(current applied next on the left).
    if (m.dom !== cod) {
      errors.push({
        line,
        message: `compose mismatch in path: ${path[i]} expects domain "${m.dom}" but got "${cod}" from the right`,
      });
      return null;
    }
    cod = m.cod;
  }
  return { dom, cod };
}

// Keep IDENT exported for tooling that wants the same identifier regex.
export { IDENT, NAME_RE };
