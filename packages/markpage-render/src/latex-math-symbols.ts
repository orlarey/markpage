/********************************* latex-math-symbols.ts ***********************
 *
 * Purpose: Translate Unicode math symbols carried in markpage docs back to their
 *   canonical LaTeX commands. Used by BOTH render paths: `mathBodyToLatex` runs
 *   before MathJax (so it only ever sees ASCII LaTeX — easier to debug, and
 *   astral letters like 𝒜 can't leak a broken surrogate) and before the LaTeX
 *   export (so the two stay identical and symbols survive `inputenc utf8`).
 * How: A static `TABLE` (Unicode → LaTeX command); `mathBodyToLatex` walks code
 *   points, emits the mapped form, and collects unmapped non-ASCII for warnings.
 *
 *******************************************************************************/

// Unicode → LaTeX command table applied inside math zones.
//
// Why this exists: markpage documents — especially the ones using the
// editor's ligature pass (§18) — carry math symbols as plain
// Unicode (→, ⊢, ⟦, ℕ, α, …). LaTeX's `inputenc utf8` tolerates
// these in prose but not in math mode under the default Computer
// Modern setup. We rewrite known characters to their canonical
// LaTeX command on the way out, leaving anything we don't know in
// place (and emitting a warning so the user can patch).

const TABLE: Record<string, string> = {
  // ---- arrows -------------------------------------------------------
  '→': '\\to ',
  '←': '\\leftarrow ',
  '⇒': '\\Rightarrow ',
  '⇐': '\\Leftarrow ',
  '↔': '\\leftrightarrow ',
  '⇔': '\\Leftrightarrow ',
  '↦': '\\mapsto ',
  '↑': '\\uparrow ',
  '↓': '\\downarrow ',
  '↕': '\\updownarrow ',
  '⇑': '\\Uparrow ',
  '⇓': '\\Downarrow ',
  '↗': '\\nearrow ',
  '↘': '\\searrow ',
  '↙': '\\swarrow ',
  '↖': '\\nwarrow ',
  '↪': '\\hookrightarrow ',
  '↩': '\\hookleftarrow ',
  '⇀': '\\rightharpoonup ',
  '⇁': '\\rightharpoondown ',

  // ---- logic --------------------------------------------------------
  '⊢': '\\vdash ',
  '⊣': '\\dashv ',
  '⊨': '\\models ',
  '⊥': '\\bot ',
  '⊤': '\\top ',
  '¬': '\\neg ',
  '∧': '\\land ',
  '∨': '\\lor ',
  '∴': '\\therefore ',
  '∵': '\\because ',

  // ---- relations ----------------------------------------------------
  '≤': '\\leq ',
  '≥': '\\geq ',
  '≠': '\\neq ',
  '≈': '\\approx ',
  '≡': '\\equiv ',
  '≃': '\\simeq ',
  '≅': '\\cong ',
  '≢': '\\not\\equiv ',
  '≪': '\\ll ',
  '≫': '\\gg ',
  '∝': '\\propto ',
  '∼': '\\sim ',

  // ---- operators ----------------------------------------------------
  '±': '\\pm ',
  '∓': '\\mp ',
  '×': '\\times ',
  '÷': '\\div ',
  '∘': '\\circ ',
  '⋅': '\\cdot ',
  '∗': '\\ast ',
  '⊕': '\\oplus ',
  '⊗': '\\otimes ',
  '⊙': '\\odot ',
  '√': '\\sqrt',
  '∇': '\\nabla ',
  '∂': '\\partial ',
  '∞': '\\infty ',
  '∑': '\\sum ',
  '∏': '\\prod ',
  '∐': '\\coprod ',
  '∫': '\\int ',
  '∬': '\\iint ',
  '∭': '\\iiint ',
  '∮': '\\oint ',

  // ---- set theory ---------------------------------------------------
  '∀': '\\forall ',
  '∃': '\\exists ',
  '∄': '\\nexists ',
  '∈': '\\in ',
  '∉': '\\notin ',
  '⊂': '\\subset ',
  '⊆': '\\subseteq ',
  '⊃': '\\supset ',
  '⊇': '\\supseteq ',
  '⊊': '\\subsetneq ',
  '⊋': '\\supsetneq ',
  '⊄': '\\not\\subset ',
  '⊅': '\\not\\supset ',
  '∪': '\\cup ',
  '∩': '\\cap ',
  '∅': '\\emptyset ',
  '∖': '\\setminus ',
  '∁': '\\complement ',

  // ---- Greek lowercase ---------------------------------------------
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'δ': '\\delta ',
  'ε': '\\varepsilon ',
  'ζ': '\\zeta ',
  'η': '\\eta ',
  'θ': '\\theta ',
  'ι': '\\iota ',
  'κ': '\\kappa ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'ν': '\\nu ',
  'ξ': '\\xi ',
  'π': '\\pi ',
  'ρ': '\\rho ',
  'σ': '\\sigma ',
  'τ': '\\tau ',
  'υ': '\\upsilon ',
  'φ': '\\varphi ',
  'χ': '\\chi ',
  'ψ': '\\psi ',
  'ω': '\\omega ',

  // ---- Greek variants ----------------------------------------------
  'ϵ': '\\epsilon ',
  'ϑ': '\\vartheta ',
  'ϕ': '\\phi ',
  'ϖ': '\\varpi ',
  'ϱ': '\\varrho ',
  'ς': '\\varsigma ',

  // ---- Greek uppercase (the ones LaTeX has a command for; A, B, E,
  //      H, I, K, M, N, O, P, T, X, Y, Z look like Latin letters and
  //      should be typed with their Latin form anyway). ------------
  'Γ': '\\Gamma ',
  'Δ': '\\Delta ',
  'Θ': '\\Theta ',
  'Λ': '\\Lambda ',
  'Ξ': '\\Xi ',
  'Π': '\\Pi ',
  'Σ': '\\Sigma ',
  'Υ': '\\Upsilon ',
  'Φ': '\\Phi ',
  'Ψ': '\\Psi ',
  'Ω': '\\Omega ',

  // ---- blackboard bold (the canonical six plus H, the rest filled
  //      in programmatically below). amsmath needs the trailing
  //      space the renderer adds via the `\mathbb{X}` form. -------
  'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}',
  'ℚ': '\\mathbb{Q}',
  'ℝ': '\\mathbb{R}',
  'ℂ': '\\mathbb{C}',
  'ℙ': '\\mathbb{P}',
  'ℍ': '\\mathbb{H}',

  // ---- brackets / delimiters ---------------------------------------
  '⟦': '\\llbracket ',
  '⟧': '\\rrbracket ',
  '⟨': '\\langle ',
  '⟩': '\\rangle ',
  '⌊': '\\lfloor ',
  '⌋': '\\rfloor ',
  '⌈': '\\lceil ',
  '⌉': '\\rceil ',

  // ---- misc --------------------------------------------------------
  '…': '\\ldots ',
  '⋯': '\\cdots ',
  '⋮': '\\vdots ',
  '⋱': '\\ddots ',
  '′': '\\prime ',
  '∠': '\\angle ',
  '°': '^\\circ ',

  // ---- letterlike / constants --------------------------------------
  'ℵ': '\\aleph ',
  'ℏ': '\\hbar ',

  // ---- more operators / shapes -------------------------------------
  '•': '\\bullet ',
  '⋆': '\\star ',
  '⋄': '\\diamond ',
  '†': '\\dagger ',
  '‡': '\\ddagger ',
  '△': '\\triangle ',
  '□': '\\square ',
  '∥': '\\parallel ',
  '∋': '\\ni ',

  // ---- Greek (omicron looks Latin but has a command) ---------------
  'ο': '\\omicron ',

  // ---- long arrows -------------------------------------------------
  '⟶': '\\longrightarrow ',
  '⟵': '\\longleftarrow ',
  '⟷': '\\longleftrightarrow ',
  '⟹': '\\Longrightarrow ',
  '⟸': '\\Longleftarrow ',
  '⟺': '\\Longleftrightarrow ',

  // ---- negated relations (amssymb) ---------------------------------
  '≮': '\\nless ',
  '≯': '\\ngtr ',
  '≰': '\\nleq ',
  '≱': '\\ngeq ',
  '≁': '\\nsim ',
  '≇': '\\ncong ',
};

