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
  // happy-dom has no canvas, so measureAverageCharWidth falls back to
  // the 0.5 em heuristic. With body fontSize=11pt this gives:
  //   charWidth = 0.5 × 11 × 0.3528 ≈ 1.9404 mm
  //   textWidth = 66 × 1.9404 ≈ 128.07 mm
  //   textHeight = 128.07 × 297/210 ≈ 181.16 mm
  //   inner = (210 − 128.07) / 3 ≈ 27.31
  //   outer = (210 − 128.07) × 2/3 ≈ 54.62
  //   top   = (297 − 181.16) / 3 ≈ 38.61
  //   bottom = (297 − 181.16) × 2/3 ≈ 77.23
  const derivedSimplex: PdfSettings = { ...A4, marginMode: 'derived' };
  const derivedDuplex: PdfSettings = { ...derivedSimplex, duplex: true };

  it('replaces the user margins with canonical values in simplex', () => {
    const css = pagedCss(derivedSimplex);
    // Single @page rule whose margin is `top outer bottom inner` ≈ 38.6 54.6 77.2 27.3.
    expect(css).toMatch(/margin:\s+38\.6\d+mm\s+54\.6\d+mm\s+77\.2\d+mm\s+27\.3\d+mm;/);
    // Manual margins MUST NOT leak through.
    expect(css).not.toContain(`${m.left}mm ${m.right}mm`);
  });

  it('uses canonical values for both @page :right and :left in duplex', () => {
    const css = pagedCss(derivedDuplex);
    // Recto: top outer bottom inner.
    expect(css).toMatch(/@page :right \{ margin: 38\.\d+mm 54\.\d+mm 77\.\d+mm 27\.\d+mm; \}/);
    // Verso: mirror.
    expect(css).toMatch(/@page :left  \{ margin: 38\.\d+mm 27\.\d+mm 77\.\d+mm 54\.\d+mm; \}/);
  });

  it('falls back to the manual margins when marginMode === "manual" (unchanged)', () => {
    const css = pagedCss({ ...A4, marginMode: 'manual' });
    expect(css).toContain(
      `margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`,
    );
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
