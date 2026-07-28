import { describe, expect, it } from 'vitest';
import {
  hsvToHex,
  cranToHex,
  parseCran,
  parseColorCrans,
  deriveElementColors,
  backgroundColor,
} from '@orlarey/markpage-render';

describe('hsvToHex', () => {
  it('maps the primaries and greys', () => {
    expect(hsvToHex(0, 0, 1)).toBe('#ffffff');
    expect(hsvToHex(0, 0, 0)).toBe('#000000');
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000');
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00');
    expect(hsvToHex(240, 1, 1)).toBe('#0000ff');
  });
  it('wraps the hue', () => {
    expect(hsvToHex(360, 1, 1)).toBe(hsvToHex(0, 1, 1));
    expect(hsvToHex(-120, 1, 1)).toBe(hsvToHex(240, 1, 1));
  });
});

describe('parseCran', () => {
  it('reads a tint and a neutral', () => {
    expect(parseCran('4,3')).toEqual({ kind: 'tint', s: 4, v: 3 });
    expect(parseCran(' 0 , 5 ')).toEqual({ kind: 'tint', s: 0, v: 5 });
    expect(parseCran('n4')).toEqual({ kind: 'neutral', g: 4 });
    expect(parseCran('N0')).toEqual({ kind: 'neutral', g: 0 });
  });
  it('rejects out-of-range and garbage', () => {
    expect(parseCran('6,0')).toBeNull(); // index > 5
    expect(parseCran('n7')).toBeNull();
    expect(parseCran('foo')).toBeNull();
    expect(parseCran('')).toBeNull();
  });
});

describe('cranToHex', () => {
  it('a neutral cran ignores the hue', () => {
    const a = cranToHex(0, { kind: 'neutral', g: 4 });
    const b = cranToHex(213, { kind: 'neutral', g: 4 });
    expect(a).toBe(b); // same grey whatever the hue
    // and it IS a pure grey (r=g=b)
    expect(a).toMatch(/^#([0-9a-f]{2})\1\1$/);
  });
  it('a tinted cran follows the hue', () => {
    const blue = cranToHex(213, { kind: 'tint', s: 5, v: 3 });
    const green = cranToHex(120, { kind: 'tint', s: 5, v: 3 });
    expect(blue).not.toBe(green); // rotating the hue rotates the colour
  });
  it('the top-left neutral is white, the bottom-left is black', () => {
    expect(cranToHex(213, { kind: 'neutral', g: 0 })).toBe('#ffffff');
    expect(cranToHex(213, { kind: 'neutral', g: 5 })).toBe('#000000');
  });
});

describe('parseColorCrans', () => {
  it('parses a whole table, lowercasing names, skipping garbage', () => {
    const m = parseColorCrans('titre:4,4 h1:4,3 corps:n4 BAD junk code:n2');
    expect(m.get('titre')).toEqual({ kind: 'tint', s: 4, v: 4 });
    expect(m.get('h1')).toEqual({ kind: 'tint', s: 4, v: 3 });
    expect(m.get('corps')).toEqual({ kind: 'neutral', g: 4 });
    expect(m.get('code')).toEqual({ kind: 'neutral', g: 2 });
    expect(m.has('bad')).toBe(false); // malformed cran dropped
    expect(m.size).toBe(4);
  });
});

describe('deriveElementColors', () => {
  it('fans code out to inline + block, maps names, skips backgrounds', () => {
    const crans = parseColorCrans(
      'titre:4,4 corps:n5 code:n3 page:n0 cover:5,3 legende:n2',
    );
    const colors = deriveElementColors(213, crans);
    expect(colors.get('title')).toBe(cranToHex(213, { kind: 'tint', s: 4, v: 4 }));
    expect(colors.get('body')).toBe('#000000'); // n5 neutral
    // code drives BOTH inline and block
    const codeHex = cranToHex(213, { kind: 'neutral', g: 3 });
    expect(colors.get('code-inline')).toBe(codeHex);
    expect(colors.get('code-block')).toBe(codeHex);
    expect(colors.get('caption')).toBe(cranToHex(213, { kind: 'neutral', g: 2 }));
    // page / cover are backgrounds — never foreground colours
    expect(colors.has('page')).toBe(false);
    expect(colors.has('cover')).toBe(false);
  });
});

describe('backgroundColor', () => {
  it('returns the page/cover fill, or null when absent', () => {
    const crans = parseColorCrans('page:n0 cover:5,3 h1:4,3');
    expect(backgroundColor(213, crans, 'page')).toBe('#ffffff');
    expect(backgroundColor(213, crans, 'cover')).toBe(
      cranToHex(213, { kind: 'tint', s: 5, v: 3 }),
    );
    const noCover = parseColorCrans('page:n0');
    expect(backgroundColor(213, noCover, 'cover')).toBeNull();
  });
});
