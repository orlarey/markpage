import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  FUNDAMENTAL_STYLE_KEYS,
  serializeFundamentalStyle,
  applyFundamentalStyle,
  type PdfSettings,
} from '../src/settings';
import { bakePageGeometry } from '../src/geometry-producer';

const clone = (s: PdfSettings): PdfSettings => JSON.parse(JSON.stringify(s));

// A style that touches every corner: fonts, per-element, resolved geometry,
// notes, running content, math, surfaces, language, metadata, figure caps,
// custom fonts. Geometry is fundamental as the RESOLVED pageGeometry — the canon
// inputs (authoring) are deliberately NOT part of the fundamental style.
const distinctive = (): PdfSettings => {
  const s = clone(DEFAULT_SETTINGS);
  s.pageSize = 'B5';
  s.authoring = {
    marginMode: 'derived',
    margins: { top: 18, right: 22, bottom: 30, left: 14 },
    measureChars: 60,
    liveAreaChars: 80,
  };
  s.pageGeometry = bakePageGeometry(s, { w: 176, h: 250 });
  s.duplex = true;
  s.chapterBreak = 'next-recto';
  s.notes = { position: 'side' };
  s.header = ' | *{title}* | ';
  s.footer = ' | | {page}';
  s.fonts = { headings: 'EB Garamond', body: 'EB Garamond', code: 'IBM Plex Mono' };
  s.styles.body = { ...s.styles.body, fontSize: 10.5, color: '#1a1a1a', lineHeight: 1.4 };
  s.styles.h1 = { ...s.styles.h1, color: '#8a2b2b', italic: true };
  s.mathScale = 0.92;
  s.mathFontSet = 'stix2';
  s.pageBackground = '#fffdf7';
  s.coverBackground = '#2b3a55';
  s.language = 'en';
  s.author = { text: 'Ada Lovelace', show: true, bold: false };
  s.organization = { text: 'Analytical Engine Co.', show: true, bold: true };
  s.date = { mode: 'custom', custom: '1843' };
  s.customFonts = [{ name: 'Alegreya', url: 'https://fonts.googleapis.com/css2?family=Alegreya' }];
  return s;
};

describe('fundamental style export/import', () => {
  it('is COMPLETE — every fundamental PdfSettings field is a fundamental key', () => {
    // Guards against a new settings field being forgotten in the export.
    // `authoring` is the geometry PRODUCTION object — excluded from the style
    // (its resolved result is carried by `pageGeometry`). author/organization/
    // date are DOCUMENT metadata — they live in the doc front-matter, not the
    // style (document-style model).
    const NON_FUNDAMENTAL = new Set([
      'authoring',
      'author',
      'organization',
      'date',
    ]);
    const missing = Object.keys(DEFAULT_SETTINGS).filter(
      (k) =>
        !NON_FUNDAMENTAL.has(k) &&
        !(FUNDAMENTAL_STYLE_KEYS as readonly string[]).includes(k),
    );
    expect(missing).toEqual([]);
  });

  it('round-trips through a JSON block with zero loss', () => {
    const A = distinctive();

    // EXPORT → the YAML-block payload (JSON) → IMPORT onto a fresh base
    const json = JSON.stringify(serializeFundamentalStyle(A));
    const B = applyFundamentalStyle(clone(DEFAULT_SETTINGS), JSON.parse(json));

    // every fundamental field is reproduced exactly
    for (const k of FUNDAMENTAL_STYLE_KEYS) {
      expect((B as Record<string, unknown>)[k]).toEqual((A as Record<string, unknown>)[k]);
    }
    // and a second export is byte-identical (fixpoint)
    expect(JSON.stringify(serializeFundamentalStyle(B))).toBe(
      JSON.stringify(serializeFundamentalStyle(A)),
    );
  });

  it('leaves optional surfaces absent when unset (no undefined noise)', () => {
    const A = clone(DEFAULT_SETTINGS); // no page/cover background
    const snap = serializeFundamentalStyle(A);
    expect('pageBackground' in snap).toBe(false);
    expect('coverBackground' in snap).toBe(false);
  });
});
