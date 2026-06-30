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

  // `customFonts` is a *registry*, not a setting (STACK-SPEC §5): union it down
  // the chain (deduped) instead of letting the child replace — otherwise a child
  // that adds one font would drop the parent's. Any other list still replaces.
  const fonts: unknown[] = [];
  const seen = new Set<string>();
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const raw = chain[i].frontmatter.get('customFonts');
    if (raw === undefined) continue;
    let arr: unknown;
    try {
      arr = JSON.parse(raw);
    } catch {
      continue; // malformed — ignore this layer's customFonts
    }
    if (!Array.isArray(arr)) continue;
    for (const el of arr) {
      const key = fontIdentity(el);
      if (seen.has(key)) continue;
      seen.add(key);
      fonts.push(el);
    }
  }
  if (fonts.length > 0) fm.set('customFonts', JSON.stringify(fonts));
  else fm.delete('customFonts');

  return fm;
}

/** Dedup key for a custom-font entry — by sha, then family, else the whole entry. */
function fontIdentity(el: unknown): string {
  if (el !== null && typeof el === 'object') {
    const o = el as Record<string, unknown>;
    if (typeof o.sha === 'string') return `sha:${o.sha}`;
    if (typeof o.family === 'string') return `family:${o.family}`;
  }
  return JSON.stringify(el);
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

// ---- token resolution (render-time) ---------------------------------------

/** Thrown when a `var(--x)` references an undefined token with no fallback. */
export class TokenMissingError extends Error {
  constructor(public readonly token: string) {
    super(`undefined token ${token} (no fallback)`);
    this.name = 'TokenMissingError';
  }
}

/** Thrown when tokens reference each other in a cycle. */
export class TokenCycleError extends Error {
  constructor(public readonly token: string) {
    super(`token cycle through ${token}`);
    this.name = 'TokenCycleError';
  }
}

const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g;

/**
 * Purpose: Resolve `var(--token)` references against the front-matter's own
 *   `--token` declarations (STACK-SPEC §10.1) — the *render-time* step that
 *   `flatten` deliberately skips.
 * How: A token's value may itself reference tokens; resolution is recursive
 *   and memoised, with a `resolving` set to detect cycles. `var(--x, fallback)`
 *   uses the fallback when `--x` is undefined; without a fallback an undefined
 *   token is an error. Substitution runs in *every* value (the token keys
 *   included), so the result has no `var()` left.
 */
export function resolveTokens(fm: Map<string, string>): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [key, value] of fm) if (key.startsWith('--')) tokens.set(key, value);

  const resolved = new Map<string, string>();
  const resolving = new Set<string>();

  const substitute = (value: string): string =>
    value.replace(VAR_RE, (_m, name: string, fallback?: string) => {
      if (tokens.has(name)) return resolveToken(name);
      if (fallback !== undefined) return fallback.trim();
      throw new TokenMissingError(name);
    });

  function resolveToken(name: string): string {
    const memo = resolved.get(name);
    if (memo !== undefined) return memo;
    if (resolving.has(name)) throw new TokenCycleError(name);
    resolving.add(name);
    const out = substitute(tokens.get(name) ?? '');
    resolving.delete(name);
    resolved.set(name, out);
    return out;
  }

  const out = new Map<string, string>();
  for (const [key, value] of fm) out.set(key, substitute(value));
  return out;
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
  return { name, frontmatter: explodeProfile(frontmatter), body: lines.slice(bodyStart).join('\n') };
}

// ---- legacy markpage-profile embed (STACK-SPEC §4.3, §9) ------------------

const FONT_SLOT_KEY: Record<string, string> = {
  body: 'font-body',
  headings: 'font-heading',
  code: 'font-mono',
};

/**
 * Purpose: Explode a `markpage-profile` JSON embed into the canonical flat /
 *   dotted keys (STACK-SPEC §4.3) — the read-time, back-compat path. The
 *   per-element matrix becomes `styles.<el>.<attr>` keys, fonts become
 *   `font-*`, layout becomes `page-size` / `margins` / `page-numbers`, and
 *   `customFonts` is carried as a JSON-array key for the union (§5).
 * How: tolerant JSON parse (a malformed embed yields no keys rather than
 *   throwing); string values are quoted, numbers / booleans bare.
 */
