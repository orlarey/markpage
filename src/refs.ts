/********************************* refs.ts *************************************
 *
 * Purpose: Cross-reference machinery — `\label{key}` registers a numbered
 *   target (Figure / Tableau / Algorithme / Listing / Section / Equation),
 *   `\ref{key}` resolves to the number with an anchor link to the target.
 * How: A pre-scan pass over the markdown source (run from the marked
 *   `preprocess` hook) walks blocks in source order, increments the per-
 *   kind counters, and registers every `\label{}` it finds with the
 *   number that the corresponding render pass will assign. The render
 *   then emits real numbers (captions, sections, equations) and DOM ids,
 *   while `\ref{}` looks up the registry. Forward refs work because the
 *   registry is fully populated before any rendering happens.
 *
 *******************************************************************************/

/**
 * Purpose: Discriminator for what a label is attached to. Drives the DOM id
 *   prefix (`fig-…`, `alg-…`, etc.) and the kind of target the renderer
 *   needs to emit for the anchor to land on the right node.
 */
export type RefKind =
  | 'figure'
  | 'table'
  | 'algorithm'
  | 'listing'
  | 'section'
  | 'equation';

interface LabelEntry {
  kind: RefKind;
  // What `\ref{}` should render. For figure / table / algorithm / listing /
  // equation, it's the auto-assigned number (always shown next to the
  // target via its caption / tag). For `section`, it's the heading text
  // itself — markpage sections aren't auto-numbered, so showing a
  // number would be meaningless to the reader; the heading text both
  // identifies the target and reads naturally inline ("voir la section
  // Réglages").
  text: string;
}

const registry = new Map<string, LabelEntry>();
let equationCounter = 0;

/**
 * Purpose: Reset every per-kind counter and the registry between renders.
 * How: Called from the marked `preprocess` hook so each parse starts
 *   from a clean state (preview + print are separate parses).
 */
export function resetRefs(): void {
  registry.clear();
  equationCounter = 0;
}

/**
 * Purpose: Allocate the next equation number (only labeled equations are
 *   numbered, per amsmath convention).
 */
export function nextEquationNumber(): number {
  equationCounter += 1;
  return equationCounter;
}

/**
 * Purpose: Record a label → (kind, number) mapping.
 * How: Last writer wins on duplicate keys — a warning would be nicer but
 *   the rendered `[?]` for the second one is already a visible signal.
 */
export function registerLabel(
  key: string,
  kind: RefKind,
  text: number | string,
): void {
  registry.set(key, { kind, text: String(text) });
}

/**
 * Purpose: Look up a label, returning null if unknown.
 * How: Plain Map lookup; the caller renders `[?]` on null.
 */
export function resolveRef(key: string): LabelEntry | null {
  return registry.get(key) ?? null;
}

/**
 * Purpose: Convert a RefKind into the DOM id prefix used to target anchors.
 *   `figure` and `equation` deliberately share short, LaTeX-ish prefixes.
 */
export const ID_PREFIX: Record<RefKind, string> = {
  figure: 'fig',
  table: 'tab',
  algorithm: 'alg',
  listing: 'lst',
  section: 'sec',
  equation: 'eq',
};

/**
 * Purpose: Build the DOM id for an anchor of a given kind + key.
 * How: `<prefix>-<key>` after stripping any caller-supplied prefix from the
 *   key (we accept `alg:tri` and just use it as-is — the colon is part of
 *   the key, not the prefix).
 */
export function anchorId(kind: RefKind, key: string): string {
  return `${ID_PREFIX[kind]}-${key}`;
}

// --- Pre-scan ------------------------------------------------------------

interface CaptionCounters {
  figure: number;
  table: number;
  algorithm: number;
  listing: number;
}

// Each captioned fence language maps to a caption kind. Mirrors the
// dispatcher in marked-config.ts. Keep in sync.
const FENCE_KIND: Record<string, RefKind> = {
  algorithm: 'algorithm',
  csv: 'table',
  tsv: 'table',
  chart: 'figure',
  mermaid: 'figure',
  tree: 'figure',
  ebnf: 'figure',
  adt: 'listing',
  diff: 'listing',
  // bare language tags (python / js / ts / …) all map to listing — caught
  // by the fallback in scanFences.
};

