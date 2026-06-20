/********************************* bda.ts ***************************************
 *
 * Purpose: Parse + typecheck the `bda` DSL (Block-Diagram Algebra, à la Faust).
 *   A BDA expression is built from primitive circuits combined by five binary
 *   composition operators:
 *     `~`  recursion  (priority 4, right-assoc)
 *     `,`  parallel   (priority 3, left-assoc)
 *     `:`  sequential (priority 2, left-assoc)
 *     `<:` split      (priority 1, left-assoc)
 *     `:>` merge      (priority 1, left-assoc)
 *   Each primitive has an arity `(n_inputs, m_outputs)`. Primitives are
 *   identifiers, quoted labels, numbers, arithmetic / math operators, plus
 *   two structural primitives: `_` (identity 1→1) and `!` (cut 1→0).
 *   Arities can be annotated as `Label[n,m]` or inferred from a built-in
 *   table for the standard operators; bare identifiers default to (1,1).
 *
 *   The typechecker verifies the wiring constraints:
 *     `:`  outputs(A) == inputs(B)
 *     `<:` inputs(B)  is a positive multiple of outputs(A)  (output i of A → input i mod m of B)
 *     `:>` outputs(A) is a positive multiple of inputs(B)   (output i of A → input i mod n of B)
 *     `~`  inputs(A) >= outputs(B) AND outputs(A) >= inputs(B)
 *   `,` has no constraint.
 *
 *******************************************************************************/

export type BdaNode =
  | PrimNode
  | { kind: 'seq'; left: BdaNode; right: BdaNode; line: number }
  | { kind: 'par'; left: BdaNode; right: BdaNode; line: number }
  | { kind: 'split'; left: BdaNode; right: BdaNode; line: number }
  | { kind: 'merge'; left: BdaNode; right: BdaNode; line: number }
  | { kind: 'rec'; left: BdaNode; right: BdaNode; line: number };

export interface PrimNode {
  kind: 'prim';
  label: string;
  n: number; // inputs
  m: number; // outputs
  line: number;
  // Drives the SVG renderer: `wire` for `_` (no box, just a horizontal line),
  // `cut` for `!` (small terminator instead of a box), `box` for everything
  // else (rectangle with text label).
  display: 'box' | 'wire' | 'cut';
}

export interface BdaError {
  line: number;
  message: string;
}

export interface BdaParseResult {
  ast: BdaNode | null;
  errors: BdaError[];
}

// Arity table for standard primitives. Anything not listed and not annotated
// with `[n,m]` falls back to (1,1) for bare identifiers / quoted labels, or
// to (0,1) for numeric literals.
const KNOWN_ARITY: Record<string, [number, number]> = {
  // Arithmetic
  '+': [2, 1], '-': [2, 1], '*': [2, 1], '/': [2, 1], '%': [2, 1], '^': [2, 1],
  // Comparison
  '<': [2, 1], '>': [2, 1], '<=': [2, 1], '>=': [2, 1], '==': [2, 1], '!=': [2, 1],
  // Logic / bitwise
  '&': [2, 1], '|': [2, 1], xor: [2, 1],
  // Math 1-arg
  sin: [1, 1], cos: [1, 1], tan: [1, 1],
  asin: [1, 1], acos: [1, 1], atan: [1, 1],
  sinh: [1, 1], cosh: [1, 1], tanh: [1, 1],
  exp: [1, 1], log: [1, 1], log10: [1, 1],
  sqrt: [1, 1], abs: [1, 1], floor: [1, 1], ceil: [1, 1], rint: [1, 1],
  // Math 2-arg
  min: [2, 1], max: [2, 1], pow: [2, 1], atan2: [2, 1],
  // Structural
  mem: [1, 1],
};

// ---- Public entry point -------------------------------------------------

