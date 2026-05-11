// Unicode → LaTeX command table applied inside math zones.
//
// Why this exists: md2pdf documents — especially the ones using the
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

// Characters that are safe to keep verbatim inside math: ASCII +
// whitespace + the LaTeX-active punctuation we don't want to flag.
// We only warn on non-ASCII characters that aren't in the table,
// since ASCII is always math-mode-safe.
function isMathSafe(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp === undefined || cp <= 0x7f;
}

export interface MathConvertResult {
  text: string;
  unmapped: Set<string>;
}

// Rewrites every Unicode math symbol it knows about into the
// equivalent LaTeX command, and collects (without dropping)
// characters it doesn't know — caller surfaces those as warnings.
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
