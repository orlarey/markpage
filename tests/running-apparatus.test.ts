import { describe, expect, it } from 'vitest';

import {
  apparatusStringSets,
  materialToCss,
  runningApparatusCss,
  zoneToCss,
  type ApparatusMaterial,
  type ApparatusZones,
  type RunningApparatus,
} from '../packages/markpage-render/src/running-apparatus';

const z = (
  inner: ApparatusMaterial[] = [],
  center: ApparatusMaterial[] = [],
  outer: ApparatusMaterial[] = [],
): ApparatusZones => ({ inner, center, outer });

describe('materialToCss', () => {
  it('maps tokens and literals to CSS content fragments', () => {
    expect(materialToCss('folio')).toBe('counter(page)');
    expect(materialToCss('folioRoman')).toBe('counter(page, lower-roman)');
    expect(materialToCss('chapter')).toBe('string(mp-title)');
    expect(materialToCss('section')).toBe('string(mp-section)');
    expect(materialToCss('doctitle')).toBe('string(mp-doctitle)');
    expect(materialToCss({ text: 'Brouillon' })).toBe('"Brouillon"');
  });

  it('resolves the `author` material to the document author (render-time value)', () => {
    expect(materialToCss('author', 'Yann Orlarey')).toBe('"Yann Orlarey"');
    expect(materialToCss('author')).toBe('""'); // no author → empty
    // threaded through a zone
    expect(zoneToCss(['author'], false, 'Ada Lovelace')).toBe('"Ada Lovelace"');
  });
});

describe('zoneToCss — inline sequence, reversed on verso', () => {
  it('empty zone renders an empty string', () => {
    expect(zoneToCss([], false)).toBe('""');
  });
  it('joins a stack with the " · " separator', () => {
    expect(zoneToCss(['chapter', 'folio'], false)).toBe(
      'string(mp-title) " · " counter(page)',
    );
  });
  it('reverses the sequence on verso (mirror)', () => {
    expect(zoneToCss(['chapter', 'folio'], true)).toBe(
      'counter(page) " · " string(mp-title)',
    );
  });
});

describe('apparatusStringSets — only what is used', () => {
  it('emits string-set rules for chapter / section / doctitle when present', () => {
    const app: RunningApparatus = {
      header: { verso: z([], ['doctitle']), recto: z([], ['chapter']) },
      footer: { verso: z(), recto: z([], ['section']) },
    };
    const sets = apparatusStringSets(app);
    expect(sets).toContain('h1:not(.doc-title) { string-set: mp-title content(); }');
    expect(sets).toContain('h2 { string-set: mp-section content(); }');
    expect(sets).toContain('h1.doc-title { string-set: mp-doctitle content(); }');
  });
  it('emits nothing for a folio-only apparatus', () => {
    const app: RunningApparatus = {
      header: { verso: z([], [], ['folio']), recto: z([], [], ['folio']) },
      footer: { verso: z(), recto: z() },
    };
    expect(apparatusStringSets(app)).toEqual([]);
  });
});

describe('runningApparatusCss — full compile with parity + mirror', () => {
  const app: RunningApparatus = {
    header: {
      verso: z([], ['doctitle'], ['folio']),
      recto: z([], ['chapter'], ['folio']),
    },
    footer: { verso: z(), recto: z() },
  };
  const css = runningApparatusCss(app);

  it('recto (@page :right): inner→left, center, outer→right, stack as-is', () => {
    expect(css).toContain(
      '@page :right { @top-left { content: ""; } @top-center { content: string(mp-title); } @top-right { content: counter(page); } }',
    );
  });
  it('verso (@page :left): position mirrored + stack reversed', () => {
    expect(css).toContain(
      '@page :left { @top-left { content: counter(page); } @top-center { content: string(mp-doctitle); } @top-right { content: ""; } }',
    );
  });
  it('includes the needed string-set rules only', () => {
    expect(css).toContain('h1:not(.doc-title) { string-set: mp-title content(); }');
    expect(css).toContain('h1.doc-title { string-set: mp-doctitle content(); }');
    expect(css).not.toContain('mp-section');
  });
});
