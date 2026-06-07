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