// Mathematical Double-Struck Capital A-Z (U+1D538-U+1D551), filling
// the alphabet for entries the literal-symbol table above doesn't
// cover. ℕ ℤ ℚ ℝ ℂ ℙ ℍ live at "letterlike" codepoints, so the loop
// happily overrides identical entries.
for (let i = 0; i < 26; i += 1) {
  const cp = 0x1d538 + i;
  const letter = String.fromCodePoint(cp);
  const ascii = String.fromCodePoint(0x41 + i);
  TABLE[letter] = `\\mathbb{${ascii}}`;
}

// ---- Mathematical Alphanumeric Symbols (U+1D400–U+1D7FF) ----------
// Each style block is 26 capitals then 26 smalls at a fixed offset, but
// a handful of glyphs live at older "letterlike" codepoints instead —
// reserved *holes* in the SMP block (e.g. script B is ℬ U+212C, not
// U+1D49D). We fill the block programmatically, then patch the holes
// with the real character a user actually types (same shape as the
// double-struck ℕ ℤ … loop above). Mapping these to explicit \math…
// commands — rather than letting the astral character reach MathJax —
// keeps the render and LaTeX-export paths identical AND stops MathJax
// echoing an unpaired UTF-16 surrogate into its `data-latex` annotation,
// which otherwise makes the SVG's strict XML re-parse fail (the
// stripLoneSurrogates guard in math.ts is the belt-and-braces backstop).
interface AlphaBlock {
  cap: number; // codepoint of this block's capital A
  low: number; // codepoint of this block's small a
  wrap: (letter: string) => string; // ASCII letter → LaTeX command
  holes?: Record<string, string>; // real glyph → the ASCII letter it stands for
}
const ALPHA_BLOCKS: AlphaBlock[] = [
  { cap: 0x1d400, low: 0x1d41a, wrap: (l) => `\\mathbf{${l}}` },
  { cap: 0x1d434, low: 0x1d44e, wrap: (l) => `\\mathit{${l}}`, holes: { 'ℎ': 'h' } },
  { cap: 0x1d468, low: 0x1d482, wrap: (l) => `\\boldsymbol{${l}}` },
  {
    cap: 0x1d49c,
    low: 0x1d4b6,
    wrap: (l) => `\\mathcal{${l}}`,
    holes: { 'ℬ': 'B', 'ℰ': 'E', 'ℱ': 'F', 'ℋ': 'H', 'ℐ': 'I', 'ℒ': 'L', 'ℳ': 'M', 'ℛ': 'R', 'ℯ': 'e', 'ℊ': 'g', 'ℴ': 'o' },
  },
  {
    cap: 0x1d504,
    low: 0x1d51e,
    wrap: (l) => `\\mathfrak{${l}}`,
    holes: { 'ℭ': 'C', 'ℌ': 'H', 'ℑ': 'I', 'ℜ': 'R', 'ℨ': 'Z' },
  },
  { cap: 0x1d5a0, low: 0x1d5ba, wrap: (l) => `\\mathsf{${l}}` },
  { cap: 0x1d670, low: 0x1d68a, wrap: (l) => `\\mathtt{${l}}` },
];
for (const blk of ALPHA_BLOCKS) {
  for (let i = 0; i < 26; i += 1) {
    TABLE[String.fromCodePoint(blk.cap + i)] = blk.wrap(String.fromCodePoint(0x41 + i));
    TABLE[String.fromCodePoint(blk.low + i)] = blk.wrap(String.fromCodePoint(0x61 + i));
  }
  for (const [glyph, letter] of Object.entries(blk.holes ?? {})) {
    TABLE[glyph] = blk.wrap(letter);
  }
}

