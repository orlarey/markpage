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
  return m;
}

const LIGATURES = buildLigatures();

// Sort keys longest first — `endsWith` against the cursor's tail will
// pick the longest match if multiple keys end at the same position.
// (After the prefix-free filtering above this only matters if we ever
// add overlapping keys, but it's cheap insurance.)
const KEYS = [...LIGATURES.keys()].sort((a, b) => b.length - a.length);
const MAX_LEN = Math.max(...KEYS.map((k) => k.length));

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);

function inCodeContext(state: EditorState, pos: number): boolean {
  let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(
    state,
  ).resolveInner(pos, -1);
  while (node) {
    if (CODE_NODES.has(node.type.name)) return true;
    node = node.parent;
  }
  return false;
}

export const ligatures: Extension = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  // React only to direct user typing — not paste, undo, programmatic
  // setValue. CodeMirror tags those with userEvent.
  const isTyping = update.transactions.some(
    (tr) => tr.isUserEvent('input.type') || tr.isUserEvent('input'),
  );
  if (!isTyping) return;

  const head = update.state.selection.main.head;
  const start = Math.max(0, head - MAX_LEN);
  const tail = update.state.doc.sliceString(start, head);

  for (const key of KEYS) {
    if (!tail.endsWith(key)) continue;
    const matchStart = head - key.length;
    // Don't rewrite inside code blocks / inline code — `=>` in a JS
    // snippet is not the symbol the user wants substituted.
    if (inCodeContext(update.state, matchStart)) return;
    const value = LIGATURES.get(key);
    if (value === undefined) return;
    // CodeMirror disallows synchronous dispatch from inside an
    // updateListener. queueMicrotask defers to the next tick, after
    // the current update has settled, but before any paint — the
    // user sees the substitution as a single visual change.
    queueMicrotask(() => {
      update.view.dispatch({
        changes: { from: matchStart, to: head, insert: value },
      });
    });
    return;
  }
});

// Exported for the help / documentation pipeline so we don't drift
// between the table here and what HELP.md claims is supported.
export function ligatureList(): { from: string; to: string }[] {
  return [...LIGATURES.entries()].map(([from, to]) => ({ from, to }));
}
