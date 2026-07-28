import { describe, expect, it } from 'vitest';
import {
  parseFrontmatter,
  deriveFontSizes,
  resolveFontPairing,
  FONT_PAIRINGS,
} from '@orlarey/markpage-render';
import { DEFAULT_SETTINGS, applyFrontmatterToSettings } from '../src/settings';

const render = (fm: string) => {
  const { meta } = parseFrontmatter(`---\n${fm}\n---\n\n# Doc\n`);
  return applyFrontmatterToSettings(DEFAULT_SETTINGS, meta);
};

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

describe('font-pair → settings', () => {
  it('every pairing resolves and names a maths set', () => {
    for (const p of FONT_PAIRINGS) {
      expect(resolveFontPairing(p.id)).toBe(p);
      expect(['newcm', 'fira', 'stix2', 'asana', 'tex']).toContain(p.math);
    }
    expect(resolveFontPairing('CLASSIQUE')).toBe(resolveFontPairing('classique'));
    expect(resolveFontPairing('nope')).toBeUndefined();
  });

  it('sets the three families + the maths font set', () => {
    const s = render('font-pair: classique');
    const p = resolveFontPairing('classique')!;
    expect(s.fonts.headings).toBe(p.headings);
    expect(s.fonts.body).toBe(p.body);
    expect(s.fonts.code).toBe(p.code);
    expect(s.mathFontSet).toBe(p.math);
  });

  it('derives element sizes from the pairing ratio and base', () => {
    const s = render('font-pair: classique\nfont-base: 12');
    const sizes = deriveFontSizes(12, resolveFontPairing('classique')!.ratio);
    expect(s.styles.body.fontSize).toBe(sizes.get('body'));
    expect(s.styles.h1.fontSize).toBe(sizes.get('h1'));
    expect(s.styles.footnote.fontSize).toBe(sizes.get('footnote'));
    expect(s.styles.footnote.fontSize).toBeLessThan(s.styles.body.fontSize as number);
  });
});

describe('font-base and math-scale', () => {
  it('font-base alone scales via the default ratio', () => {
    const s = render('font-base: 13');
    expect(s.styles.body.fontSize).toBe(13);
    expect(s.styles.h1.fontSize).toBeGreaterThan(13);
    // fonts untouched without a pairing
    expect(s.fonts.headings).toBe(DEFAULT_SETTINGS.fonts.headings);
  });
  it('math-scale lands on settings', () => {
    expect(render('math-scale: 0.9').mathScale).toBe(0.9);
  });
  it('no font keys → sizes and fonts stay at their defaults', () => {
    const s = render('color-hue: 120');
    expect(s.styles.h1.fontSize).toBe(DEFAULT_SETTINGS.styles.h1.fontSize);
    expect(s.mathScale).toBe(DEFAULT_SETTINGS.mathScale);
  });
});