/**
 * Purpose: Parse a `bda` source string into an AST + diagnostics.
 * How: A bda block is exactly one expression (whitespace and comments
 *   ignored). Tokenize, run a recursive-descent parser keyed on the
 *   precedence levels listed in the header, then return the root node.
 *   Errors are collected; the typechecker is a separate pass below so
 *   the caller can show parser and typecheck errors together.
 */
export function parse(source: string): BdaParseResult {
  const errors: BdaError[] = [];
  // Strip `#`-to-EOL comments so users can annotate examples without
  // breaking parsing. Comments don't appear inside quoted labels — a
  // simple line-by-line strip is enough.
  const stripped = source
    .split('\n')
    .map((line) => stripLineComment(line))
    .join('\n');
  const tokens = tokenize(stripped, errors);
  if (errors.length > 0) return { ast: null, errors };
  const parser = new Parser(tokens, errors);
  const ast = parser.parseExpr();
  if (ast === null) return { ast: null, errors };
  if (!parser.atEnd()) {
    const tok = parser.peek();
    errors.push({
      line: tok.line,
      message: `unexpected trailing input: "${describeToken(tok)}"`,
    });
    return { ast: null, errors };
  }
  return { ast, errors };
}

/**
 * Purpose: Compute (inputs, outputs) for every node, validating wiring
 *   constraints at each composition.
 * How: Post-order recursion. Returns the root arity on success; pushes
 *   diagnostics and returns null on the first composition mismatch in a
 *   given subtree (so we don't cascade errors upward).
 */
export function typecheck(ast: BdaNode): { arity: [number, number] | null; errors: BdaError[] } {
  const errors: BdaError[] = [];
  const arity = checkNode(ast, errors);
  return { arity, errors };
}

function checkNode(node: BdaNode, errors: BdaError[]): [number, number] | null {
  if (node.kind === 'prim') return [node.n, node.m];
  const left = checkNode(node.left, errors);
  const right = checkNode(node.right, errors);
  if (left === null || right === null) return null;
  const [ln, lm] = left;
  const [rn, rm] = right;
  switch (node.kind) {
    case 'par':
      return [ln + rn, lm + rm];
    case 'seq':
      if (lm !== rn) {
        errors.push({
          line: node.line,
          message: `« : » sorties à gauche (${lm}) ≠ entrées à droite (${rn})`,
        });
        return null;
      }
      return [ln, rm];
    case 'split':
      if (lm === 0) {
        errors.push({
          line: node.line,
          message: `« <: » membre gauche sans sorties (${lm})`,
        });
        return null;
      }
      if (rn === 0 || rn % lm !== 0) {
        errors.push({
          line: node.line,
          message: `« <: » entrées à droite (${rn}) doit être un multiple positif des sorties à gauche (${lm})`,
        });
        return null;
      }
      return [ln, rm];
    case 'merge':
      if (rn === 0) {
        errors.push({
          line: node.line,
          message: `« :> » membre droit sans entrées (${rn})`,
        });
        return null;
      }
      if (lm === 0 || lm % rn !== 0) {
        errors.push({
          line: node.line,
          message: `« :> » sorties à gauche (${lm}) doit être un multiple positif des entrées à droite (${rn})`,
        });
        return null;
      }
      return [ln, rm];
    case 'rec':
      if (ln < rm) {
        errors.push({
          line: node.line,
          message: `« ~ » entrées à gauche (${ln}) < sorties à droite (${rm})`,
        });
        return null;
      }
      if (lm < rn) {
        errors.push({
          line: node.line,
          message: `« ~ » sorties à gauche (${lm}) < entrées à droite (${rn})`,
        });
        return null;
      }
      return [ln - rm, lm];
  }
}

// ---- Tokenizer ----------------------------------------------------------

type Token =
  | { type: 'PRIM'; value: string; isNumber: boolean; line: number }
  | { type: 'QUOTED'; value: string; line: number }
  | { type: 'COMMA'; line: number }
  | { type: 'COLON'; line: number }
  | { type: 'SPLIT'; line: number }
  | { type: 'MERGE'; line: number }
  | { type: 'TILDE'; line: number }
  | { type: 'LPAREN'; line: number }
  | { type: 'RPAREN'; line: number }
  | { type: 'LBRACKET'; line: number }
  | { type: 'RBRACKET'; line: number }
  | { type: 'EOF'; line: number };

