import { describe, it, expect } from 'vitest';

import {
  BUILTIN_STYLES,
  applyNamedStyle,
  findStyle,
  parseStyleFile,
  serializeStyleFile,
  slugify,
} from '../src/style-library';
import { DEFAULT_SETTINGS } from '../src/settings';

/**
 * Purpose: Lock the named-style LIBRARY contract (document-style model): 5
 *   polished built-ins, name/key resolution, unknown → fallback, and a loss-free
 *   style-file round-trip for import/export.
 */

describe('style library — built-ins', () => {
  it('ships 5 named styles with the expected keys', () => {
    expect(BUILTIN_STYLES).toHaveLength(5);
    expect(BUILTIN_STYLES.map((s) => s.key)).toEqual([
      'note-technique',
      'rapport',
      'article',
      'livre',
      'lettre',
    ]);
  });

  it('carries NO document metadata (author/organization/date) in the style', () => {
    for (const s of BUILTIN_STYLES) {
      const rec = s.style as Record<string, unknown>;
      expect('author' in rec).toBe(false);
      expect('organization' in rec).toBe(false);
      expect('date' in rec).toBe(false);
    }
  });

  it('resolves by key and by name, case-insensitively', () => {
    expect(findStyle('livre')?.key).toBe('livre');
    expect(findStyle('LIVRE')?.key).toBe('livre');
    expect(findStyle('Livre')?.name).toBe('Livre');
    expect(findStyle('Note technique')?.key).toBe('note-technique');
    expect(findStyle('nope')).toBeNull();
  });
});

describe('applyNamedStyle', () => {
  it('applies a known style over the base', () => {
    const r = applyNamedStyle('livre', DEFAULT_SETTINGS);
    expect(r.found).toBe(true);
    expect(r.resolvedName).toBe('Livre');
    expect(r.settings.pageSize).toBe('B5');
    expect(r.settings.duplex).toBe(true);
    expect(r.settings.fonts.body).toBe('EB Garamond');
  });

  it('leaves the base unchanged for unknown / empty names', () => {
    expect(applyNamedStyle('does-not-exist', DEFAULT_SETTINGS)).toEqual({
      settings: DEFAULT_SETTINGS,
      found: false,
    });
    expect(applyNamedStyle(undefined, DEFAULT_SETTINGS).found).toBe(false);
    expect(applyNamedStyle('   ', DEFAULT_SETTINGS).found).toBe(false);
  });

  it('clears an inherited coverBackground when the new style has no cover', () => {
    // Switching Rapport (navy cover) → Article (no cover) must not keep the navy
    // cover: a named style fully defines its fundamental fields.
    const withNavyCover = { ...DEFAULT_SETTINGS, coverBackground: '#162138' };
    const r = applyNamedStyle('article', withNavyCover);
    expect(r.found).toBe(true);
    expect(r.settings.coverBackground).toBeUndefined();
    // A style that DOES define a cover still sets it.
    expect(applyNamedStyle('rapport', DEFAULT_SETTINGS).settings.coverBackground)
      .toBeTruthy();
  });

  it('does not touch document metadata (author) when applying a style', () => {
    const base = {
      ...DEFAULT_SETTINGS,
      author: { text: 'Ada', show: true, bold: false },
    };
    const r = applyNamedStyle('article', base);
    expect(r.settings.author).toEqual(base.author);
  });
});

describe('style file round-trip', () => {
  it('serializes and parses a named style with zero loss', () => {
    const entry = BUILTIN_STYLES[2]!; // article
    const file = serializeStyleFile(entry);
    const back = parseStyleFile(file);
    expect(back).not.toBeNull();
    expect(back!.name).toBe(entry.name);
    expect(back!.key).toBe(entry.key);
    expect(back!.style).toEqual(entry.style);
  });

  it('derives a key from the name when the file omits one', () => {
    const parsed = parseStyleFile(
      JSON.stringify({ name: 'Édition Critique', style: { pageSize: 'A4' } }),
    );
    expect(parsed?.key).toBe('edition-critique');
  });

  it('rejects non-style files', () => {
    expect(parseStyleFile('{"hello":1}')).toBeNull();
    expect(parseStyleFile('not json')).toBeNull();
  });
});

describe('slugify', () => {
  it('makes url-safe lowercase slugs, stripping accents', () => {
    expect(slugify('Note Technique')).toBe('note-technique');
    expect(slugify('Élégant · Livre')).toBe('elegant-livre');
  });
});