export function normalizeProfile(json: string): Map<string, string> {
  const out = new Map<string, string>();
  let p: unknown;
  try {
    p = JSON.parse(json);
  } catch {
    return out;
  }
  if (p === null || typeof p !== 'object') return out;
  const prof = p as Record<string, unknown>;

  const fonts = prof.fonts;
  if (fonts !== null && typeof fonts === 'object') {
    for (const [slot, key] of Object.entries(FONT_SLOT_KEY)) {
      const v = (fonts as Record<string, unknown>)[slot];
      if (typeof v === 'string' && v !== '') out.set(key, quoteScalar(v));
    }
  }

  const styles = prof.styles;
  if (styles !== null && typeof styles === 'object') {
    for (const [el, attrs] of Object.entries(styles as Record<string, unknown>)) {
      if (attrs === null || typeof attrs !== 'object') continue;
      for (const [attr, val] of Object.entries(attrs as Record<string, unknown>)) {
        out.set(`styles.${el}.${attr}`, scalarValue(val));
      }
    }
  }

  if (typeof prof.pageSize === 'string') out.set('page-size', prof.pageSize);
  if (typeof prof.pageNumbers === 'boolean') out.set('page-numbers', String(prof.pageNumbers));
  const m = prof.margins;
  if (m !== null && typeof m === 'object') {
    const mm = m as Record<string, unknown>;
    if (['top', 'right', 'bottom', 'left'].every((k) => typeof mm[k] === 'number')) {
      out.set('margins', `${mm.top} ${mm.right} ${mm.bottom} ${mm.left}`);
    }
  }
  if (Array.isArray(prof.customFonts) && prof.customFonts.length > 0) {
    out.set('customFonts', JSON.stringify(prof.customFonts));
  }
  return out;
}

/** Quote a string value (matching the authored `styles.h1.color: "#…"` form). */
function quoteScalar(s: string): string {
  return `"${s}"`;
}

/** Serialize a profile attribute value: strings quoted, numbers / booleans bare. */
function scalarValue(v: unknown): string {
  return typeof v === 'string' ? quoteScalar(v) : String(v);
}

/** The profile shape (= `serializeProfile`'s input) that flat keys rebuild into. */
export interface ProfilePatch {
  fonts?: { body?: string; headings?: string; code?: string };
  styles?: Record<string, Record<string, string | number | boolean>>;
  pageSize?: string;
  margins?: { top: number; right: number; bottom: number; left: number };
  pageNumbers?: boolean;
  customFonts?: unknown[];
}

const STYLE_KEY_RE = /^styles\.([^.]+)\.(.+)$/;

/**
 * Purpose: The inverse of `normalizeProfile` — rebuild a profile object from a
 *   (flattened) front-matter's flat & dotted keys, so the render path can apply
 *   the stacked result through the existing per-element typography machinery.
 * How: `font-*` → `fonts.*`, `styles.<el>.<attr>` → `styles[el][attr]` (values
 *   coerced back: quoted→string, `true`/`false`→boolean, numeric→number),
 *   `page-size`/`page-numbers`/`margins` → layout, `customFonts` → JSON array.
 */
export function denormalizeProfile(fm: Map<string, string>): ProfilePatch {
  const patch: ProfilePatch = {};

  const fonts: Record<string, string> = {};
  for (const [slot, key] of Object.entries(FONT_SLOT_KEY)) {
    const v = fm.get(key);
    if (v !== undefined) fonts[slot] = unquoteScalar(v);
  }
  if (Object.keys(fonts).length > 0) patch.fonts = fonts;

  const styles: Record<string, Record<string, string | number | boolean>> = {};
  for (const [key, value] of fm) {
    const m = STYLE_KEY_RE.exec(key);
    if (!m) continue;
    (styles[m[1]] ??= {})[m[2]] = coerceScalar(value);
  }
  if (Object.keys(styles).length > 0) patch.styles = styles;

  const ps = fm.get('page-size');
  if (ps !== undefined) patch.pageSize = unquoteScalar(ps);
  const pn = fm.get('page-numbers');
  if (pn !== undefined) patch.pageNumbers = pn.trim() === 'true';
  const mg = fm.get('margins');
  if (mg !== undefined) {
    const n = mg.split(/[\s,]+/).filter((t) => t !== '').map(Number).filter(Number.isFinite);
    if (n.length > 0) {
      const [a, b = a, c = a, d = b] = n;
      patch.margins = { top: a, right: b, bottom: c, left: d };
    }
  }
  const cf = fm.get('customFonts');
  if (cf !== undefined) {
    try {
      const arr: unknown = JSON.parse(cf);
      if (Array.isArray(arr)) patch.customFonts = arr;
    } catch {
      /* malformed — drop */
    }
  }
  return patch;
}

/** Strip surrounding ASCII quotes if present (else the bare value). */
function unquoteScalar(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Coerce a raw front-matter value back to string / number / boolean. */
function coerceScalar(raw: string): string | number | boolean {
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/**
 * Purpose: If a front-matter has a `markpage-profile` embed, replace it with its
 *   exploded dotted keys — but an explicit key (e.g. an authored
 *   `styles.h1.color`) in the same document **wins** over the embed
 *   (STACK-SPEC §4.3, FRONTMATTER-SPEC *flat key > embed*).
 */
function explodeProfile(fm: Map<string, string>): Map<string, string> {
  const embed = fm.get('markpage-profile');
  if (embed === undefined) return fm;
  const merged = normalizeProfile(embed); // exploded base
  for (const [key, value] of fm) {
    if (key === 'markpage-profile') continue; // consumed
    merged.set(key, value); // explicit keys overlay (win)
  }
  return merged;
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
