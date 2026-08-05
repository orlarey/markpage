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
import { withBakedGeometry } from '../src/geometry-producer';

const A4 = { w: 210, h: 297 };

/**
 * The compiled style file is the PIVOT: we want a bijection between the file and
 * the internal style markpage renders from. This suite locks the round-trip
 * contract (docs/STYLE-ALIGNMENT.md — "Le round-trip").
 *
 *   CANONICAL form = the `style` object carries a COMPLETE styles matrix (all 18
 *   ELEMENT_KEYS), every value terminal. Optional top-level keys may be absent;
 *   their absence round-trips exactly (serialize emits present keys only, apply
 *   sets present / clears absent).
 *
 *   RT-markpage: a canonical style is a FIXED POINT of apply∘serialize (import
 *   then re-export → identical). A partial style is NORMALISED to canonical on
 *   the first import (the matrix is completed) and is a fixed point thereafter.
 */

// A realistic canonical style: run a built-in through one import → its matrix is
// completed to all 18 elements, values terminal. This is exactly the shape the
// style editor's compileStyle() now emits.
const canonical = serializeFundamentalStyle(
  applyFundamentalStyle(
    DEFAULT_SETTINGS,
    BUILTIN_STYLES.find((s) => s.key === 'rapport-a4')!.style,
  ),
);

describe('round-trip — the bijection contract', () => {
  it('a canonical style carries the complete 18-element matrix', () => {
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
    // first import COMPLETES the matrix (18 elements) — not identity yet
    expect(Object.keys((p1.styles ?? {}) as object)).toHaveLength(18);
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

describe('round-trip — the REAL app path bakes geometry', () => {
  // The app exports a POST-bake snapshot (serializeFundamentalStyle of
  // lastEffectiveSettings, which ran through withBakedGeometry). So the fixed
  // point must survive the bake step, not just apply∘serialize.

  it('a style CARRYING pageGeometry is a true fixed point through the bake', () => {
    // exactly what the editor's compileStyle now emits: a resolved pageGeometry.
    const withGeo = serializeFundamentalStyle(
      withBakedGeometry(DEFAULT_SETTINGS, A4),
    );
    expect('pageGeometry' in withGeo).toBe(true);
    // import → the style carries pageGeometry, so applyFundamentalStyle drops
    // `authoring` → withBakedGeometry is a no-op → export is identical.
    const applied = applyFundamentalStyle(DEFAULT_SETTINGS, withGeo);
    const round = serializeFundamentalStyle(withBakedGeometry(applied, A4));
    expect(round).toEqual(withGeo);
    expect(JSON.stringify(round)).toBe(JSON.stringify(withGeo));
  });

  it('a style OMITTING pageGeometry is NOT a fixed point — the bake adds one', () => {
    // documents WHY the editor must emit pageGeometry (Explore finding): a
    // geometry-less file retains the base `authoring`, so the render bakes a
    // pageGeometry the file never had.
    const noGeo = serializeFundamentalStyle(DEFAULT_SETTINGS);
    expect('pageGeometry' in noGeo).toBe(false);
    const applied = applyFundamentalStyle(DEFAULT_SETTINGS, noGeo);
    const round = serializeFundamentalStyle(withBakedGeometry(applied, A4));
    expect('pageGeometry' in round).toBe(true); // gained a baked geometry
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
