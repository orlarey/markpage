/************************************ stack.ts *********************************
 *
 * Purpose: The pure *document-stack* engine of STACK-SPEC — flatten a leaf
 *   document and its `extends` ancestors into a single self-contained one.
 *   Everything here is pure and decoupled from VOLUMES / the doc store: the
 *   caller supplies a `resolve` callback that maps an `extends` reference to a
 *   document, so the engine is testable in-memory.
 *
 * Model (STACK-SPEC §3–§5):
 *   - Every document `extends` a parent. The field defaults to `default.md`
 *     (the root). `default.md`'s own `extends` points to *itself* — the unique
 *     fixpoint that terminates the chain (the `/` of the style tree).
 *   - `flatten` = resolve the chain to the fixpoint, then:
 *       · merge front-matters root→leaf, child wins — a FLAT per-key merge
 *         (the matrix is dotted keys `styles.h1.color`, not nested dicts), plus
 *         a reset pass where `revert`/`unset`/`initial` fall back to the
 *         `default.md` value (escaping ancestors);
 *       · fold bodies leaf→root, each ancestor wrapping the accumulated content
 *         via its (first) ```insert hole, or concatenating when it has none.
 *   - `var(--…)` token substitution is NOT done here — it happens at render
 *     time (STACK-SPEC §10.1). `flatten` only merges and folds.
 *
 *******************************************************************************/

/** The root document name — `default.md`, the fixpoint of the `extends` chain. */
export const ROOT_NAME = 'default';

/** Front-matter values that *reset* a key to the `default.md` value (STACK-SPEC §10.2). */
const RESET_VALUES = new Set(['revert', 'unset', 'initial']);

/**
 * A document in the stack: its raw front-matter (every key — known, dotted
 * `styles.*`, `--token`, `extends` — kept as a raw string, preserving order)
 * and its body. `name` is the identity the `resolve` callback keys on.
 */
export interface StackDoc {
  name: string;
  frontmatter: Map<string, string>;
  body: string;
}

/** Resolve an `extends` reference to a document, or `null` if it can't be found. */
export type ResolveDoc = (ref: string) => StackDoc | null;

/** Thrown when the `extends` chain contains a cycle (other than the `default.md` fixpoint). */
export class StackCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`extends cycle: ${cycle.join(' → ')}`);
    this.name = 'StackCycleError';
  }
}

/** Thrown when an `extends` reference resolves to nothing. */
export class StackMissingRefError extends Error {
  constructor(
    public readonly ref: string,
    public readonly from: string,
  ) {
    super(`extends: "${ref}" (from "${from}") could not be resolved`);
    this.name = 'StackMissingRefError';
  }
}

// ---- chain resolution -----------------------------------------------------

/**
 * Purpose: Resolve the `extends` chain from a leaf up to the root fixpoint.
 * How: Follow each document's `extends` (defaulting to `default.md`) via
 *   `resolve`, until a document whose `extends` resolves to *itself* — that is
 *   the root (`default.md`). Any *other* self-reference, or any repeated node,
 *   is a cycle error; an unresolvable reference is a missing-ref error.
 * Returns the chain `[leaf, P₁, …, default.md]` (root last).
 */
export function resolveChain(leaf: StackDoc, resolve: ResolveDoc): StackDoc[] {
  const chain: StackDoc[] = [leaf];
  const seen = new Set<string>([leaf.name]);
  let cur = leaf;
  // Bounded by the number of distinct documents — `seen` guarantees termination.
  for (;;) {
    const ref = (cur.frontmatter.get('extends') ?? ROOT_NAME).trim();
    const parent = resolve(ref);
    if (parent === null) throw new StackMissingRefError(ref, cur.name);
    if (parent.name === cur.name) {
      // A document whose extends points to itself is the root — and only the
      // root (`default.md`) is allowed to. Any other self-reference is a cycle.
      if (cur.name !== ROOT_NAME) throw new StackCycleError([cur.name, cur.name]);
      break; // fixpoint reached; `cur` (=default.md) is already in the chain
    }
    if (seen.has(parent.name)) throw new StackCycleError([...seen, parent.name]);
    seen.add(parent.name);
    chain.push(parent);
    cur = parent;
  }
  return chain;
}

// ---- front-matter merge ---------------------------------------------------

/**
 * Purpose: Merge the chain's front-matters into one (STACK-SPEC §5).
 * How: Flat per-key merge root→leaf so the child wins (the matrix is dotted
 *   flat keys, so per-attribute granularity falls out — no nested-dict
 *   descent). `extends` is consumed. Then a reset pass: any value that is
 *   `revert`/`unset`/`initial` falls back to `default.md`'s value for that key
 *   (deleted if the root doesn't define it).
 *
 * Note: list-union for `customFonts` (STACK-SPEC §5) is intentionally not yet
 *   implemented — flat front-matter has no list syntax today; it's a follow-up.
 */
export function mergeFrontmatter(chain: StackDoc[]): Map<string, string> {
  const root = chain[chain.length - 1]; // default.md
  const fm = new Map<string, string>();
  // root → leaf: iterate the chain in reverse so leaf values overwrite last.
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    for (const [key, value] of chain[i].frontmatter) {
      if (key === 'extends') continue; // the parent pointer is consumed
      fm.set(key, value);
    }
  }
  // Reset pass — `revert`/`unset`/`initial` escape the ancestors back to the
  // factory value held by `default.md`.
  for (const [key, value] of fm) {
    if (!RESET_VALUES.has(value.trim())) continue;
    const factory = root.frontmatter.get(key);
    if (factory !== undefined) fm.set(key, factory);
    else fm.delete(key);
  }
  return fm;
}

