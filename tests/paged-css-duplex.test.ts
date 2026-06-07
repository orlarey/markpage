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
    expect(css).not.toContain('break-before: page');
    expect(css).not.toContain('break-before: right');
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

  it('moves the page size + page-number rule into the generic @page (kept identical for both faces)', () => {
    const css = pagedCss(duplex);
    expect(css).toMatch(/@page\s*\{\s*size: \d+mm \d+mm;\s*[\s\S]*?\}/);
  });
});

describe('pagedCss — derived margins (marginMode: derived)', () => {
  // §9.6 / §9.6.6 — in derived mode, @page margin tracks the LIVE
  // AREA boundary (so @top-*/@bottom-* span the live area width).
  // The narrower text-block dimensions are recovered via body padding
  // on .pagedjs_page_content. happy-dom has no canvas, so
  // measureAverageCharWidth falls back to the 0.5 em heuristic;
  // body fontSize = 11pt gives charWidth ≈ 1.9404 mm.
  //   liveAreaWidth  = 85 × 1.9404 ≈ 164.93 mm
  //   liveAreaHeight = 164.93 × 297/210 ≈ 233.27 mm
  //   inner_LA = (210 − 164.93) / 3 ≈ 15.02 mm
  //   outer_LA = 2 × 15.02 ≈ 30.05 mm
  //   top_LA   = (297 − 233.27) / 3 ≈ 21.24 mm
  //   bottom_LA = 2 × 21.24 ≈ 42.49 mm
  //   textBlockWidth  = 66 × 1.9404 ≈ 128.07 mm
  //   header band  = top_TB − top_LA = 38.61 − 21.24 ≈ 17.37 mm
  //   footer band  = bottom_TB − bottom_LA ≈ 34.74 mm
  //   inner gutter = inner_TB − inner_LA ≈ 12.29 mm
  //   outer gutter = outer_TB − outer_LA ≈ 24.58 mm
  const derivedSimplex: PdfSettings = { ...A4, marginMode: 'derived' };
  const derivedDuplex: PdfSettings = { ...derivedSimplex, duplex: true };

  it('@page margin tracks the LIVE AREA boundary in simplex', () => {
    const css = pagedCss(derivedSimplex);
    // top outer bottom inner — values for the live area at 85 chars.
    expect(css).toMatch(/margin:\s+21\.\d+mm\s+30\.\d+mm\s+42\.\d+mm\s+15\.\d+mm;/);
    // Manual margins must not leak.
    expect(css).not.toContain(`margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`);
  });

  it('mirrors the live-area margins on @page :right / :left in duplex', () => {
    const css = pagedCss(derivedDuplex);
    expect(css).toMatch(/@page :right \{ margin: 21\.\d+mm 30\.\d+mm 42\.\d+mm 15\.\d+mm; \}/);
    expect(css).toMatch(/@page :left  \{ margin: 21\.\d+mm 15\.\d+mm 42\.\d+mm 30\.\d+mm; \}/);
  });

  it('emits body padding on .pagedjs_page_content to recover the text-block size (simplex)', () => {
    const css = pagedCss(derivedSimplex);
    // header band ≈ 17.37, outer gutter ≈ 24.58, footer band ≈ 34.74, inner gutter ≈ 12.29.
    expect(css).toMatch(/\.pagedjs_page_content \{ padding: 17\.\d+mm 24\.\d+mm 34\.\d+mm 12\.\d+mm; \}/);
  });

  it('emits two body-padding rules in duplex, swapping inner/outer on the verso', () => {
    const css = pagedCss(derivedDuplex);
    expect(css).toMatch(/\.pagedjs_right_page \.pagedjs_page_content \{ padding: 17\.\d+mm 24\.\d+mm 34\.\d+mm 12\.\d+mm; \}/);
    expect(css).toMatch(/\.pagedjs_left_page\s+\.pagedjs_page_content \{ padding: 17\.\d+mm 12\.\d+mm 34\.\d+mm 24\.\d+mm; \}/);
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

describe('pagedCss — chapterBreak', () => {
  it("emits `h1 { break-before: page }` for 'next-page'", () => {
    const css = pagedCss({ ...A4, chapterBreak: 'next-page' });
    expect(css).toContain('h1 { break-before: page; }');
    expect(css).not.toContain('break-before: right');
  });

  it("emits `h1 { break-before: right }` for 'next-recto'", () => {
    const css = pagedCss({ ...A4, chapterBreak: 'next-recto' });
    expect(css).toContain('h1 { break-before: right; }');
    expect(css).not.toContain('break-before: page;');
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