// Single canonical command per glyph, used to clean a `\name ` form.
const CLEAN_COMMAND_RE = /^\\([a-zA-Z]+) $/;

/**
 * Purpose: The inverse of `TABLE` (LaTeX command → Unicode glyph) for the
 *   editor's `\`-command ligatures — so typing `\cmd ` inserts exactly the
 *   glyph the LaTeX export turns back into `\cmd` (round-trip on one table).
 * How: Keep only **plain symbol commands** — a single `\name` with a trailing
 *   space. This drops, by construction, argument macros (`\sqrt`, `\mathbb{}`),
 *   multi-command forms (`\not\equiv`) and non-command forms (`^\circ`).
 */
export function latexToUnicode(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [glyph, latex] of Object.entries(TABLE)) {
    const match = CLEAN_COMMAND_RE.exec(latex);
    if (match?.[1]) m.set(match[1], glyph);
  }
  return m;
}

/**
 * Purpose: Decide whether a character is safe to keep verbatim inside math mode.
 * How: True for ASCII (cp ≤ 0x7F); non-ASCII is flagged when not in `TABLE`.
 */
// Characters that are safe to keep verbatim inside math: ASCII +
// whitespace + the LaTeX-active punctuation we don't want to flag.
// We only warn on non-ASCII characters that aren't in the table,
// since ASCII is always math-mode-safe.
function isMathSafe(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp === undefined || cp <= 0x7f;
}

/**
 * Purpose: Bundle returned by `mathBodyToLatex` — converted text plus unmapped chars.
 * How: `text` is the rewritten string; `unmapped` collects non-ASCII chars not in `TABLE`.
 */
export interface MathConvertResult {
  text: string;
  unmapped: Set<string>;
}

/**
 * Purpose: Rewrite Unicode math symbols in `input` to their LaTeX commands.
 * How: Iterate code points (handles astral plane); look up `TABLE`, accumulate unmapped non-ASCII.
 */
export function mathBodyToLatex(input: string): MathConvertResult {
  const unmapped = new Set<string>();
  let out = '';
  // Walk code points (not UTF-16 units) so astral plane symbols
  // (like 𝔸…𝕐) come through as a single key in the table.
  for (const ch of input) {
    const tx = TABLE[ch];
    if (tx !== undefined) {
      out += tx;
    } else {
      if (!isMathSafe(ch)) unmapped.add(ch);
      out += ch;
    }
  }
  return { text: out, unmapped };
}
