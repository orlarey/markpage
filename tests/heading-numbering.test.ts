import { describe, expect, it } from 'vitest';

import {
  numberForRender,
  renderNumberingDocStyle,
} from '../src/numbering';

const DOC = ['# Intro', '## Background', '## Method', '# Results', '## Data'].join(
  '\n',
);

describe('render-time heading numbering', () => {
  it('numbers H1 as level 1 — H1 is never the document title (no shift)', () => {
    expect(numberForRender('# Intro\n## Background', true, 2)).toBe(
      '# 1 Intro\n## 1.1 Background',
    );
  });

  it('applies hierarchical decimal down the tree', () => {
    expect(numberForRender(DOC, true, 2)).toBe(
      [
        '# 1 Intro',
        '## 1.1 Background',
        '## 1.2 Method',
        '# 2 Results',
        '## 2.1 Data',
      ].join('\n'),
    );
  });

  it('strips typed numbers and replaces them with the computed ones', () => {
    expect(numberForRender('# 7. Intro\n## 3.9 Background', true, 2)).toBe(
      '# 1 Intro\n## 1.1 Background',
    );
  });

  it('respects depth (only levels < depth are numbered, deeper ones stripped)', () => {
    expect(numberForRender('# Intro\n## 5. Background', true, 1)).toBe(
      '# 1 Intro\n## Background',
    );
  });

  it('strips always when numbering is off (style fully owns numbering)', () => {
    expect(numberForRender('# 1. Intro\n## 1.1 Background', false, 3)).toBe(
      '# Intro\n## Background',
    );
  });

  it('leaves fenced code blocks untouched', () => {
    const src = '# Intro\n```\n# not a heading\n```';
    expect(numberForRender(src, true, 1)).toBe(
      '# 1 Intro\n```\n# not a heading\n```',
    );
  });

  it('builds a hierarchical DocStyle down to depth, none beyond', () => {
    const ds = renderNumberingDocStyle(true, 2);
    expect(ds.levels[0]).toEqual({ kind: 'hierarchical', trailingDot: false });
    expect(ds.levels[1]).toEqual({ kind: 'hierarchical', trailingDot: false });
    expect(ds.levels[2]).toEqual({ kind: 'none' });
  });
});
