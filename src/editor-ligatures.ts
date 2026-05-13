// Editor input method: type a short ASCII sequence, get the Unicode
// math/typography symbol immediately. The substitution lives in the
// source — there is no "rendered representation" different from the
// actual file content. Portable, copy-pasteable, searchable.
//
// Two families of trigger:
//
// 1. **Tail-match ligatures** (`->`, `|-`, `[[`, `|A`-`|Z`, ...) —
//    short symbol-only sequences. Fire as soon as the cursor's tail
//    matches a known key. The set is curated to be prefix-free so
//    no shorter key shadows a longer one.
//
// 2. **Backslash commands** (`\alpha`, `\int`, `\subset`, ...) —
//    LaTeX-style names. Fire ONLY when the user types a non-letter
//    terminator after the command (space, punctuation, operator,
//    newline). The terminator stays in the source. Letting the
//    terminator gate the substitution removes the prefix-free
//    constraint between commands, so `\in` / `\int` / `\infty` and
//    `\subset` / `\subseteq` etc. can coexist without one shadowing
//    the next.
//
// Ligatures are skipped inside code contexts (FencedCode, InlineCode)
// so writing `function () => {}` in a JS fence doesn't get rewritten
// to `function () ⇒ {}`. The `inference` fence is whitelisted because
// it compiles to math, where MathJax accepts Unicode operators
// directly.

import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// ---- Blackboard-bold letters ------------------------------------------

// Most blackboard-bold capitals live at U+1D538+, but seven were
// assigned dedicated BMP code points before the block was created.
// Prefer the BMP code point where it exists (better font coverage),
// fall back to the U+1D5xx range for the rest.
const BBB_BMP: ReadonlyMap<string, string> = new Map([
  ['C', 'ℂ'],
  ['H', 'ℍ'],
  ['N', 'ℕ'],
  ['P', 'ℙ'],
  ['Q', 'ℚ'],
  ['R', 'ℝ'],
  ['Z', 'ℤ'],
]);

const A_CODE = 0x41;
const Z_CODE = 0x5a;
const BBB_A = 0x1d538;

function blackboardBold(letter: string): string {
  return (
    BBB_BMP.get(letter) ??
    String.fromCodePoint(BBB_A + (letter.codePointAt(0) ?? A_CODE) - A_CODE)
  );
}

// ---- Backslash commands -----------------------------------------------

// Map from LaTeX command name (without the leading backslash) to its
// Unicode glyph. The terminator-based trigger means we can have both
// `\in` and `\int` without conflict — the user types `\in ` to get ∈
// and `\int ` to get ∫, the space disambiguates.
//
// Greek codepoints match MathJax's own rendering choices, so the
// substituted source is visually identical to the LaTeX command in
// math mode:
//   - `\epsilon` → ϵ (lunate, U+03F5), `\varepsilon` → ε (U+03B5)
//   - `\phi` → ϕ (stroked, U+03D5), `\varphi` → φ (loopy, U+03C6)
const BS_COMMANDS: ReadonlyMap<string, string> = new Map([
  // ---- Greek lowercase
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
  // Greek variants
  ['varepsilon', 'ε'],
  ['varphi', 'φ'],
  ['vartheta', 'ϑ'],
  ['varpi', 'ϖ'],
  ['varrho', 'ϱ'],
  ['varsigma', 'ς'],
  // Greek uppercase (only those that differ from the Latin glyph)
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

  // ---- Set theory & quantifiers
  ['in', '∈'],
  ['notin', '∉'],
  ['subset', '⊂'],
  ['supset', '⊃'],
  ['subseteq', '⊆'],
  ['supseteq', '⊇'],
  ['cup', '∪'],
  ['cap', '∩'],
  ['emptyset', '∅'],
  ['forall', '∀'],
  ['exists', '∃'],

  // ---- Logic
  ['wedge', '∧'],
  ['vee', '∨'],
  ['neg', '¬'],

  // ---- Relations
  ['approx', '≈'],
  ['equiv', '≡'],
  ['cong', '≅'],
  ['sim', '∼'],
  ['propto', '∝'],
  ['perp', '⊥'],
  ['parallel', '∥'],

  // ---- Operators
  ['oplus', '⊕'],
  ['otimes', '⊗'],
  ['circ', '∘'],
  ['bullet', '•'],
  ['cdot', '⋅'],
  ['times', '×'],
  ['div', '÷'],

  // ---- Calculus
  ['partial', '∂'],
  ['nabla', '∇'],
  ['infty', '∞'],
  ['sum', '∑'],
  ['prod', '∏'],
  ['int', '∫'],
  ['oint', '∮'],

  // ---- Constants
  ['aleph', 'ℵ'],
  ['hbar', 'ℏ'],

  // ---- Dots
  ['cdots', '⋯'],
  ['vdots', '⋮'],
  ['ddots', '⋱'],
  ['ldots', '…'],

  // ---- Arrows
  ['mapsto', '↦'],
  ['Leftarrow', '⇐'],
  ['Rightarrow', '⇒'],
  ['Leftrightarrow', '⇔'],
]);

// ---- Tail-match ligatures ---------------------------------------------

// Short symbol-only triggers. The set is prefix-free so longest-first
// resolution correctly picks the more specific match at each position.
function buildTailLigatures(): ReadonlyMap<string, string> {
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
  return m;
}

const TAIL_LIGATURES = buildTailLigatures();
const TAIL_KEYS = [...TAIL_LIGATURES.keys()].sort((a, b) => b.length - a.length);
const TAIL_MAX_LEN = Math.max(...TAIL_KEYS.map((k) => k.length));

