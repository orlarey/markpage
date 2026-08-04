import { describe, expect, it } from 'vitest';
import {
  deriveFontSizes,
  resolveFontPairing,
  FONT_PAIRINGS,
} from '@orlarey/markpage-render';

// The font-pairing / modular-scale DERIVATION (the style editor's compiler
// tools). The former front-matter `font-pair` / `font-base` / `math-scale`
// pipeline was removed with the radical minimal front-matter (STYLE-ALIGNMENT
// step 7) — a document overrides nothing; the style owns typography.

describe('deriveFontSizes (the type scale)', () => {
  it('anchors the body and climbs monotonically', () => {
    const s = deriveFontSizes(11, 1.25);
    expect(s.get('body')).toBe(11);
    // title > h1 > h2 > h3 > h4 > body > footnote
    const order = ['title', 'h1', 'h2', 'h3', 'h4', 'body', 'footnote'].map((k) =>
      s.get(k) as number,
    );
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeLessThan(order[i - 1]);
    }
    // footnote is one step below body → smaller
    expect(s.get('footnote')).toBeLessThan(11);
  });
  it('a bigger ratio spreads the scale', () => {
    const tight = deriveFontSizes(11, 1.2).get('h1') as number;
    const wide = deriveFontSizes(11, 1.34).get('h1') as number;
    expect(wide).toBeGreaterThan(tight);
  });
  it('rounds to the nearest half point', () => {
    for (const pt of deriveFontSizes(10.5, 1.25).values()) {
      expect(pt * 2).toBe(Math.round(pt * 2));
    }
  });
});

describe('font-pair resolution', () => {
  it('every pairing resolves and names a maths set', () => {
    for (const p of FONT_PAIRINGS) {
      expect(resolveFontPairing(p.id)).toBe(p);
      expect(['newcm', 'fira', 'stix2', 'asana', 'tex']).toContain(p.math);
    }
    expect(resolveFontPairing('CLASSIQUE')).toBe(resolveFontPairing('classique'));
    expect(resolveFontPairing('nope')).toBeUndefined();
  });
});
