import { describe, expect, it } from 'vitest';

import { pagedCss } from '../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';

const withApparatus = (): PdfSettings => ({
  ...DEFAULT_SETTINGS,
  runningApparatus: {
    header: {
      verso: { inner: [], center: ['doctitle'], outer: ['folio'] },
      recto: { inner: [], center: ['chapter'], outer: ['folio'] },
    },
    footer: {
      verso: { inner: [], center: [], outer: [] },
      recto: { inner: [], center: [], outer: [] },
    },
  },
});

describe('pagedCss — running-apparatus emission (step 6 wiring)', () => {
  it('emits the apparatus @page rules when the style carries one', () => {
    const css = pagedCss(withApparatus());
    // content per box (recto: chapter title centre, folio outer)
    expect(css).toContain('@top-center { content: string(mp-title);');
    expect(css).toContain('@top-right { content: counter(page);');
    // verso mirrors (folio inner, doctitle centre)
    expect(css).toContain('@top-left { content: counter(page);');
    expect(css).toContain('@top-center { content: string(mp-doctitle);');
    expect(css).toContain('h1:not(.doc-title) { string-set: mp-title content(); }');
    expect(css).toContain('h1.doc-title { string-set: mp-doctitle content(); }');
  });

  it('styles the apparatus boxes with the running-content decls (Vivliostyle path)', () => {
    // Vivliostyle styles @page-generated running content via the margin-box rules,
    // NOT the host `.pagedjs_margin-*` classes — so the running-content size/colour
    // must live INSIDE each @top-*/@bottom-* box.
    const s = withApparatus();
    const rc = s.styles['running-content'];
    const css = pagedCss(s);
    expect(css).toContain(
      `@top-center { content: string(mp-title); font-size: ${rc.fontSize}pt; color: ${rc.color};`,
    );
  });

  it('emits no apparatus rules for a style without one (legacy fence path)', () => {
    expect(pagedCss(DEFAULT_SETTINGS)).not.toContain('string-set: mp-title');
  });
});
