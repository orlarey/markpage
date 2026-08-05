import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, applyFundamentalStyle } from '../src/settings';
import { parseStyleFile, serializeStyleFile } from '../src/style-library';
import { capsCss, filetCss } from '../src/style-emit';

// A representative compiled style — the shape the editor's compileStyle() emits
// (all generative rules already resolved to flat hex / pt / enums). This test
// verifies the OPERATIONAL load path: a compiled style loads into markpage and
// its new flat fields drive the render helpers.
const compiled = {
  fonts: { headings: 'Source Serif 4', body: 'Source Serif 4', code: 'IBM Plex Mono' },
  mathFontSet: 'stix2',
  mathScale: 1,
  pageSize: 'A4',
  duplex: false,
  chapterBreak: 'none',
  notes: { position: 'foot' },
  language: 'fr',
  customFonts: [],
  pageBackground: '#ffffff',
  coverBackground: '#223e61',
  styles: {
    ...DEFAULT_SETTINGS.styles,
    h1: {
      color: '#30588a',
      fontSize: 27,
      weight: 600,
      rule: { position: 'below', color: '#30588a', width: 1 },
      smallCaps: 'small',
      letterSpacing: 0.04,
    },
    callout: {
      background: '#eef4ff',
      padding: 0.7,
      borderRadius: 8,
      borderTop: true,
      borderRight: true,
      borderBottom: true,
      borderLeft: true,
      borderColor: '#4a8cf0',
      borderWidth: 1,
    },
  },
  numbering: { on: true, depth: 2, chapterFormat: 'numeric', chapterNumeralPt: 65.5 },
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
};

describe('compiled style → markpage (operational load path)', () => {
  const s = applyFundamentalStyle(DEFAULT_SETTINGS, compiled);

  it('carries every new flat field into the settings', () => {
    expect(s.numbering).toEqual({
      on: true,
      depth: 2,
      chapterFormat: 'numeric',
      chapterNumeralPt: 65.5,
    });
    expect(s.runningApparatus?.header.recto.center).toEqual(['chapter']);
    expect(s.styles.h1.rule).toEqual({ position: 'below', color: '#30588a', width: 1 });
    expect(s.styles.h1.smallCaps).toBe('small');
    expect(s.styles.callout.background).toBe('#eef4ff');
    expect(s.coverBackground).toBe('#223e61');
  });

  it('the loaded h1 style renders its filet + small-caps', () => {
    expect(filetCss(s.styles.h1)).toBe(
      'border-bottom: 1px solid #30588a; padding-bottom: 0.2em;',
    );
    expect(capsCss(s.styles.h1)).toContain('font-variant: small-caps;');
    expect(capsCss(s.styles.h1)).toContain('letter-spacing: 0.04em;');
  });

  it('fills missing / partial elements from the defaults (robust load)', () => {
    // A style that specifies only h1.rule and nothing else must still load
    // without dropping the other elements the render indexes unguarded.
    const partial = { ...compiled, styles: { h1: { rule: { position: 'below' } } } };
    const loaded = applyFundamentalStyle(DEFAULT_SETTINGS, partial);
    // an element absent from the style falls back to a full default
    expect(loaded.styles['running-content'].fontSize).toBe(
      DEFAULT_SETTINGS.styles['running-content'].fontSize,
    );
    // a partial element keeps default attrs + the provided one
    expect(loaded.styles.h1.fontSize).toBe(DEFAULT_SETTINGS.styles.h1.fontSize);
    expect(loaded.styles.h1.rule?.position).toBe('below');
  });

  it('round-trips through the export file (serialize → parseStyleFile → apply)', () => {
    // The exact file the editor's exportStyle() downloads.
    const fileJson = serializeStyleFile({
      key: 'editor-style',
      name: 'Style éditeur',
      style: compiled,
    });
    const parsed = parseStyleFile(fileJson);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Style éditeur');
    const loaded = applyFundamentalStyle(DEFAULT_SETTINGS, parsed!.style);
    expect(loaded.numbering?.depth).toBe(2);
    expect(loaded.styles.h1.rule?.position).toBe('below');
    expect(loaded.runningApparatus?.header.recto.center).toEqual(['chapter']);
  });
});