function stripLineComment(line: string): string {
  // Walk char-by-char so `#` inside a quoted label doesn't get treated as
  // a comment. Quoted labels are the only context where `#` would appear
  // legitimately inside an expression.
  let out = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuote) {
      out += c;
      if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"') {
      out += c;
      inQuote = true;
      continue;
    }
    if (c === '#') break;
    out += c;
  }
  return out;
}

/**
 * Purpose: Turn the source string into a flat token stream.
 * How: Hand-rolled char-by-char scanner. Whitespace separates tokens but
 *   isn't required between operators and primitives (so `+~_` lexes as
 *   three tokens). Multi-char operators (`<:`, `:>`, `<=`, `>=`, `==`,
 *   `!=`) are recognised greedily.
 */
function tokenize(src: string, errors: BdaError[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const peek = (o = 0): string => src[i + o] ?? '';
  while (i < src.length) {
    const c = peek();
    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '(') { tokens.push({ type: 'LPAREN', line }); i += 1; continue; }
    if (c === ')') { tokens.push({ type: 'RPAREN', line }); i += 1; continue; }
    if (c === '[') { tokens.push({ type: 'LBRACKET', line }); i += 1; continue; }
    if (c === ']') { tokens.push({ type: 'RBRACKET', line }); i += 1; continue; }
    if (c === ',') { tokens.push({ type: 'COMMA', line }); i += 1; continue; }
    if (c === '~') { tokens.push({ type: 'TILDE', line }); i += 1; continue; }
    // `<:` vs `<=` vs `<` — disambiguate by the next char.
    if (c === '<') {
      if (peek(1) === ':') { tokens.push({ type: 'SPLIT', line }); i += 2; continue; }
      if (peek(1) === '=') { tokens.push({ type: 'PRIM', value: '<=', isNumber: false, line }); i += 2; continue; }
      tokens.push({ type: 'PRIM', value: '<', isNumber: false, line }); i += 1; continue;
    }
    // `:>` vs `:`.
    if (c === ':') {
      if (peek(1) === '>') { tokens.push({ type: 'MERGE', line }); i += 2; continue; }
      tokens.push({ type: 'COLON', line }); i += 1; continue;
    }
    // `>=` vs `>`.
    if (c === '>') {
      if (peek(1) === '=') { tokens.push({ type: 'PRIM', value: '>=', isNumber: false, line }); i += 2; continue; }
      tokens.push({ type: 'PRIM', value: '>', isNumber: false, line }); i += 1; continue;
    }
    // `==` only — bare `=` is reserved (no use in BDA today, keep error explicit).
    if (c === '=') {
      if (peek(1) === '=') { tokens.push({ type: 'PRIM', value: '==', isNumber: false, line }); i += 2; continue; }
      errors.push({ line, message: `caractère "=" inattendu (seul "==" est valide)` });
      i += 1;
      continue;
    }
    // `!=` vs `!` (the cut primitive).
    if (c === '!') {
      if (peek(1) === '=') { tokens.push({ type: 'PRIM', value: '!=', isNumber: false, line }); i += 2; continue; }
      tokens.push({ type: 'PRIM', value: '!', isNumber: false, line }); i += 1; continue;
    }
    // Single-char arithmetic / bit operators.
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%' || c === '^' || c === '&' || c === '|') {
      tokens.push({ type: 'PRIM', value: c, isNumber: false, line });
      i += 1;
      continue;
    }
    // `_` — identity primitive. A single char only; `_foo` would be an
    // identifier starting with `_`, but identifiers must start with a
    // letter, so `_` is unambiguously the identity.
    if (c === '_') {
      tokens.push({ type: 'PRIM', value: '_', isNumber: false, line });
      i += 1;
      continue;
    }
    // Number literal: integer or decimal. Negative literals don't exist
    // — `-` is always the subtraction primitive. Users who need a
    // negative constant can write a quoted label `"-1"[0,1]`.
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j] ?? '')) j += 1;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
        j += 1;
        while (j < src.length && /[0-9]/.test(src[j] ?? '')) j += 1;
      }
      tokens.push({ type: 'PRIM', value: src.slice(i, j), isNumber: true, line });
      i = j;
      continue;
    }
    // Identifier: starts with a Unicode letter, continues with letters /
    // digits / underscore. The Unicode-letter start keeps Greek, math
    // alphanumerics, etc. usable as labels.
    if (/\p{L}/u.test(c)) {
      let j = i + 1;
      while (j < src.length && /[\p{L}\p{N}_]/u.test(src[j] ?? '')) j += 1;
      tokens.push({ type: 'PRIM', value: src.slice(i, j), isNumber: false, line });
      i = j;
      continue;
    }
    // Quoted label — string with arbitrary chars (no embedded newlines,
    // no escape). Closing `"` is required on the same line.
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"' && src[j] !== '\n') j += 1;
      if (src[j] !== '"') {
        errors.push({ line, message: 'guillemet fermant manquant' });
        return tokens;
      }
      tokens.push({ type: 'QUOTED', value: src.slice(i + 1, j), line });
      i = j + 1;
      continue;
    }
    errors.push({ line, message: `caractère inattendu: "${c}"` });
    i += 1;
  }
  tokens.push({ type: 'EOF', line });
  return tokens;
}

