// Editor input method: type a short ASCII sequence, get the Unicode
// math/typography symbol immediately. The substitution lives in the
// source — there is no "rendered representation" different from the
// actual file content. Portable, copy-pasteable, searchable.
//
// Design constraint: replacements fire keystroke-by-keystroke, which
// means no key can be a prefix of another (otherwise the shorter key
// fires before the longer one can complete — `<=` would always beat
// `<==>` to the punch). The set below is curated to avoid that. If a
// user wants `↔` / `⇔` / `⇐` / `↦` we add them via a different trigger
// (terminator-based) later.
//
// Ligatures are skipped inside code contexts (FencedCode, InlineCode)
// so writing `function () => {}` in a JS fence doesn't get rewritten
// to `function () ⇒ {}`.

import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Blackboard-bold letters. Most live in the Mathematical Alphanumeric
// Symbols block at U+1D538+ (plane 1, surrogate pairs in JS strings),
// but seven were assigned dedicated BMP code points before the block
// was created — these are the "double-struck capital" letters in the
// Letterlike Symbols block. We keep both: BMP code points where they
// exist (better font coverage), the U+1D5xx range for the rest.
const BBB_BMP: ReadonlyMap<string, string> = new Map([
  ['C', 'ℂ'],
  ['H', 'ℍ'],
  ['N', 'ℕ'],
  ['P', 'ℙ'],
  ['Q', 'ℚ'],
  ['R', 'ℝ'],
  ['Z', 'ℤ'],
]);

// Code point of 'A' / start of A–Z range / U+1D538 (𝔸, the BBB-A in
// the Mathematical Alphanumeric Symbols block).
const A_CODE = 0x41;
const Z_CODE = 0x5a;
const BBB_A = 0x1d538;

function blackboardBold(letter: string): string {
  return (
    BBB_BMP.get(letter) ??
    String.fromCodePoint(BBB_A + (letter.codePointAt(0) ?? A_CODE) - A_CODE)
  );
}

// LaTeX command name → Unicode character. Lower- and upper-case Greek
// letters that MathJax recognises by default. We pick the codepoints
// that match MathJax's own rendering choices, so a substituted source
// is visually identical to the LaTeX command in math mode:
//   - `\epsilon` → ϵ (lunate, U+03F5), `\varepsilon` → ε (U+03B5)
//   - `\phi` → ϕ (stroked, U+03D5), `\varphi` → φ (loopy, U+03C6)
// (LaTeX swaps the "primary" form of these letters compared to a
// naïve "look up the Greek letter in Unicode" — these mappings keep
// the editor in agreement with MathJax.)
//
// Names are stored without the leading backslash; we prepend one
// when registering the ligature key. Keeping the table as plain
// names also makes it cheap to render the help table later.
// Single backslash. Built via charCode rather than as a string
// literal so Sonar doesn't insist on switching the whole table to
// `String.raw` template literals — a stylistic choice that would
// hurt readability for what is just a list of LaTeX command names.
const BS = String.fromCodePoint(0x5c);
const GREEK_LIGATURES: ReadonlyArray<readonly [string, string]> = [
  // Lowercase
  ['alpha', 'α'],
  ['beta', 'β'],
  ['gamma', 'γ'],
  ['delta', 'δ'],
  ['epsilon', 'ϵ'],
  ['zeta', 'ζ'],
  ['eta', 'η'],
  ['theta', 'θ'],
  ['iota', 'ι'],
  ['kappa', 'κ'],
  ['lambda', 'λ'],
  ['mu', 'μ'],
  ['nu', 'ν'],
  ['xi', 'ξ'],
  ['omicron', 'ο'],
  ['pi', 'π'],
  ['rho', 'ρ'],
  ['sigma', 'σ'],
  ['tau', 'τ'],
  ['upsilon', 'υ'],
  ['phi', 'ϕ'],
  ['chi', 'χ'],
  ['psi', 'ψ'],
  ['omega', 'ω'],
  // Variants
  ['varepsilon', 'ε'],
  ['varphi', 'φ'],
  ['vartheta', 'ϑ'],
  ['varpi', 'ϖ'],
  ['varrho', 'ϱ'],
  ['varsigma', 'ς'],
  // Uppercase (only those that differ from the Latin glyph)
  ['Gamma', 'Γ'],
  ['Delta', 'Δ'],
  ['Theta', 'Θ'],
  ['Lambda', 'Λ'],
  ['Xi', 'Ξ'],
  ['Pi', 'Π'],
  ['Sigma', 'Σ'],
  ['Upsilon', 'Υ'],
  ['Phi', 'Φ'],
  ['Psi', 'Ψ'],
  ['Omega', 'Ω'],
];

function buildLigatures(): ReadonlyMap<string, string> {
  const m = new Map<string, string>([
    // Brackets
    ['[[', '⟦'],
    [']]', '⟧'],
    ['<<', '⟨'],
    ['>>', '⟩'],
    // Arrows
    ['->', '→'],
    ['<-', '←'],
    ['=>', '⇒'],
    // Comparisons
    ['!=', '≠'],
    ['<=', '≤'],
    ['>=', '≥'],
    // Logic / proof
    ['|-', '⊢'],
    ['-|', '⊣'],
    // Misc
    ['+-', '±'],
    ['...', '…'],
  ]);
  // |A … |Z → blackboard-bold letter. Uppercase-only: avoids
  // surprising substitutions of common prose words ("in", "ho", etc.)
  // and matches the standard math convention.
  for (let c = A_CODE; c <= Z_CODE; c += 1) {
    const letter = String.fromCodePoint(c);
    m.set(`|${letter}`, blackboardBold(letter));
  }
  // Greek letters. \alpha ... \omega and the standard math variants.
  for (const [name, glyph] of GREEK_LIGATURES) {
    m.set(BS + name, glyph);
  }
  return m;
}

