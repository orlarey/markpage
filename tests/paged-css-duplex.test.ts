import { describe, expect, it } from 'vitest';

import { pagedCss } from '../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';

/**
 * Purpose: Lock in the CSS shape emitted by `pagedCss` for the §9.5
 *   duplex and chapterBreak features. The tests assert string
 *   fragments rather than full snapshots so the rest of the
 *   stylesheet can evolve without forcing a rewrite here.
 */

const A4 = DEFAULT_SETTINGS; // marginMode: 'manual', duplex: false, chapterBreak: 'none'
const m = A4.margins;

describe('pagedCss — simplex (default)', () => {
  it('emits a single @page rule with the nominal margins', () => {
    const css = pagedCss(A4);
    expect(css).toContain(
      `margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`,
    );
    // No left/right pseudo-class — the page applies to every page.
    expect(css).not.toContain('@page :left');
    expect(css).not.toContain('@page :right');
  });

  it("emits no chapterBreak rule when chapterBreak === 'none'", () => {
    const css = pagedCss(A4);
    expect(css).not.toContain('h1 { break-before: page; }');
    expect(css).not.toContain('h1 { break-before: right; }');
  });
});

describe('pagedCss — duplex (mirror margins on @page :left)', () => {
  const duplex: PdfSettings = { ...A4, duplex: true };

  it('emits both @page :right and @page :left margin rules', () => {
    const css = pagedCss(duplex);
    expect(css).toContain('@page :right');
    expect(css).toContain('@page :left');
  });

  it('keeps the nominal margins on @page :right (recto)', () => {
    const css = pagedCss(duplex);
    expect(css).toMatch(
      new RegExp(
        `@page :right\\s*\\{\\s*margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`,
      ),
    );
  });

  it('mirrors left and right on @page :left (verso)', () => {
    const css = pagedCss(duplex);
    expect(css).toMatch(
      new RegExp(
        `@page :left\\s*\\{\\s*margin: ${m.top}mm ${m.left}mm ${m.bottom}mm ${m.right}mm;`,
      ),
    );
  });

  it('keeps the page size rule on the generic @page (shared across both faces)', () => {
    const css = pagedCss(duplex);
    expect(css).toMatch(/@page\s*\{\s*size: \d+mm \d+mm;\s*[\s\S]*?\}/);
  });
});