// ---- Parser -------------------------------------------------------------

/**
 * Purpose: Recursive-descent parser following the precedence ladder:
 *   mergeSplit (1) → seq (2) → par (3) → rec (4) → primary.
 * How: One method per precedence level; `~` recurses on its right operand
 *   to get right-associativity (`A ~ B ~ C` = `A ~ (B ~ C)`), all others
 *   loop for left-associativity.
 */
class Parser {
  private idx = 0;
  constructor(private toks: Token[], private errors: BdaError[]) {}

  peek(): Token {
    return this.toks[this.idx] ?? { type: 'EOF', line: 0 };
  }
  advance(): Token {
    const t = this.peek();
    this.idx += 1;
    return t;
  }
  atEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  parseExpr(): BdaNode | null {
    return this.parseMergeSplit();
  }

  // Priority 1 — `<:` and `:>`, left-associative, same level.
  private parseMergeSplit(): BdaNode | null {
    let left = this.parseSeq();
    if (left === null) return null;
    while (this.peek().type === 'SPLIT' || this.peek().type === 'MERGE') {
      const op = this.advance();
      const right = this.parseSeq();
      if (right === null) return null;
      // Split the two arms explicitly so the discriminated union narrows.
      left =
        op.type === 'SPLIT'
          ? { kind: 'split', left, right, line: op.line }
          : { kind: 'merge', left, right, line: op.line };
    }
    return left;
  }

  // Priority 2 — `:`, left-associative.
  private parseSeq(): BdaNode | null {
    let left = this.parsePar();
    if (left === null) return null;
    while (this.peek().type === 'COLON') {
      const op = this.advance();
      const right = this.parsePar();
      if (right === null) return null;
      left = { kind: 'seq', left, right, line: op.line };
    }
    return left;
  }

  // Priority 3 — `,`, left-associative.
  private parsePar(): BdaNode | null {
    let left = this.parseRec();
    if (left === null) return null;
    while (this.peek().type === 'COMMA') {
      const op = this.advance();
      const right = this.parseRec();
      if (right === null) return null;
      left = { kind: 'par', left, right, line: op.line };
    }
    return left;
  }