const LIGATURES = buildLigatures();

// Sort keys longest first — `endsWith` against the cursor's tail will
// pick the longest match if multiple keys end at the same position.
// (After the prefix-free filtering above this only matters if we ever
// add overlapping keys, but it's cheap insurance.)
const KEYS = [...LIGATURES.keys()].sort((a, b) => b.length - a.length);
const MAX_LEN = Math.max(...KEYS.map((k) => k.length));

// Fence info strings that *re-enable* ligatures even inside the fenced
// block, because the block ultimately becomes math (rendered by MathJax,
// which accepts Unicode operators directly). Currently just `inference`,
// but the same mechanism would suit any future "fence → LaTeX" block.
const LIGATURE_FRIENDLY_FENCES = new Set(['inference']);

function fencedCodeAllowsLigatures(
  state: EditorState,
  fenceNode: { from: number; to: number; getChild(name: string): { from: number; to: number } | null },
): boolean {
  const info = fenceNode.getChild('CodeInfo');
  if (!info) return false;
  const lang = state.doc
    .sliceString(info.from, info.to)
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  return lang !== undefined && LIGATURE_FRIENDLY_FENCES.has(lang);
}

function inCodeContext(state: EditorState, pos: number): boolean {
  let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(
    state,
  ).resolveInner(pos, -1);
  while (node) {
    const name = node.type.name;
    if (name === 'FencedCode') {
      // Inference blocks become LaTeX, which is rendered as math —
      // MathJax accepts Unicode operators directly, so it's actually
      // *more* convenient to keep ligatures on here. The user types
      // `|-` and gets `⊢` in source, MathJax renders it natively.
      return !fencedCodeAllowsLigatures(state, node);
    }
    if (name === 'CodeBlock' || name === 'InlineCode') return true;
    node = node.parent;
  }
  return false;
}

// Walks `text` once, replacing every occurrence of a ligature key
// with its Unicode value. Longest match wins at each position
// (relevant only if we ever add overlapping keys; today the set is
// prefix-free so this is just safety). Used for paste, where we
// process the whole inserted region in one pass.
function applyLigaturesToString(text: string): string {
  let out = '';
  let i = 0;
  outer: while (i < text.length) {
    for (const key of KEYS) {
      if (text.startsWith(key, i)) {
        out += LIGATURES.get(key) ?? key;
        i += key.length;
        continue outer;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

// Tail-end check at the cursor — fires for direct typing, where each
// keystroke produces at most one new char and we just need to look at
// the chars immediately before the cursor.
function handleTypingLigature(update: {
  state: EditorState;
  view: EditorView;
}): void {
  const head = update.state.selection.main.head;
  const start = Math.max(0, head - MAX_LEN);
  const tail = update.state.doc.sliceString(start, head);
  for (const key of KEYS) {
    if (!tail.endsWith(key)) continue;
    const matchStart = head - key.length;
    if (inCodeContext(update.state, matchStart)) return;
    const value = LIGATURES.get(key);
    if (value === undefined) return;
    queueMicrotask(() => {
      update.view.dispatch({
        changes: { from: matchStart, to: head, insert: value },
      });
    });
    return;
  }
}

// Walk every inserted range from a paste / drop transaction and
// rewrite each one against the full ligature table. Without this, a
// pasted `\Gamma |- A` lands in the doc verbatim — only the chars at
// the cursor's tail would even be considered by handleTypingLigature,
// and they're nearly always plain text after a paste.
function handlePasteLigature(update: {
  transactions: readonly { changes: { iterChanges: (cb: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString(): string }) => void) => void } }[];
  state: EditorState;
  view: EditorView;
}): void {
  const replacements: { from: number; to: number; insert: string }[] = [];
  for (const tr of update.transactions) {
    tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
      const text = inserted.toString();
      if (text === '') return;
      // Cheap context check: use the START of the insertion. A paste
      // spanning a fence boundary (rare) gets the rules of its start
      // position — good enough for v1; the user can always undo and
      // redo manually in pathological cases.
      if (inCodeContext(update.state, fromB)) return;
      const replaced = applyLigaturesToString(text);
      if (replaced !== text) {
        replacements.push({ from: fromB, to: toB, insert: replaced });
      }
    });
  }
  if (replacements.length === 0) return;
  queueMicrotask(() => {
    update.view.dispatch({ changes: replacements });
  });
}

export const ligatures: Extension = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  const txns = update.transactions;
  // Direct typing: tail check at cursor.
  if (txns.some((tr) => tr.isUserEvent('input.type'))) {
    handleTypingLigature(update);
    return;
  }
  // Paste / drop: walk the whole inserted text. We deliberately
  // handle programmatic setValue (no userEvent) by NOT firing — the
  // doc has just been replaced wholesale, and processing it would
  // generate spurious replacements every time we open a file.
  if (
    txns.some(
      (tr) => tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop'),
    )
  ) {
    handlePasteLigature(update);
  }
});

// Exported for the help / documentation pipeline so we don't drift
// between the table here and what HELP.md claims is supported.
export function ligatureList(): { from: string; to: string }[] {
  return [...LIGATURES.entries()].map(([from, to]) => ({ from, to }));
}
