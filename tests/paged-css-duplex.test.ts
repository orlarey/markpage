import { describe, expect, it } from 'vitest';

import {
  markConsecutiveParagraphs,
  pagedCss,
} from '../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';
import { BANDED_DUPLEX, BANDED_SIMPLEX, withGeometry } from './fixtures/geometry';

/**
 * Purpose: Lock in the CSS shape emitted by `pagedCss` for the §9.5
 *   duplex and chapterBreak features. The tests assert string
 *   fragments rather than full snapshots so the rest of the
 *   stylesheet can evolve without forcing a rewrite here.
 */

const A4 = DEFAULT_SETTINGS; // plain A4 geometry, duplex: false, chapterBreak: 'none'
// The default geometry's four margins (text block = band anchors, no gutter).
const m = { top: 25, right: 35, bottom: 25, left: 35 };

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

  it('indents continuation paragraphs in CSS', () => {
    const css = pagedCss(A4);
    // This assertion used to be inverted: the paginated stylesheet was required
    // NOT to carry a CSS first-line indent, because paged.js folded split
    // fragments back onto page 1 when text-indent entered its geometry. The
    // indent was delegated to inline spacer nodes injected after pagination.
    // That mitigation went out with paged.js — and took the indent with it,
    // leaving firstLineIndent doing nothing at all in the paginated view and
    // the PDF. Vivliostyle fragments a text-indent paragraph correctly, so the
    // rule belongs in the stylesheet again, as it always has in the continuous
    // preview.
    // Body paragraphs only (Mermaid's HTML labels are <p>s inside an SVG).
    expect(css).toContain('p:not(svg p) + p');
    expect(css).toContain('p.mp-paragraph-continuation');
    expect(css).toMatch(/text-indent: [\d.]+em/);
  });
});