// Longest backslash command name (used as a look-back window).
const BS_MAX_LEN = Math.max(...[...BS_COMMANDS.keys()].map((k) => k.length));

// ---- Code-context detection -------------------------------------------

// Fence info strings that *re-enable* ligatures even inside the fenced
// block, because the block ultimately becomes math (rendered by
// MathJax, which accepts Unicode operators directly).
const LIGATURE_FRIENDLY_FENCES = new Set(['inference']);

function fencedCodeAllowsLigatures(
  state: EditorState,
  fenceNode: {
    from: number;
    to: number;
    getChild(name: string): { from: number; to: number } | null;
  },
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
      return !fencedCodeAllowsLigatures(state, node);
    }
    if (name === 'CodeBlock' || name === 'InlineCode') return true;
    node = node.parent;
  }
  return false;
}

// ---- Substitution paths -----------------------------------------------

const LETTER_RE = /^[a-zA-Z]$/;
const BS = String.fromCodePoint(0x5c);
const BS_TAIL_RE = /\\([a-zA-Z]+)$/;
// Matches `\xxx` where `xxx` is alphabetic and the next char is non-
// alphabetic (or end of string). The negative lookbehind for a
// second backslash is the "anti-terminator": a literal `\\` before
// the command (which is also Markdown's escape for a literal
// backslash) tells the substitution to stand down.
const BS_PASTE_RE = /(?<!\\)\\([a-zA-Z]+)(?=[^a-zA-Z]|$)/g;

// Rewrite a chunk of pasted text. Two passes:
//   1. `\xxx<non-letter>` → glyph, applied via a single regex pass.
//   2. Tail-match ligatures via longest-first scan on the result.
function applyLigaturesToString(text: string): string {
  const afterBs = text.replace(BS_PASTE_RE, (m, name: string) => {
    return BS_COMMANDS.get(name) ?? m;
  });
  let out = '';
  let i = 0;
  outer: while (i < afterBs.length) {
    for (const key of TAIL_KEYS) {
      if (afterBs.startsWith(key, i)) {
        out += TAIL_LIGATURES.get(key) ?? key;
        i += key.length;
        continue outer;
      }
    }
    out += afterBs[i];
    i += 1;
  }
  return out;
}

// Direct-typing dispatch. Two paths, in order:
//   1. If the last char is a non-letter terminator AND the chars
//      immediately before form `\xxx` with a known command, replace
//      the `\xxx` (keeping the terminator).
//   2. Otherwise, try a tail-match against the symbol-only ligatures.
function handleTypingLigature(update: {
  state: EditorState;
  view: EditorView;
}): void {
  const head = update.state.selection.main.head;
  if (head === 0) return;

  const lastChar = update.state.doc.sliceString(head - 1, head);

  // Backslash-command path.
  if (lastChar !== '' && !LETTER_RE.test(lastChar)) {
    const lookBack = Math.max(0, head - 1 - BS_MAX_LEN - 1);
    const beforeTerminator = update.state.doc.sliceString(lookBack, head - 1);
    const match = BS_TAIL_RE.exec(beforeTerminator);
    if (match) {
      const name = match[1] ?? '';
      const value = BS_COMMANDS.get(name);
      if (value !== undefined) {
        // Replace `\<name>` (length = name.length + 1 for the
        // backslash). The terminator (lastChar) stays in place.
        const matchStart = head - 1 - name.length - 1;
        // Anti-terminator: a literal `\` immediately before the
        // matched `\xxx` (i.e. the user typed `\\xxx<terminator>`)
        // suppresses the substitution. Mirrors the negative
        // lookbehind in BS_PASTE_RE.
        const prevChar =
          matchStart > 0
            ? update.state.doc.sliceString(matchStart - 1, matchStart)
            : '';
        if (prevChar === BS) return;
        if (!inCodeContext(update.state, matchStart)) {
          queueMicrotask(() => {
            update.view.dispatch({
              changes: { from: matchStart, to: head - 1, insert: value },
            });
          });
          return;
        }
      }
    }
  }

  // Tail-match path.
  const tailStart = Math.max(0, head - TAIL_MAX_LEN);
  const tail = update.state.doc.sliceString(tailStart, head);
  for (const key of TAIL_KEYS) {
    if (!tail.endsWith(key)) continue;
    const matchStart = head - key.length;
    if (inCodeContext(update.state, matchStart)) return;
    const value = TAIL_LIGATURES.get(key);
    if (value === undefined) return;
    queueMicrotask(() => {
      update.view.dispatch({
        changes: { from: matchStart, to: head, insert: value },
      });
    });
    return;
  }
}

function handlePasteLigature(update: {
  transactions: readonly {
    changes: {
      iterChanges: (
        cb: (
          fromA: number,
          toA: number,
          fromB: number,
          toB: number,
          inserted: { toString(): string },
        ) => void,
      ) => void;
    };
  }[];
  state: EditorState;
  view: EditorView;
}): void {
  const replacements: { from: number; to: number; insert: string }[] = [];
  for (const tr of update.transactions) {
    tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
      const text = inserted.toString();
      if (text === '') return;
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
  if (txns.some((tr) => tr.isUserEvent('input.type'))) {
    handleTypingLigature(update);
    return;
  }
  if (
    txns.some(
      (tr) => tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop'),
    )
  ) {
    handlePasteLigature(update);
  }
});

// ---- Help / documentation hook ----------------------------------------

// Returns the full ligature table flat, with backslash commands
// prefixed with `\` so the help table reads like LaTeX.
export function ligatureList(): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const [key, value] of TAIL_LIGATURES) {
    out.push({ from: key, to: value });
  }
  for (const [name, value] of BS_COMMANDS) {
    out.push({ from: BS + name, to: value });
  }
  return out;
}