// ---- body fold ------------------------------------------------------------

/** A line that opens an `insert` fence: ```` ```insert ```` (optionally ```` ```insert name ````). */
const INSERT_OPEN_RE = /^```insert(?:\s.*)?$/;
const FENCE_CLOSE = '```';

/**
 * Purpose: Insert `content` into `frame` (STACK-SPEC §5, `insertInto`).
 * How: If `frame` has an `insert` fence, replace the *first* one (the whole
 *   ```` ```insert … ``` ```` block) with `content`; otherwise concatenate
 *   `frame`, then `content`. Surrounding frame content (before / after the
 *   hole) is preserved.
 */
export function insertInto(frame: string, content: string): string {
  const lines = frame.split('\n');
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (INSERT_OPEN_RE.test(lines[i].trim())) {
      open = i;
      break;
    }
  }
  if (open === -1) {
    const f = frame.replace(/\s+$/, '');
    return f === '' ? content : `${f}\n\n${content}`;
  }
  let close = lines.length - 1;
  for (let j = open + 1; j < lines.length; j += 1) {
    if (lines[j].trim() === FENCE_CLOSE) {
      close = j;
      break;
    }
  }
  const before = lines.slice(0, open).join('\n').replace(/\s+$/, '');
  const after = lines.slice(close + 1).join('\n').replace(/^\s+/, '');
  return [before, content, after].filter((s) => s !== '').join('\n\n');
}

/**
 * Purpose: Fold the chain's bodies into one (STACK-SPEC §5).
 * How: Start from the leaf body; each ancestor (P₁ … default.md) wraps the
 *   accumulated content via `insertInto`. `default.md` (empty body) is a no-op.
 */
export function foldBodies(chain: StackDoc[]): string {
  let body = chain[0].body;
  for (let i = 1; i < chain.length; i += 1) {
    body = insertInto(chain[i].body, body);
  }
  return body;
}

// ---- flatten --------------------------------------------------------------

/** The flattened result: a merged front-matter and a folded body. */
export interface FlatDoc {
  frontmatter: Map<string, string>;
  body: string;
}

/**
 * Purpose: Flatten a leaf and its `extends` ancestors into one self-contained
 *   document (STACK-SPEC §5). Pure: `resolve` supplies the documents.
 */
export function flatten(leaf: StackDoc, resolve: ResolveDoc): FlatDoc {
  const chain = resolveChain(leaf, resolve);
  return { frontmatter: mergeFrontmatter(chain), body: foldBodies(chain) };
}

// ---- raw front-matter parse / serialize -----------------------------------

const FENCE_RE = /^---\s*\r?\n/;
// Key grammar EXTENDED beyond FRONTMATTER-SPEC (STACK-SPEC §4.3): besides the
// known keys, accept dotted matrix keys (`styles.h1.color`) and `--token` keys.
const KEY_RE = /^(--[\w-]+|[A-Za-z_][\w.-]*)\s*:\s*(.*)$/;

/**
 * Purpose: Parse a raw `.md` into a `StackDoc` — every front-matter key kept as
 *   a raw string (order preserved), plus the body. Recognises `key: value`,
 *   `key: |` block scalars, dotted keys and `--token` keys.
 */
export function parseStackDoc(source: string, name: string): StackDoc {
  const frontmatter = new Map<string, string>();
  if (!FENCE_RE.test(source)) return { name, frontmatter, body: source };

  const lines = source.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) return { name, frontmatter, body: source }; // unterminated → all body

  let i = 1;
  while (i < end) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const m = KEY_RE.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    const [, key, rest] = m;
    if (rest === '|' || rest === '|-') {
      const block: string[] = [];
      i += 1;
      while (i < end) {
        const next = lines[i] ?? '';
        if (next === '') {
          block.push('');
          i += 1;
          continue;
        }
        if (!/^\s/.test(next)) break;
        block.push(next);
        i += 1;
      }
      frontmatter.set(key, dedent(block));
      continue;
    }
    frontmatter.set(key, rest.trim());
    i += 1;
  }

  let bodyStart = end + 1;
  if (lines[bodyStart]?.trim() === '') bodyStart += 1;
  return { name, frontmatter, body: lines.slice(bodyStart).join('\n') };
}

/** Strip the common leading indent from a block scalar; drop trailing blanks. */
function dedent(lines: string[]): string {
  let min = Infinity;
  for (const l of lines) {
    if (l === '') continue;
    const indent = /^(\s*)/.exec(l)?.[1].length ?? 0;
    if (indent < min) min = indent;
  }
  if (!Number.isFinite(min)) min = 0;
  const out = lines.map((l) => (l === '' ? '' : l.slice(min)));
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/**
 * Purpose: Serialize a flattened document back to a `.md` string.
 * How: Emit a `---` fenced front-matter (multi-line values as `key: |` block
 *   scalars), then the body. Returns the body alone when the front-matter is
 *   empty.
 */
export function serializeStackDoc(fm: Map<string, string>, body: string): string {
  if (fm.size === 0) return body;
  const out: string[] = ['---'];
  for (const [key, value] of fm) {
    if (value.includes('\n')) {
      out.push(`${key}: |`);
      for (const l of value.split('\n')) out.push(l === '' ? '' : `  ${l}`);
    } else {
      out.push(`${key}: ${value}`);
    }
  }
  out.push('---', '', body);
  return out.join('\n');
}
