import { describe, expect, it } from 'vitest';

import { mathBodyToLatex } from '@orlarey/markpage-render';
import { stripLoneSurrogates } from '../packages/markpage-render/src/math';

// Astral math letters (e.g. 𝒜 U+1D49C, script capital A) used to reach MathJax
// raw. MathJax echoed them into its decorative `data-latex` annotations as an
// *unpaired* UTF-16 surrogate, which then broke the strict `image/svg+xml`
// re-parse in makeIdsUnique and replaced the whole formula with the browser's
// pink "invalid utf-8 sequence" XML-error page.
//
// The fix has two layers:
//   1. mathBodyToLatex converts astral letters → \mathcal{…} / \mathfrak{…} / …
//      BEFORE MathJax, so it only ever sees ASCII TeX (same table the LaTeX
//      export uses — one source of truth).
//   2. stripLoneSurrogates stays as a backstop for any *unmapped* astral char
//      that would otherwise blow up the whole page.

describe('mathBodyToLatex — astral alphanumerics → LaTeX (layer 1)', () => {
  it('maps the script capital 𝒜 to \\mathcal{A}', () => {
    expect(mathBodyToLatex('𝒜').text).toBe('\\mathcal{A}');
  });

  it('maps a letterlike-hole script capital (ℬ U+212C) to \\mathcal{B}', () => {
    expect(mathBodyToLatex('ℬ').text).toBe('\\mathcal{B}');
  });

  it('maps fraktur, bold, italic and monospace blocks', () => {
    expect(mathBodyToLatex('𝔄').text).toBe('\\mathfrak{A}'); // U+1D504
    expect(mathBodyToLatex('ℨ').text).toBe('\\mathfrak{Z}'); // U+2128 hole
    expect(mathBodyToLatex('𝐀').text).toBe('\\mathbf{A}'); // U+1D400
    expect(mathBodyToLatex('𝑨').text).toBe('\\boldsymbol{A}'); // U+1D468
    expect(mathBodyToLatex('𝚊').text).toBe('\\mathtt{a}'); // U+1D68A
  });

  it('leaves the whole fold formula free of any astral char', () => {
    const body = '⟦c(t₁, …, tₙ)⟧_𝒜 = c_𝒜(⟦t₁⟧_𝒜, …, ⟦tₙ⟧_𝒜)';
    const { text } = mathBodyToLatex(body);
    expect(text).toContain('\\mathcal{A}');
    expect(text).toContain('\\llbracket');
    // No code point above the BMP survives → MathJax can't leak a surrogate.
    expect([...text].every((ch) => (ch.codePointAt(0) ?? 0) <= 0xffff)).toBe(true);
  });
});

const HI = '\uD835'; // high surrogate of 𝒜 (U+1D49C)
const LO = '\uDC9C'; // low surrogate of 𝒜 — the half MathJax leaked alone

const hasLoneSurrogate = (s: string): boolean =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe('stripLoneSurrogates — keep MathJax SVG output XML-safe (layer 2)', () => {
  it('drops a lone low surrogate (the exact shape MathJax leaked)', () => {
    const svg = `<svg><g data-mml-node="msub" data-latex="c_${LO}"><g data-latex="${LO}"><use data-c="1D49C"/></g></g></svg>`;
    const out = stripLoneSurrogates(svg);
    expect(hasLoneSurrogate(svg)).toBe(true); // precondition: input is broken
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out).toContain('data-latex="c_"');
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });

  it('drops a lone high surrogate', () => {
    expect(stripLoneSurrogates(`a${HI}b`)).toBe('ab');
  });

  it('preserves a properly paired astral character (𝒜)', () => {
    expect(stripLoneSurrogates(`x=${HI}${LO}!`)).toBe('x=𝒜!');
  });

  it('leaves plain BMP text untouched (fast path)', () => {
    const s = '<svg><use data-c="41"/></svg>';
    expect(stripLoneSurrogates(s)).toBe(s);
  });
});