describe('pagedCss — derived margins (marginMode: derived)', () => {
  // §9.6 / §9.6.6 — in derived mode, @page margin is asymmetric:
  // vertical (top/bottom) = TEXT BLOCK margins, horizontal
  // (inner/outer) = LIVE AREA margins. This places the @top-* /
  // @bottom-* boxes inside the canonical header / footer BANDS rather
  // than in the canonical blank zone above / below them. The narrower
  // text-block width is recovered via horizontal-only body padding on
  // .pagedjs_page_content (vertical padding is 0; the body height
  // already equals the text-block height by virtue of the @page
  // margin).
  // happy-dom has no canvas, so measureAverageCharWidth falls back to
  // the 0.5 em heuristic; body fontSize = 11pt gives charWidth ≈
  // 1.9404 mm.
  //   liveAreaWidth  = 85 × 1.9404 ≈ 164.93 mm
  //   liveAreaHeight = 164.93 × 297/210 ≈ 233.27 mm
  //   inner_LA ≈ 15.02 mm, outer_LA ≈ 30.05 mm
  //   top_LA   ≈ 21.24 mm, bottom_LA ≈ 42.49 mm
  //   textBlockWidth  = 66 × 1.9404 ≈ 128.07 mm
  //   inner_TB ≈ 27.31 mm, outer_TB ≈ 54.62 mm
  //   top_TB   ≈ 38.61 mm, bottom_TB ≈ 77.22 mm
  //   inner gutter = inner_TB − inner_LA ≈ 12.29 mm
  //   outer gutter = outer_TB − outer_LA ≈ 24.58 mm
  const derivedSimplex: PdfSettings = { ...A4, marginMode: 'derived' };
  const derivedDuplex: PdfSettings = { ...derivedSimplex, duplex: true };

  it('@page margin: vertical = TEXT BLOCK, horizontal = LIVE AREA (simplex)', () => {
    const css = pagedCss(derivedSimplex);
    // top outer bottom inner — top/bottom from text block (38/77),
    // outer/inner from live area (30/15).
    expect(css).toMatch(/margin:\s+38\.\d+mm\s+30\.\d+mm\s+77\.\d+mm\s+15\.\d+mm;/);
    // Manual margins must not leak.
    expect(css).not.toContain(`margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`);
  });

  it('mirrors inner/outer on @page :right / :left in duplex (vertical stays text-block)', () => {
    const css = pagedCss(derivedDuplex);
    expect(css).toMatch(/@page :right \{ margin: 38\.\d+mm 30\.\d+mm 77\.\d+mm 15\.\d+mm; \}/);
    expect(css).toMatch(/@page :left  \{ margin: 38\.\d+mm 15\.\d+mm 77\.\d+mm 30\.\d+mm; \}/);
  });

  it('emits horizontal-only body padding on .pagedjs_page_content (simplex)', () => {
    const css = pagedCss(derivedSimplex);
    // padding shorthand: 0 outer 0 inner — gutters only.
    expect(css).toMatch(/\.pagedjs_page_content \{ padding: 0 24\.\d+mm 0 12\.\d+mm; \}/);
  });

  it('emits two body-padding rules in duplex, swapping inner/outer on the verso', () => {
    const css = pagedCss(derivedDuplex);
    expect(css).toMatch(/\.pagedjs_right_page \.pagedjs_page_content \{ padding: 0 24\.\d+mm 0 12\.\d+mm; \}/);
    expect(css).toMatch(/\.pagedjs_left_page\s+\.pagedjs_page_content \{ padding: 0 12\.\d+mm 0 24\.\d+mm; \}/);
  });

  it('emits CSS variables --mp-live-* and --mp-gutter-* for the debug overlay', () => {
    const css = pagedCss(derivedSimplex);
    expect(css).toMatch(/--mp-live-top:\s+21\.\d+mm/);
    expect(css).toMatch(/--mp-live-bottom:\s+42\.\d+mm/);
    expect(css).toMatch(/--mp-live-inner:\s+15\.\d+mm/);
    expect(css).toMatch(/--mp-live-outer:\s+30\.\d+mm/);
    expect(css).toMatch(/--mp-gutter-inner:\s+12\.\d+mm/);
    expect(css).toMatch(/--mp-gutter-outer:\s+24\.\d+mm/);
  });

  it('places header / footer at the live-area edges via align-items + padding', () => {
    const css = pagedCss(derivedSimplex);
    // Header: align-items: flex-start + padding-top = live_LA.top (≈ 21mm)
    //         → text top sits at the live area top edge.
    expect(css).toMatch(
      /\.pagedjs_margin-top-center[\s\S]*?align-items:\s+flex-start;\s*padding-top:\s+21\.\d+mm/,
    );
    // Footer: align-items: flex-end + padding-bottom = live_LA.bottom (≈ 42mm)
    //         → text bottom sits at the live area bottom edge.
    expect(css).toMatch(
      /\.pagedjs_margin-bottom-center[\s\S]*?align-items:\s+flex-end;\s*padding-bottom:\s+42\.\d+mm/,
    );
  });

  it('falls back to the manual margins when marginMode === "manual" (unchanged)', () => {
    const css = pagedCss({ ...A4, marginMode: 'manual' });
    expect(css).toContain(
      `margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`,
    );
    // No body-padding rule emitted in manual mode (the string
    // `.pagedjs_page_content` may appear in unrelated comments —
    // assert the absence of the actual padding RULE shape).
    expect(css).not.toMatch(/\.pagedjs_page_content \{ padding:/);
    expect(css).not.toMatch(/\.pagedjs_right_page \.pagedjs_page_content/);
  });
});

describe('pagedCss — running-content typography', () => {
  it('emits a margin-box rule reflecting the running-content style', () => {
    const css = pagedCss({
      ...A4,
      styles: {
        ...A4.styles,
        'running-content': {
          fontSize: 10,
          color: '#222222',
          weight: 500,
          italic: true,
        },
      },
    });
    // Targets the @margin BOX selectors directly (not the inner
    // .pagedjs_margin-content wrapper) so per-slot bold / italic
    // extracts (page-running.css) can override via the cascade.
    expect(css).toMatch(/\.pagedjs_margin-top-left[\s\S]*\.pagedjs_margin-bottom-right/);
    expect(css).toContain('font-size: 10pt');
    expect(css).toContain('color: #222222');
    expect(css).toContain('font-weight: 500');
    expect(css).toContain('font-style: italic');
  });

  it('emits no margin-box typography rule when the style has no overrides', () => {
    const css = pagedCss({
      ...A4,
      styles: {
        ...A4.styles,
        'running-content': {},
      },
    });
    // Absent style → no rule. We assert neither the new box-targeted
    // shape nor the legacy .pagedjs_margin-content shape leaks out.
    expect(css).not.toMatch(/:is\(\.pagedjs_margin-top-left-corner/);
    expect(css).not.toContain('.pagedjs_margin-content {');
  });
});

describe('pagedCss — letterhead signature alignment', () => {
  it('manual mode: signature margin-left = 110 mm − page left margin (matches FR DL window recipient)', () => {
    // Default A4 has margins.left = 35 mm → signature should be at
    // 110 − 35 = 75 mm from the .pagedjs_page_content content edge,
    // which equals 110 mm from the page edge — i.e. the same x as
    // the .letterhead-recipient.letterhead-window absolute left.
    const css = pagedCss(A4);
    expect(css).toMatch(/\.letterhead-signature \{[\s\S]*?margin-left:\s*75mm/);
  });

  it('derived mode: signature margin-left subtracts the inner gutter too (in-flow under page-content padding)', () => {
    // In derived mode, .pagedjs_page_content carries a padding-left
    // equal to the inner gutter (text-block.inner − live-area.inner).
    // The signature, in flow inside the wrapper, must subtract THAT
    // too to land at 110 mm from the page edge. Default canon at
    // measureChars=66 / liveAreaChars=85 yields inner gutter ≈ 12.29
    // mm (cf. paged-css-duplex.test.ts:67+ for the numeric trace).
    // Expected: 110 − 35 − ~12.29 ≈ 62.7 mm.
    const css = pagedCss({ ...A4, marginMode: 'derived' });
    expect(css).toMatch(/\.letterhead-signature \{[\s\S]*?margin-left:\s*62\.\d+mm/);
  });
});

describe('pagedCss — chapterBreak', () => {
  it("emits `h1 { break-before: page }` for 'next-page'", () => {
    const css = pagedCss({ ...A4, chapterBreak: 'next-page' });
    expect(css).toContain('h1 { break-before: page; }');
    expect(css).not.toContain('break-before: right');
  });

  it("emits `h1 { break-before: right }` for 'next-recto'", () => {
    const css = pagedCss({ ...A4, chapterBreak: 'next-recto' });
    expect(css).toContain('h1 { break-before: right; }');
    expect(css).not.toContain('h1 { break-before: page; }');
  });

  it("combines cleanly with duplex (both rules emitted independently)", () => {
    const css = pagedCss({
      ...A4,
      duplex: true,
      chapterBreak: 'next-recto',
    });
    expect(css).toContain('@page :left');
    expect(css).toContain('@page :right');
    expect(css).toContain('h1 { break-before: right; }');
  });
});
