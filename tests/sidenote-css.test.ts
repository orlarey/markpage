import { describe, expect, it } from 'vitest';

import { pagedCss } from '../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';

/**
 * Purpose: Lock in the §9.7 sidenote CSS branching emitted by
 *   `pagedCss(s)` for each `notes.position`. The corresponding HTML
 *   side (footnoteRef renderer emitting `<span class="sidenote">`) is
 *   covered by the corpus snapshot tests (08-footnotes-deflist).
 */

const A4 = DEFAULT_SETTINGS;

describe('pagedCss — sidenote rendering branch on notes.position', () => {
  it("default 'foot': hides every .sidenote, keeps section.footnotes visible", () => {
    const css = pagedCss({ ...A4, notes: { position: 'foot' } });
    expect(css).toContain('.sidenote { display: none;');
    // Must NOT hide the document-tail footnote section in 'foot' mode.
    expect(css).not.toMatch(/section\.footnotes \{ display: none/);
    // Must NOT hide the superscript ref.
    expect(css).not.toMatch(/\.footnote-ref \{ display: none/);
  });

  it("'end' behaves like 'foot' for the visible footnote section", () => {
    const css = pagedCss({ ...A4, notes: { position: 'end' } });
    expect(css).toContain('.sidenote { display: none;');
    expect(css).not.toMatch(/section\.footnotes \{ display: none/);
  });

  it("'side' in derived mode emits absolute positioning + hide-fallbacks", () => {
    const css = pagedCss({
      ...A4,
      marginMode: 'derived',
      notes: { position: 'side' },
    });
    // The fallback rendering must be hidden.
    expect(css).toMatch(/\.footnote-ref \{ display: none/);
    expect(css).toMatch(/section\.footnotes \{ display: none/);
    // The sidenote span must get absolute positioning in the outer gutter.
    expect(css).toMatch(/\.sidenote \{[\s\S]*position: absolute;/);
    expect(css).toMatch(/\.sidenote \{[\s\S]*right: -\d+\.\d+mm;/);
    // Paragraphs (and friends) need position: relative as containing block.
    expect(css).toMatch(
      /:where\(p, li, blockquote, \.pagedjs_page_content\) \{ position: relative; \}/,
    );
  });

  it("'side' in duplex emits an additional left override for the verso", () => {
    const css = pagedCss({
      ...A4,
      marginMode: 'derived',
      duplex: true,
      notes: { position: 'side' },
    });
    // Verso flip: same .sidenote but anchored on the left.
    expect(css).toMatch(/\.pagedjs_left_page \.sidenote \{[\s\S]*left: -\d+\.\d+mm;[\s\S]*right: auto;/);
  });

  it("'side' in manual mode degrades to hide-sidenote (no geometry to anchor it)", () => {
    // marginMode 'manual' means we don't know the outer gutter — the
    // sidenote can't be positioned safely. We hide it; the visible
    // path is whatever section.footnotes already provides.
    const css = pagedCss({
      ...A4,
      marginMode: 'manual',
      notes: { position: 'side' },
    });
    expect(css).toContain('.sidenote { display: none;');
    // The .sidenote rule itself must NOT carry the absolute layout
    // CSS — match against the block scope only (no greedy `*`).
    expect(css).not.toMatch(/\.sidenote \{[^}]*position: absolute/);
  });
});

describe('pagedCss — sidenote width derives from outer gutter (§9.7.1)', () => {
  it('sidenote width ≈ outerGutter − gap, with gap = innerGutter / 4', () => {
    // Use the "Édition critique" preset values: measure 52, liveArea 85.
    const s: PdfSettings = {
      ...A4,
      marginMode: 'derived',
      measureChars: 52,
      liveAreaChars: 85,
      notes: { position: 'side' },
    };
    const css = pagedCss(s);
    // happy-dom fallback charWidth ≈ 1.94 mm:
    //   textWidth = 52 × 1.94 ≈ 100.9
    //   textHeight = 100.9 × 297/210 ≈ 142.7
    //   liveAreaWidth = 85 × 1.94 ≈ 164.9
    //   liveAreaHeight = 164.9 × 297/210 ≈ 233.3
    //   inner_TB = (210 − 100.9)/3 ≈ 36.4
    //   outer_TB = 2 × 36.4 ≈ 72.7
    //   inner_LA = (210 − 164.9)/3 ≈ 15.05
    //   outer_LA = 2 × 15.05 ≈ 30.05
    //   outer gutter = outer_TB − outer_LA ≈ 42.7 mm
    //   inner gutter = inner_TB − inner_LA ≈ 21.3 mm
    //   gap = 21.3 / 4 ≈ 5.33 mm
    //   sidenote width = 42.7 − 5.33 ≈ 37.3 mm
    expect(css).toMatch(/width: 37\.\d+mm/);
    expect(css).toMatch(/right: -42\.\d+mm/);
  });
});