  // Priority 4 — `~`, right-associative.
  private parseRec(): BdaNode | null {
    const left = this.parsePrimary();
    if (left === null) return null;
    if (this.peek().type === 'TILDE') {
      const op = this.advance();
      const right = this.parseRec();
      if (right === null) return null;
      return { kind: 'rec', left, right, line: op.line };
    }
    return left;
  }

  private parsePrimary(): BdaNode | null {
    const tok = this.peek();
    if (tok.type === 'LPAREN') {
      this.advance();
      const e = this.parseExpr();
      if (e === null) return null;
      if (this.peek().type !== 'RPAREN') {
        this.errors.push({ line: this.peek().line, message: 'parenthèse fermante « ) » attendue' });
        return null;
      }
      this.advance();
      return e;
    }
    if (tok.type === 'PRIM' || tok.type === 'QUOTED') {
      this.advance();
      const label = tok.value;
      const isNumber = tok.type === 'PRIM' ? tok.isNumber : false;
      const annotated = this.parseArity();
      if (annotated === 'error') return null;
      const arity = annotated ?? lookupArity(label, isNumber, tok.type === 'QUOTED');
      const display: PrimNode['display'] =
        tok.type === 'PRIM' && label === '_'
          ? 'wire'
          : tok.type === 'PRIM' && label === '!'
            ? 'cut'
            : 'box';
      return {
        kind: 'prim',
        label,
        n: arity.n,
        m: arity.m,
        line: tok.line,
        display,
      };
    }
    this.errors.push({
      line: tok.line,
      message: `expression attendue, trouvé "${describeToken(tok)}"`,
    });
    return null;
  }

  // Optional `[n,m]` after a primitive. Returns null when no `[` follows,
  // the parsed arity on success, or 'error' if `[` was there but the form
  // was invalid (in which case a diagnostic has been pushed).
  private parseArity(): { n: number; m: number } | null | 'error' {
    if (this.peek().type !== 'LBRACKET') return null;
    const lbk = this.advance();
    const n = this.parseNonNegInt();
    if (n === null) {
      this.errors.push({ line: lbk.line, message: 'entier attendu dans [n, m]' });
      return 'error';
    }
    if (this.peek().type !== 'COMMA') {
      this.errors.push({ line: lbk.line, message: '« , » attendue dans [n, m]' });
      return 'error';
    }
    this.advance();
    const m = this.parseNonNegInt();
    if (m === null) {
      this.errors.push({ line: lbk.line, message: 'entier attendu dans [n, m]' });
      return 'error';
    }
    if (this.peek().type !== 'RBRACKET') {
      this.errors.push({ line: lbk.line, message: '« ] » de fermeture attendu' });
      return 'error';
    }
    this.advance();
    return { n, m };
  }

  private parseNonNegInt(): number | null {
    const t = this.peek();
    if (t.type !== 'PRIM' || !t.isNumber) return null;
    // Reject decimals — arities are integer counts.
    if (t.value.includes('.')) return null;
    this.advance();
    return parseInt(t.value, 10);
  }
}

function lookupArity(label: string, isNumber: boolean, isQuoted: boolean): { n: number; m: number } {
  if (isNumber) return { n: 0, m: 1 };
  if (label === '_') return { n: 1, m: 1 };
  if (label === '!') return { n: 1, m: 0 };
  if (!isQuoted) {
    const k = KNOWN_ARITY[label];
    if (k) return { n: k[0], m: k[1] };
  }
  return { n: 1, m: 1 };
}

function describeToken(tok: Token): string {
  switch (tok.type) {
    case 'PRIM': return tok.value;
    case 'QUOTED': return `"${tok.value}"`;
    case 'COMMA': return ',';
    case 'COLON': return ':';
    case 'SPLIT': return '<:';
    case 'MERGE': return ':>';
    case 'TILDE': return '~';
    case 'LPAREN': return '(';
    case 'RPAREN': return ')';
    case 'LBRACKET': return '[';
    case 'RBRACKET': return ']';
    case 'EOF': return 'fin de l\'expression';
  }
}