/**
 * Purpose: Walk the source line-by-line and pre-register every label so
 *   that `\ref` can resolve forward refs.
 * How: Strip fenced code so labels-in-code aren't picked up; then scan
 *   in source order for (1) headings, (2) `$$…$$` math blocks, (3) fenced
 *   blocks with caption + label, incrementing the matching counters and
 *   registering each label as we go.
 */
export function prescanLabels(source: string): void {
  const captionCounters: CaptionCounters = {
    figure: 0,
    table: 0,
    algorithm: 0,
    listing: 0,
  };

  const lines = source.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    // ---- fenced block (``` or ~~~) -----------------------------------
    const fenceOpen = /^(`{3,}|~{3,})([ \t]*)(.*)$/.exec(line);
    if (fenceOpen) {
      const marker = fenceOpen[1] ?? '';
      const info = fenceOpen[3] ?? '';
      // Consume until matching close fence (same or longer marker char).
      let j = i + 1;
      while (j < lines.length) {
        const close = new RegExp(`^${marker[0]}{${marker.length},}[ \\t]*$`);
        if (close.test(lines[j] ?? '')) break;
        j += 1;
      }
      handleFenceInfo(info, captionCounters);
      i = j + 1;
      continue;
    }

    // ---- $$ … $$ math block ------------------------------------------
    if (/^\$\$[ \t]*$/.test(line)) {
      let j = i + 1;
      const body: string[] = [];
      while (j < lines.length) {
        if (/^[ \t]*\$\$[ \t]*$/.test(lines[j] ?? '')) break;
        body.push(lines[j] ?? '');
        j += 1;
      }
      const label = extractLabel(body.join('\n'));
      if (label !== null) {
        const n = nextEquationNumber();
        registerLabel(label, 'equation', n);
      }
      i = j + 1;
      continue;
    }

    // ---- ATX heading -------------------------------------------------
    const heading = /^(#{1,6})[ \t]+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2] ?? '';
      const label = extractLabel(text);
      if (label !== null) {
        // `\ref{sec:foo}` renders the heading text itself (markpage
        // sections aren't numbered), with the `\label{}` stripped out.
        registerLabel(label, 'section', stripLabels(text));
      }
      i += 1;
      continue;
    }

    i += 1;
  }
}

/**
 * Purpose: For a fenced block opening, increment the right caption counter
 *   (only when a caption is present) and register any label found in the
 *   info string.
 * How: Quick parse of `<lang> [args…] "caption" \label{…}` — captions only
 *   trigger numbering, labels only register when both lang + caption are
 *   present.
 */
function handleFenceInfo(info: string, counters: CaptionCounters): void {
  const lang = (info.split(/\s+/)[0] ?? '').toLowerCase();
  if (lang === '') return;
  // Only blocks with a quoted caption participate in numbering; bare
  // fences (no caption) don't consume a counter.
  const caption = /"[^"\n]*"|'[^'\n]*'/.exec(info);
  if (!caption) return;
  // Pick the kind from the fence dispatch table; fall through to
  // 'listing' for arbitrary programming languages.
  const kind = FENCE_KIND[lang] ?? 'listing';
  // Bump the matching counter even when there's no label — the
  // numbering must stay in sync with what the renderer will emit.
  if (kind === 'figure') counters.figure += 1;
  else if (kind === 'table') counters.table += 1;
  else if (kind === 'algorithm') counters.algorithm += 1;
  else counters.listing += 1;
  const label = extractLabel(info);
  if (label === null) return;
  const n =
    kind === 'figure'
      ? counters.figure
      : kind === 'table'
        ? counters.table
        : kind === 'algorithm'
          ? counters.algorithm
          : counters.listing;
  registerLabel(label, kind, n);
}

/**
 * Purpose: Extract the first `\label{key}` from a string and return the key.
 * How: Single regex; no escape handling (`}` inside a key isn't supported,
 *   but the LaTeX convention is alphanumeric + `:` + `-` so this is fine).
 */
export function extractLabel(s: string): string | null {
  const m = /\\label\{([^}\n]+)\}/.exec(s);
  return m ? (m[1] ?? '').trim() : null;
}

/**
 * Purpose: Remove every `\label{}` occurrence from a string.
 * How: Global regex; used to strip labels out of caption text, math source,
 *   heading text before rendering. Whitespace around the removed token is
 *   collapsed so " text \label{x} " doesn't leave a double space.
 */
export function stripLabels(s: string): string {
  return s.replaceAll(/[ \t]*\\label\{[^}\n]+\}[ \t]*/g, ' ').trim();
}