describe('markConsecutiveParagraphs', () => {
  it('marks only paragraphs that directly follow another paragraph', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<h1>Title</h1><p>First</p><p>Second</p>' +
      '<blockquote><p>Quote one</p><p>Quote two</p></blockquote>' +
      '<h2>Next</h2><p>First after heading</p>';

    markConsecutiveParagraphs(root);

    const paragraphs = [...root.querySelectorAll('p')];
    expect(
      paragraphs.map((paragraph) =>
        paragraph.classList.contains('mp-paragraph-continuation'),
      ),
    ).toEqual([false, true, false, true, false]);
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

describe('pagedCss — banded geometry (header/footer bands + gutters)', () => {
  // Vertical @page margins come from the TEXT BLOCK, horizontal ones from the
  // band anchors (`running`), which puts the @top-* / @bottom-* boxes in the
  // header / footer bands. The text-block width is recovered by horizontal-only
  // body padding (the gutters) on .pagedjs_page_content.
  const bandedSimplex: PdfSettings = withGeometry(BANDED_SIMPLEX);
  const bandedDuplex: PdfSettings = withGeometry(BANDED_DUPLEX, { duplex: true });

  it('takes vertical margins from the text block, horizontal from the anchors (simplex)', () => {
    const css = pagedCss(bandedSimplex);
    expect(css).toContain('margin: 40mm 24mm 76mm 24mm;');
    expect(css).not.toContain(`margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`);
  });

  it('folds the gutter into the mirrored @page margins in duplex (notes ≠ side)', () => {
    // The gutter carries no content without margin notes, and the single
    // Vivliostyle flow body can't mirror per parity — so the gutter is folded into
    // the @page margin (text-block inner/outer, mirrored) and NO body padding is
    // emitted. This is what makes the verso text block mirror correctly.
    const css = pagedCss(bandedDuplex);
    expect(css).toContain('@page :right { margin: 40mm 56mm 76mm 28mm; }');
    expect(css).toContain('@page :left  { margin: 40mm 28mm 76mm 56mm; }');
  });

  it('centres the cover on the page (@page :first symmetric) when a cover exists', () => {
    const s: PdfSettings = { ...bandedDuplex, coverBackground: '#223e61' };
    const css = pagedCss(s);
    // symmetric horizontal margins on the first page = the two mirrored margins averaged
    expect(css).toContain('@page :first { margin-left: 42mm; margin-right: 42mm; }');
    // no such rule without a cover
    expect(pagedCss(bandedDuplex)).not.toContain('@page :first');
  });

  it('keeps the subtitle + metadata ON the cover — only the first content breaks', () => {
    // Regression: a naive `h1.doc-title + *` cover-break rule catches the
    // subtitle and pushes it (and then the metadata-following content) onto
    // their own pages — two blank pages + a subtitle stranded off the cover.
    // The rule must break only the FIRST block after the whole identity stack
    // (title → optional subtitle → optional metadata).
    const s: PdfSettings = { ...bandedDuplex, coverBackground: '#223e61' };
    const css = pagedCss(s);
    // subtitle after title must NOT be a break target
    expect(css).toContain(':not(.doc-subtitle)');
    // the only content-break selectors are the three identity-block exits
    expect(css).toContain(
      '.preview-metadata + *, .doc-subtitle + *:not(.preview-metadata), ' +
        'h1.doc-title + *:not(.preview-metadata):not(.doc-subtitle) { break-before: right; }',
    );
  });

  it('re-inks the title filet on the cover, not just the text', () => {
    // Regression: the filet is a border-bottom carrying the title's own (dark)
    // colour. Recolouring only the text leaves the rule dark on the fill.
    const s: PdfSettings = { ...bandedDuplex, coverBackground: '#223e61' };
    const css = pagedCss(s);
    expect(css).toMatch(
      /h1\.doc-title,[^{]*\.doc-subtitle \{ border-bottom-color: #[0-9a-f]{6}; \}/,
    );
  });

  it('does NOT fold when notes are in the margin (side) — the gutter stays', () => {
    const sideDuplex: PdfSettings = { ...bandedDuplex, notes: { position: 'side' } };
    const css = pagedCss(sideDuplex);
    // anchor @page margins + per-parity body padding (the gutter feeds the
    // sidenote column, so it must remain a real inset).
    expect(css).toContain('@page :right { margin: 40mm 32mm 76mm 16mm; }');
    expect(css).toMatch(/\.pagedjs_left_page\s+\.pagedjs_page_content \{ padding: 0 12mm 0 24mm; \}/);
  });

  it('emits horizontal-only body padding on .pagedjs_page_content (simplex)', () => {
    const css = pagedCss(bandedSimplex);
    // Equal left/right gutters recover the centred text-block width.
    expect(css).toContain('.pagedjs_page_content { padding: 0 18mm 0 18mm; }');
  });

  it('emits NO body-padding rules in duplex (the gutter is folded into @page)', () => {
    const css = pagedCss(bandedDuplex);
    expect(css).not.toContain('.pagedjs_page_content { padding:');
    expect(css).not.toContain('#mp-viv-root {');
  });

  it('emits CSS variables --mp-live-* and --mp-gutter-* for the debug overlay', () => {
    const css = pagedCss(bandedSimplex);
    expect(css).toMatch(/--mp-live-top:\s+22mm/);
    expect(css).toMatch(/--mp-live-bottom:\s+44mm/);
    expect(css).toMatch(/--mp-live-inner:\s+24mm/);
    expect(css).toMatch(/--mp-live-outer:\s+24mm/);
    expect(css).toMatch(/--mp-gutter-inner:\s+18mm/);
    expect(css).toMatch(/--mp-gutter-outer:\s+18mm/);
  });

  it('places header / footer on the geometry lines via align-items + padding', () => {
    const css = pagedCss(bandedSimplex);
    expect(css).toMatch(
      /\.pagedjs_margin-top-center[\s\S]*?align-items:\s+flex-start;\s*padding-top:\s+22mm/,
    );
    expect(css).toMatch(
      /\.pagedjs_margin-bottom-center[\s\S]*?align-items:\s+flex-end;\s*padding-bottom:\s+44mm/,
    );
  });

  it('a geometry without bands keeps the plain margins and no body padding', () => {
    const css = pagedCss(A4);
    expect(css).toContain(
      `margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`,
    );
    // No body-padding rule (the string `.pagedjs_page_content` may appear in
    // unrelated rules — assert the absence of the padding RULE shape).
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
  it('plain geometry: signature margin-left = 110 mm − page left margin (matches FR DL window recipient)', () => {
    // Default A4 has margins.left = 35 mm → signature should be at
    // 110 − 35 = 75 mm from the .pagedjs_page_content content edge,
    // which equals 110 mm from the page edge — i.e. the same x as
    // the .letterhead-recipient.letterhead-window absolute left.
    const css = pagedCss(A4);
    expect(css).toMatch(/\.letterhead-signature \{[\s\S]*?margin-left:\s*75mm/);
  });

  it('with a gutter: signature margin-left subtracts the inner gutter too (in-flow under page-content padding)', () => {
    // .pagedjs_page_content carries a padding-left equal to the inner gutter
    // (text.inner − running.inner = 18 mm). The signature, in flow inside the
    // wrapper, must subtract that gutter plus the anchor margin (24 mm) to land
    // at 110 mm from the physical page edge: 110 − 24 − 18 = 68 mm.
    const css = pagedCss(withGeometry(BANDED_SIMPLEX));
    expect(css).toMatch(/\.letterhead-signature \{[\s\S]*?margin-left:\s*68mm/);
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
