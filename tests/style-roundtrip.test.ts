import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  ELEMENT_KEYS,
  applyFundamentalStyle,
  serializeFundamentalStyle,
} from '../src/settings';
import {
  BUILTIN_STYLES,
  parseStyleFile,
  serializeStyleFile,
} from '../src/style-library';

/**
 * The compiled style file is the PIVOT: we want a bijection between the file and
 * the internal style markpage renders from. This suite locks the round-trip
 * contract (docs/STYLE-ALIGNMENT.md — "Le round-trip").
 *
 *   CANONICAL form = the `style` object carries a COMPLETE styles matrix (all 19
 *   ELEMENT_KEYS), every value terminal. Optional top-level keys may be absent;
 *   their absence round-trips exactly (serialize emits present keys only, apply
 *   sets present / clears absent).
 *
 *   RT-markpage: a canonical style is a FIXED POINT of apply∘serialize (import
 *   then re-export → identical). A partial style is NORMALISED to canonical on
 *   the first import (the matrix is completed) and is a fixed point thereafter.
 */

// A realistic canonical style: run a built-in through one import → its matrix is
// completed to all 19 elements, values terminal. This is exactly the shape the
// style editor's compileStyle() now emits.
const canonical = serializeFundamentalStyle(
  applyFundamentalStyle(
    DEFAULT_SETTINGS,
    BUILTIN_STYLES.find((s) => s.key === 'rapport-a4')!.style,
  ),
);

describe('round-trip — the bijection contract', () => {
  it('a canonical style carries the complete 19-element matrix', () => {
    const els = Object.keys((canonical.styles ?? {}) as object);
    expect(els.sort()).toEqual([...ELEMENT_KEYS].sort());
  });

  it('is a fixed point of apply∘serialize — semantically AND byte-for-byte', () => {
    const round = serializeFundamentalStyle(
      applyFundamentalStyle(DEFAULT_SETTINGS, canonical),
    );
    expect(round).toEqual(canonical); // semantic identity
    // byte identity: serialize emits keys in FUNDAMENTAL order, the matrix in
    // DEFAULT_SETTINGS.styles order — a canonical file already matches both.
    expect(JSON.stringify(round)).toBe(JSON.stringify(canonical));
  });

  it('presence/absence of every optional key round-trips exactly', () => {
    // rapport omits e.g. numbering / runningApparatus — they must STAY absent,
    // never re-appear defaulted; keys it carries must STAY present.
    const round = serializeFundamentalStyle(
      applyFundamentalStyle(DEFAULT_SETTINGS, canonical),
    );
    for (const k of [
      'pageGeometry',
      'chapter',
      'numbering',
      'runningApparatus',
      'pageBackground',
      'coverBackground',
      'notes',
      'header',
      'footer',
    ]) {
      expect(k in round).toBe(k in canonical);
    }
  });

  it('normalises a partial style to canonical on first import, then is stable', () => {
    const partial = {
      pageSize: 'A4',
      styles: { h1: { color: '#333333', fontSize: 20 } },
    };
    const p1 = serializeFundamentalStyle(
      applyFundamentalStyle(DEFAULT_SETTINGS, partial),
    );
    const p2 = serializeFundamentalStyle(
      applyFundamentalStyle(DEFAULT_SETTINGS, p1),
    );
    // first import COMPLETES the matrix (19 elements) — not identity yet
    expect(Object.keys((p1.styles ?? {}) as object)).toHaveLength(19);
    expect(p1).not.toEqual(partial);
    // the provided element is taken verbatim (no default-attr leak)
    expect((p1.styles as Record<string, unknown>).h1).toEqual({
      color: '#333333',
      fontSize: 20,
    });
    // canonical thereafter → fixed point
    expect(p2).toEqual(p1);
    expect(JSON.stringify(p2)).toBe(JSON.stringify(p1));
  });
});

describe('round-trip — page geometry', () => {
  it('a style carrying pageGeometry imports it verbatim (fixed point)', () => {
    const withGeo = serializeFundamentalStyle(DEFAULT_SETTINGS);
    expect('pageGeometry' in withGeo).toBe(true);
    const round = serializeFundamentalStyle(applyFundamentalStyle(DEFAULT_SETTINGS, withGeo));
    expect(JSON.stringify(round)).toBe(JSON.stringify(withGeo));
  });

  it('a style OMITTING pageGeometry keeps the base geometry (never none)', () => {
    // markpage computes no geometry: an incomplete style falls back to the
    // base's resolved geometry rather than leaving the render without one.
    const noGeo = serializeFundamentalStyle(DEFAULT_SETTINGS);
    delete noGeo.pageGeometry;
    const applied = applyFundamentalStyle(DEFAULT_SETTINGS, noGeo);
    expect(applied.pageGeometry).toEqual(DEFAULT_SETTINGS.pageGeometry);
  });
});

describe('round-trip — the style FILE (wrapper + identity)', () => {
  it('a canonical style file is a byte-for-byte fixed point through parse∘serialize', () => {
    const entry = {
      key: 'rapport-elegant-a4',
      name: 'Rapport Élégant A4',
      style: canonical,
      meta: { author: 'Yann O.', version: '2.1', date: '2026-08-05' },
    };
    const file = serializeStyleFile(entry);
    const refile = serializeStyleFile(parseStyleFile(file)!);
    expect(refile).toBe(file);
  });
});
