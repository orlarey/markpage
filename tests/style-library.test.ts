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
  it('ships the archetype catalogue (archetype × format), A4 + Letter', () => {
    // Compiled by scripts/build-builtin-styles.mjs from archetypes/*.mpstyle-src.json.
    expect(BUILTIN_STYLES.map((s) => s.key)).toEqual([
      'note-a4',
      'note-letter',
      'lettre-a4',
      'lettre-letter',
      'rapport-a4',
      'rapport-letter',
      'livre-a4',
      'livre-letter',
      'presentation-16x9',
    ]);
  });

  it('carries NO document metadata (author/organization/date/language) in the style', () => {
    for (const s of BUILTIN_STYLES) {
      const rec = s.style as Record<string, unknown>;
      expect('author' in rec).toBe(false);
      expect('organization' in rec).toBe(false);
      expect('date' in rec).toBe(false);
      expect('language' in rec).toBe(false);
    }
  });

  it('carries distribution metadata (provenance) on the NamedStyle', () => {
    for (const s of BUILTIN_STYLES) {
      expect(s.meta?.author).toBe('markpage');
      expect(s.meta?.version).toBeTruthy();
    }
  });

  it('resolves by key and by name, case-insensitively', () => {
    expect(findStyle('livre-a4')?.key).toBe('livre-a4');
    expect(findStyle('LIVRE-A4')?.key).toBe('livre-a4');
    expect(findStyle('Livre A4')?.name).toBe('Livre A4');
    expect(findStyle('note-a4')?.key).toBe('note-a4');
    expect(findStyle('nope')).toBeNull();
  });
});

describe('applyNamedStyle', () => {
  it('applies a known style over the base', () => {
    const r = applyNamedStyle('livre-a4', DEFAULT_SETTINGS);
    expect(r.found).toBe(true);
    expect(r.resolvedName).toBe('Livre A4');
    expect(r.settings.pageSize).toBe('A4');
    expect(r.settings.duplex).toBe(true);
    expect(r.settings.chapterBreak).toBe('next-recto');
    expect(r.settings.fonts.body).toBe('ET Book');
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
    // Switching Rapport (cover) → Lettre (no cover) must not keep the cover:
    // a named style fully defines its fundamental fields.
    const withNavyCover = { ...DEFAULT_SETTINGS, coverBackground: '#162138' };
    const r = applyNamedStyle('lettre-a4', withNavyCover);
    expect(r.found).toBe(true);
    expect(r.settings.coverBackground).toBeUndefined();
    // A style that DOES define a cover still sets it.
    expect(applyNamedStyle('rapport-a4', DEFAULT_SETTINGS).settings.coverBackground)
      .toBeTruthy();
  });

  it('does not touch document metadata (author) when applying a style', () => {
    const base = {
      ...DEFAULT_SETTINGS,
      author: { text: 'Ada', show: true, bold: false },
    };
    const r = applyNamedStyle('lettre-a4', base);
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

  it('round-trips distribution metadata (author / version / date)', () => {
    const entry = {
      key: 'rapport-elegant-a4',
      name: 'Rapport Élégant A4',
      style: { pageSize: 'A4' } as never,
      meta: { author: 'Yann O.', version: '2.1', date: '2026-08-05' },
    };
    const back = parseStyleFile(serializeStyleFile(entry));
    expect(back!.meta).toEqual(entry.meta);
    // the metadata lives at the wrapper top level, as the editor emits it
    const raw = JSON.parse(serializeStyleFile(entry));
    expect(raw.author).toBe('Yann O.');
    expect(raw.version).toBe('2.1');
    expect(raw.date).toBe('2026-08-05');
  });

  it('omits absent metadata (no empty meta object leaks in)', () => {
    const parsed = parseStyleFile(
      JSON.stringify({ name: 'Sobre', style: { pageSize: 'A4' } }),
    );
    expect(parsed!.meta).toBeUndefined();
    expect(JSON.parse(serializeStyleFile(parsed!)).author).toBeUndefined();
  });
});

describe('slugify', () => {
  it('makes url-safe lowercase slugs, stripping accents', () => {
    expect(slugify('Note Technique')).toBe('note-technique');
    expect(slugify('Élégant · Livre')).toBe('elegant-livre');
  });
});
