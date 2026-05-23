/********************************* catdiagram.ts *******************************
 *
 * Purpose: Parse + typecheck the `catdiagram` DSL (CD-SPEC.md) — a textual
 *   description of a small category (signature + commutativity equations +
 *   universal arrows) intended for transpilation to a graphical backend
 *   (Mermaid; see [catdiagram-mermaid.ts]).
 * How: Hand-written recursive-descent parser that walks the source line by
 *   line. The grammar is small (4 sections + a directive) so we don't need a
 *   separate lexer pass — sections start at column 0, contents are indented.
 *   Comments (`# …`) and blank lines are dropped first; section headers
 *   (`objects:`, `morphisms:`, etc.) drive a state machine.
 *
 *   The typechecker walks the AST after parsing: every object referenced in
 *   a morphism / induced clause must be declared in `objects:`; every
 *   morphism in an `induced … by (…)` must be in `morphisms:` or a prior
 *   `induced`; every equation's two sides must have matching dom + cod
 *   after right-to-left composition (`g . f` = $g \circ f$).
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
// Matches an identifier and returns the matched string (used by tokenizers
// that need to consume an identifier out of a longer string).
const IDENT_CAPTURE_RE = new RegExp(
  `(${NAME_RE}(?:\\(\\s*${NAME_RE}(?:\\s*,\\s*${NAME_RE})*\\s*\\))?)`,
  'u',
);

/**
 * Purpose: Parse a `catdiagram` source string into an AST + diagnostics.
 * How: Strip comments, drive a section state machine line by line, call the
 *   per-section parser. Parser errors don't abort — we collect as many as
 *   possible so the user sees all problems at once. Typecheck happens
 *   separately via `typecheck` below.
 */
