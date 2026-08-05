import { describe, expect, it } from 'vitest';

import {
  numberForRender,
  renderNumberingDocStyle,
} from '../src/numbering';
import { renderPreview } from '../src/preview';
import {
  linkTocPlus,
  markChapterNumerals,
  wrapHeadingNumbers,
} from '../src/preview-paginated';
import type { PdfSettings } from '../src/settings';

const chapSettings = (over: Record<string, unknown> = {}): PdfSettings =>
  ({
    chapterBreak: 'next-page',
    numbering: { on: true, depth: 1 },
    ...over,
  }) as unknown as PdfSettings;

const h1Root = (html: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
};

// The render wraps each number in a `.heading-num` span (numberForRender).
const num = (n: string): string => `<span class="heading-num">${n}</span>`;

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

describe('renderPreview — numbering wiring', () => {
  it('numbers headings in the DOM and skips the doc-title fallback (H1 ≠ title)', () => {
    const div = document.createElement('div');
    renderPreview(div, '# Intro\n\n## Background\n', { on: true, depth: 2 });
    expect(div.querySelector('h1')?.textContent).toBe('1 Intro');
    expect(div.querySelector('h2')?.textContent).toBe('1.1 Background');
    expect(div.querySelector('h1')?.classList.contains('doc-title')).toBe(false);
  });

  it('legacy (no directive) still promotes the first h1 to doc-title', () => {
    const div = document.createElement('div');
    renderPreview(div, '# Intro\n');
    expect(div.querySelector('h1')?.classList.contains('doc-title')).toBe(true);
  });

  it('front-matter title stays the doc-title; body headings are numbered', () => {
    const div = document.createElement('div');
    renderPreview(div, '---\ntitle: My Doc\n---\n# Intro\n', {
      on: true,
      depth: 1,
    });
    const h1s = [...div.querySelectorAll('h1')];
    expect(h1s[0]?.classList.contains('doc-title')).toBe(true);
    expect(h1s[0]?.textContent).toBe('My Doc');
    expect(h1s.some((h) => h.textContent === '1 Intro')).toBe(true);
  });
});

describe('linkTocPlus — TOC number display (4c-1)', () => {
  it('prefixes a matched TOC entry with the heading number', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<nav class="toc-plus"><a data-toc-title="Contexte">Contexte</a></nav>' +
      '<h2>1.1 Contexte</h2>';
    linkTocPlus(root);
    const a = root.querySelector('a[data-toc-title]')!;
    expect(a.getAttribute('href')).toBe('#sec-contexte');
    expect(a.querySelector('.toc-num')?.textContent).toBe('1.1 ');
    expect(a.textContent).toBe('1.1 Contexte');
  });

  it('adds no number when the heading is not numbered', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<nav class="toc-plus"><a data-toc-title="Contexte">Contexte</a></nav>' +
      '<h2>Contexte</h2>';
    linkTocPlus(root);
    const a = root.querySelector('a[data-toc-title]')!;
    expect(a.querySelector('.toc-num')).toBeNull();
    expect(a.textContent).toBe('Contexte');
  });
});

describe('wrapHeadingNumbers — hang the number in a span', () => {
  it('wraps the leading number of each heading, keeping a readable textContent', () => {
    const root = h1Root('<h1>1 Intro</h1><h2>1.1 Objet</h2>');
    wrapHeadingNumbers(root);
    // the trailing gap lives inside the span (fixed-gutter alignment)
    expect(root.querySelector('h1 .heading-num')?.textContent).toBe('1 ');
    expect(root.querySelector('h2 .heading-num')?.textContent).toBe('1.1 ');
    expect(root.querySelector('h1')?.textContent).toBe('1 Intro');
    expect(root.querySelector('h2')?.textContent).toBe('1.1 Objet');
  });

  it('skips the cover doc-title and unnumbered headings', () => {
    const root = h1Root('<h1 class="doc-title">1 My Doc</h1><h2>Sans numéro</h2>');
    wrapHeadingNumbers(root);
    expect(root.querySelector('.heading-num')).toBeNull();
  });

  it('is idempotent', () => {
    const root = h1Root('<h2>2.3 Foo</h2>');
    wrapHeadingNumbers(root);
    wrapHeadingNumbers(root);
    expect(root.querySelectorAll('.heading-num')).toHaveLength(1);
  });
});

describe('markChapterNumerals — big chapter numeral (4c-2)', () => {
  it('promotes the h1 .heading-num into a .chapter-num span (numeric)', () => {
    const root = h1Root(`<h1>${num('1')} Le pli comme unité</h1>`);
    markChapterNumerals(root, chapSettings());
    const h1 = root.querySelector('h1')!;
    expect(h1.querySelector('.chapter-num')?.textContent).toBe('1');
    expect(h1.querySelector('.heading-num')).toBeNull(); // promoted, not duplicated
    expect(h1.querySelector('.chapter-num')?.nextSibling?.textContent?.trim()).toBe(
      'Le pli comme unité',
    );
  });

  it('spells "Chapitre N" with chapterFormat: chapter', () => {
    const root = h1Root(`<h1>${num('2')} Résultats</h1>`);
    markChapterNumerals(
      root,
      chapSettings({ numbering: { on: true, depth: 1, chapterFormat: 'chapter' } }),
    );
    expect(root.querySelector('.chapter-num')?.textContent).toBe('Chapitre 2');
  });

  it('does nothing without chapterBreak, or with numbering off', () => {
    const a = h1Root(`<h1>${num('1')} Intro</h1>`);
    markChapterNumerals(a, chapSettings({ chapterBreak: 'none' }));
    expect(a.querySelector('.chapter-num')).toBeNull();
    const b = h1Root(`<h1>${num('1')} Intro</h1>`);
    markChapterNumerals(b, chapSettings({ numbering: { on: false, depth: 1 } }));
    expect(b.querySelector('.chapter-num')).toBeNull();
  });

  it('leaves the cover doc-title alone and preserves inline markup', () => {
    const cover = h1Root(`<h1 class="doc-title">${num('1')} My Doc</h1>`);
    markChapterNumerals(cover, chapSettings());
    expect(cover.querySelector('.chapter-num')).toBeNull();

    const marked = h1Root(`<h1>${num('3')} Le <code>fold</code></h1>`);
    markChapterNumerals(marked, chapSettings());
    expect(marked.querySelector('.chapter-num')?.textContent).toBe('3');
    expect(marked.querySelector('code')?.textContent).toBe('fold');
  });

  it('is idempotent', () => {
    const root = h1Root(`<h1>${num('1')} Intro</h1>`);
    markChapterNumerals(root, chapSettings());
    markChapterNumerals(root, chapSettings());
    expect(root.querySelectorAll('.chapter-num')).toHaveLength(1);
  });
});
