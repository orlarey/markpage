import { describe, expect, it } from 'vitest';

import { pagedCss } from '../src/preview-paginated';
import { DEFAULT_SETTINGS } from '../src/settings';
import { BANDED_DUPLEX, BANDED_SIMPLEX, withGeometry } from './fixtures/geometry';

/**
 * Purpose: Lock in the §9.7 sidenote CSS branching emitted by
 *   `pagedCss(s)` for each `notes.position`. The corresponding HTML
 *   side (footnoteRef renderer emitting `<span class="sidenote">`) is
 *   covered by the corpus snapshot tests (08-footnotes-deflist).
 */

const A4 = DEFAULT_SETTINGS;

describe('pagedCss — sidenote rendering branch on notes.position', () => {
  it("default 'foot': floats the sidenote (paged.js per-page footnote area), hides body sup and tail section", () => {
    const css = pagedCss({ ...A4, notes: { position: 'foot' } });
    // paged.js's `float: footnote` moves the .sidenote to the per-page
    // .pagedjs_footnote_area; the inline span carries the body.
    expect(css).toMatch(/\.sidenote \{ float: footnote;/);
    // Manual sup is hidden — paged.js auto-generates a footnote-call.
    expect(css).toMatch(/\.footnote-ref \{ display: none/);
    // In-sidenote number prefix is hidden — paged.js auto-generates a
    // footnote-marker at the start of the floated element.
    expect(css).toMatch(/\.sidenote \.sidenote-num \{ display: none/);
    // Document-tail section is hidden (paged.js is authoritative).
    expect(css).toMatch(/section\.footnotes \{ display: none/);
  });

  it("'end' keeps the inline sidenote hidden and lets section.footnotes render at the document tail", () => {
    const css = pagedCss({ ...A4, notes: { position: 'end' } });
    expect(css).toContain('.sidenote { display: none;');
    // section.footnotes is the visible carrier in 'end' mode.
    expect(css).not.toMatch(/section\.footnotes \{ display: none/);
    // No float: footnote in 'end' mode.
    expect(css).not.toMatch(/\.sidenote \{ float: footnote/);
    // Body sup stays visible as a back-link anchor.
    expect(css).not.toMatch(/\.footnote-ref \{ display: none/);
  });

  it("'side' with an outer gutter emits absolute positioning, keeps the body sup visible, adds the in-sidenote number prefix", () => {
    const css = pagedCss({
      ...withGeometry(BANDED_SIMPLEX),
      notes: { position: 'side' },
    });
    // The body sup STAYS visible in side mode (Tufte: number appears
    // both as the in-body anchor AND at the start of the sidenote).
    expect(css).not.toMatch(/\.footnote-ref \{ display: none/);
    // Document-tail section is hidden — sidenote is the carrier.
    expect(css).toMatch(/section\.footnotes \{ display: none/);
    // Sidenotes AND margin figures share the outer-gutter positioning
    // via an :is(.sidenote, img.margin) group selector (§9.7.5).
    expect(css).toMatch(/:is\(\.sidenote, img\.margin\) \{[\s\S]*position: absolute;/);
    expect(css).toMatch(/:is\(\.sidenote, img\.margin\) \{[\s\S]*right: -\d+(\.\d+)?mm;/);
    // Numeric prefix inside the sidenote is styled as a small sup.
    expect(css).toMatch(/\.sidenote \.sidenote-num \{[\s\S]*vertical-align: super/);
    // Paragraphs (and friends) need position: relative as containing block.
    expect(css).toMatch(
      /:where\(p, li, blockquote, \.pagedjs_page_content\) \{ position: relative; \}/,
    );
  });

  it("'side' in duplex emits an additional left override for the verso", () => {
    const css = pagedCss({
      ...withGeometry(BANDED_DUPLEX),
      duplex: true,
      notes: { position: 'side' },
    });
    // Verso flip targets the same :is() group on verso pages.
    expect(css).toMatch(
      /\.pagedjs_left_page :is\(\.sidenote, img\.margin\) \{[\s\S]*left: -\d+(\.\d+)?mm;[\s\S]*right: auto;/,
    );
  });

  it("'side' caps img.margin width to the sidenote area (no overflow)", () => {
    const css = pagedCss({
      ...withGeometry(BANDED_SIMPLEX),
      notes: { position: 'side' },
    });
    expect(css).toMatch(/img\.margin \{[\s\S]*max-width: \d+\.?\d*mm;[\s\S]*height: auto;/);
  });

  it("'side' without an outer gutter degrades to hide-sidenote (no column to anchor it)", () => {
    // The default geometry has no gutter (band anchors = text block): the
    // sidenote can't be positioned safely. We hide it; the visible path is
    // whatever section.footnotes already provides.
    const css = pagedCss({ ...A4, notes: { position: 'side' } });
    expect(css).toContain('.sidenote { display: none;');
    // The .sidenote rule itself must NOT carry the absolute layout
    // CSS — match against the block scope only (no greedy `*`).
    expect(css).not.toMatch(/\.sidenote \{[^}]*position: absolute/);
  });
});

describe('pagedCss — sidenote column from the geometry', () => {
  it('takes its width from the geometry and sits across the outer gutter', () => {
    const css = pagedCss({
      ...withGeometry(BANDED_DUPLEX),
      duplex: true,
      notes: { position: 'side' },
    });
    // width = sidenote.width; offset = the outer gutter (56 − 32 = 24 mm).
    expect(css).toMatch(/width: 21mm/);
    expect(css).toMatch(/right: -24mm/);
  });
});