export function parse(source: string): CdParseResult {
  const errors: CdError[] = [];
  const ast: CdAst = {
    direction: 'LR',
    objects: [],
    morphisms: [],
    induced: [],
    equations: [],
  };

  // The editor's input ligatures convert `->` to `→` at typing time —
  // so a catdiagram written naturally in the editor arrives here with
  // Unicode arrows, not ASCII. Normalise back to `->` (and the long
  // form `⟶`) so the rest of the parser stays purely ASCII.
  const normalized = source.replaceAll('→', '->').replaceAll('⟶', '->');

  // Strip comments (`#` to EOL) but keep line numbering by replacing
  // commented text with empty so line indices stay aligned.
  const rawLines = normalized.split('\n').map((l) => l.replace(/#.*$/u, '').trimEnd());

  type Section = 'direction' | 'objects' | 'morphisms' | 'induced' | 'equations' | null;
  // The grammar requires a fixed order (direction? objects morphisms induced? equations?).
  // The state machine refuses out-of-order section headers.
  const SECTION_ORDER: Section[] = ['direction', 'objects', 'morphisms', 'induced', 'equations'];
  let lastSectionIdx = -1;
  let currentSection: Section = null;

  for (let i = 0; i < rawLines.length; i += 1) {
    const lineNum = i + 1;
    const line = rawLines[i] ?? '';
    if (line.trim() === '') continue;

    // Section header? Headers start at column 0 with a known keyword
    // followed by `:`. Indented content always belongs to the current
    // section.
    const headerMatch = /^(direction|objects|morphisms|induced|equations)\s*:\s*(.*)$/u.exec(line);
    if (headerMatch && line[0] !== ' ' && line[0] !== '\t') {
      const name = headerMatch[1] as Section;
      const rest = (headerMatch[2] ?? '').trim();
      if (name === null) continue;
      const newIdx = SECTION_ORDER.indexOf(name);
      if (newIdx <= lastSectionIdx) {
        errors.push({
          line: lineNum,
          message: `section "${name}" appears after "${SECTION_ORDER[lastSectionIdx] ?? '?'}" — required order is directive → objects → morphisms → induced → equations`,
        });
      }
      lastSectionIdx = newIdx;
      currentSection = name;
      if (rest !== '') parseSectionLine(name, rest, lineNum, ast, errors);
      continue;
    }

    // Body line — dispatch to current section's parser.
    if (currentSection === null) {
      errors.push({ line: lineNum, message: `content before any section header: "${line.trim()}"` });
      continue;
    }
    parseSectionLine(currentSection, line.trim(), lineNum, ast, errors);
  }

  if (ast.objects.length === 0) {
    errors.push({ line: 0, message: 'missing required "objects:" section' });
  }
  if (ast.morphisms.length === 0 && ast.induced.length === 0) {
    errors.push({ line: 0, message: 'missing required "morphisms:" section (or `induced:`)' });
  }

  return { ok: errors.length === 0, ast, errors };
}

/**
 * Purpose: Dispatch one body line to the right per-section parser.
 * How: Switch on the current section; the parser mutates `ast` and pushes
 *   any diagnostic onto `errors`.
 */
function parseSectionLine(
  section: 'direction' | 'objects' | 'morphisms' | 'induced' | 'equations',
  content: string,
  line: number,
  ast: CdAst,
  errors: CdError[],
): void {
  switch (section) {
    case 'direction':
      parseDirective(content, line, ast, errors);
      return;
    case 'objects':
      parseObjects(content, line, ast, errors);
      return;
    case 'morphisms':
      parseMorphism(content, line, ast, errors);
      return;
    case 'induced':
      parseInduced(content, line, ast, errors);
      return;
    case 'equations':
      parseEquation(content, line, ast, errors);
      return;
  }
}

function parseDirective(content: string, line: number, ast: CdAst, errors: CdError[]): void {
  const trimmed = content.trim();
  if (!/^(TB|BT|LR|RL)$/u.test(trimmed)) {
    errors.push({ line, message: `direction must be TB / BT / LR / RL, got "${trimmed}"` });
    return;
  }
  ast.direction = trimmed as Direction;
}

function parseObjects(content: string, line: number, ast: CdAst, errors: CdError[]): void {
  // Comma-separated identifiers, possibly across the header line and
  // continuation lines.
  const parts = content.split(',').map((p) => p.trim()).filter((p) => p !== '');
  for (const p of parts) {
    if (!IDENT_RE.test(p)) {
      errors.push({ line, message: `invalid object identifier: "${p}"` });
      continue;
    }
    if (ast.objects.some((o) => o.name === p)) {
      errors.push({ line, message: `duplicate object: "${p}"` });
      continue;
    }
    ast.objects.push({ line, name: p });
  }
}

// Matches `<name> : <dom> -> <cod> [(prop, prop, …)]` — the optional
// modifier list groups property tags inside one set of parens.
const MORPHISM_RE = new RegExp(
  String.raw`^(${NAME_RE}(?:\(\s*${NAME_RE}(?:\s*,\s*${NAME_RE})*\s*\))?)\s*:\s*` +
    String.raw`(${NAME_RE}(?:\(\s*${NAME_RE}(?:\s*,\s*${NAME_RE})*\s*\))?)\s*->\s*` +
    String.raw`(${NAME_RE}(?:\(\s*${NAME_RE}(?:\s*,\s*${NAME_RE})*\s*\))?)` +
    String.raw`(?:\s*\(\s*([^)]+)\s*\))?\s*$`,
  'u',
);

function parseMorphism(content: string, line: number, ast: CdAst, errors: CdError[]): void {
  const m = MORPHISM_RE.exec(content);
  if (!m) {
    errors.push({ line, message: `morphism syntax: expected "name : Dom -> Cod [(prop, …)]", got "${content}"` });
    return;
  }
  const [, name, dom, cod, propsRaw] = m;
  const props: MorphismProp[] = [];
  if (propsRaw !== undefined) {
    for (const raw of propsRaw.split(',').map((s) => s.trim())) {
      if (raw === 'epi' || raw === 'mono' || raw === 'iso') {
        if (!props.includes(raw)) props.push(raw);
      } else {
        errors.push({ line, message: `unknown modifier "${raw}" (allowed: epi, mono, iso)` });
      }
    }
  }
  ast.morphisms.push({ line, name: name ?? '', dom: dom ?? '', cod: cod ?? '', props });
}

// `name : Dom -> Cod by ( a, b, … )` — same as morphism but with a
// mandatory `by (…)` arglist that may be empty for absolute universals.
const INDUCED_RE = new RegExp(
  String.raw`^(${NAME_RE}(?:\(\s*${NAME_RE}(?:\s*,\s*${NAME_RE})*\s*\))?)\s*:\s*` +
    String.raw`(${NAME_RE}(?:\(\s*${NAME_RE}(?:\s*,\s*${NAME_RE})*\s*\))?)\s*->\s*` +
    String.raw`(${NAME_RE}(?:\(\s*${NAME_RE}(?:\s*,\s*${NAME_RE})*\s*\))?)` +
    String.raw`\s+by\s*\(\s*([^)]*)\s*\)\s*$`,
  'u',
);

function parseInduced(content: string, line: number, ast: CdAst, errors: CdError[]): void {
  const m = INDUCED_RE.exec(content);
  if (!m) {
    errors.push({
      line,
      message: `induced syntax: expected "name : Dom -> Cod by (m1, m2, …)" or "… by ()", got "${content}"`,
    });
    return;
  }
  const [, name, dom, cod, argsRaw] = m;
  const by = (argsRaw ?? '').trim() === ''
    ? []
    : (argsRaw ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  for (const a of by) {
    if (!IDENT_RE.test(a)) {
      errors.push({ line, message: `invalid morphism reference in by(): "${a}"` });
    }
  }
  ast.induced.push({ line, name: name ?? '', dom: dom ?? '', cod: cod ?? '', by });
}

function parseEquation(content: string, line: number, ast: CdAst, errors: CdError[]): void {
  const eqIdx = content.indexOf('=');
  if (eqIdx === -1) {
    errors.push({ line, message: `equation must contain "=" — got "${content}"` });
    return;
  }
  const lhs = parsePath(content.slice(0, eqIdx).trim(), line, errors);
  const rhs = parsePath(content.slice(eqIdx + 1).trim(), line, errors);
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
 *   (CD-SPEC §4.3).
 */
export function typecheck(ast: CdAst): CdError[] {
  const errors: CdError[] = [];
  const objSet = new Set(ast.objects.map((o) => o.name));
  const morTable = new Map<string, { dom: string; cod: string; line: number }>();

  for (const m of ast.morphisms) {
    if (!objSet.has(m.dom)) {
      errors.push({ line: m.line, message: `unknown object "${m.dom}" (domain of ${m.name})` });
    }
    if (!objSet.has(m.cod)) {
      errors.push({ line: m.line, message: `unknown object "${m.cod}" (codomain of ${m.name})` });
    }
    if (morTable.has(m.name)) {
      errors.push({ line: m.line, message: `duplicate morphism name "${m.name}"` });
    } else {
      morTable.set(m.name, { dom: m.dom, cod: m.cod, line: m.line });
    }
  }

  for (const i of ast.induced) {
    if (!objSet.has(i.dom)) {
      errors.push({ line: i.line, message: `unknown object "${i.dom}" (domain of ${i.name})` });
    }
    if (!objSet.has(i.cod)) {
      errors.push({ line: i.line, message: `unknown object "${i.cod}" (codomain of ${i.name})` });
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

// Re-export the identifier regex for the emitter (so the same notion of
// "needs quoting in a Mermaid label" applies).
export { IDENT_CAPTURE_RE, NAME_RE };
