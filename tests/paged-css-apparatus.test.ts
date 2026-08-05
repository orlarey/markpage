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
    expect(css).toContain(
      '@page :right { @top-left { content: ""; } @top-center { content: string(mp-title); } @top-right { content: counter(page); } }',
    );
    expect(css).toContain(
      '@page :left { @top-left { content: counter(page); } @top-center { content: string(mp-doctitle); } @top-right { content: ""; } }',
    );
    expect(css).toContain('h1:not(.doc-title) { string-set: mp-title content(); }');
    expect(css).toContain('h1.doc-title { string-set: mp-doctitle content(); }');
  });

  it('emits no apparatus rules for a style without one (legacy fence path)', () => {
    expect(pagedCss(DEFAULT_SETTINGS)).not.toContain('string-set: mp-title');
  });
});
