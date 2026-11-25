import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dataTableToMarkdown, renderMarkpageMarkdown, rewriteImageSrc, paginationCss } from '@orlarey/markpage-render';

describe('renderMarkpageMarkdown — the package render entry', () => {
  it('applies markpage extensions (admonition callout)', () => {
    const html = renderMarkpageMarkdown('::: note\nhello\n:::');
    expect(html).toContain('admonition');
    expect(html).toContain('admonition-note');
  });

  it('renders plain Markdown', () => {
    expect(renderMarkpageMarkdown('# Title')).toContain('<h1');
  });

  it('leaves image srcs verbatim when no resolver is given', () => {
    const html = renderMarkpageMarkdown('![a](pic.png)');
    expect(html).toContain('src="pic.png"');
  });

  it('routes image srcs through resolveImageSrc (the seam)', () => {
    const html = renderMarkpageMarkdown('![a](pic.png)', {
      resolveImageSrc: (src) => `vscode-resource:/${src}`,
    });
    expect(html).toContain('src="vscode-resource:/pic.png"');
    expect(html).not.toContain('src="pic.png"');
  });
});

describe('rewriteImageSrc — the image seam, standalone', () => {
  it('rewrites every <img src> and leaves the rest intact', () => {
    const html = '<p><img src="a.png" alt="x"><img src="b.png"></p>';
    const out = rewriteImageSrc(html, (s) => `R/${s}`);
    expect(out).toBe('<p><img src="R/a.png" alt="x"><img src="R/b.png"></p>');
  });
});

describe('::: style — local typographic overrides (STYLE-SPEC)', () => {
  // The block emits a scoped <style>.mp-style-N,.mp-style-N *{…}</style> rule
  // (!important, so it wins over element-level rules). Pull its declarations.
  const ruleOf = (html: string): string =>
    /<style>\.mp-style-\d+,[^{]*\{([^}]*)\}<\/style>/.exec(html)?.[1] ?? '';

  it('maps the allowlist to validated, !important declarations', () => {
    const rule = ruleOf(
      renderMarkpageMarkdown(
        '::: style color=#ff0000 size=28pt align=center font="Inter" weight=700 italic underline line-height=1.3\nHi\n:::',
      ),
    );
    expect(rule).toContain('color:#ff0000 !important');
    expect(rule).toContain('font-size:28pt !important');
    expect(rule).toContain('text-align:center !important');
    expect(rule).toContain("font-family:'Inter' !important");
    expect(rule).toContain('font-weight:700 !important');
    expect(rule).toContain('font-style:italic !important');
    expect(rule).toContain('text-decoration:underline !important');
    expect(rule).toContain('line-height:1.3 !important');
  });

  it('renders the body recursively (markdown inside)', () => {
    const html = renderMarkpageMarkdown('::: style color=navy\n# Titre\n\n- a\n- b\n:::');
    expect(html).toContain('class="mp-style');
    expect(html).toContain('<h1');
    expect(html).toContain('<li>a</li>');
  });

  it('drops unknown / invalid attributes (no rule, no injection)', () => {
    const html = renderMarkpageMarkdown(
      '::: style color=red;}<script> evil=url(x) size=12px weight=42 align=top\nx\n:::',
    );
    expect(html).toContain('class="mp-style"');
    // `red;}<script>` fails the colour regex; size=12px isn't a pt number;
    // weight 42 / align top are invalid; evil=url(x) isn't in the allowlist →
    // every attribute is dropped, so no scoped rule is emitted.
    expect(ruleOf(html)).toBe('');
    expect(html).not.toContain('<style>');
    // The literal <script> only survives (escaped, inert) in the data-source echo.
    expect(html).not.toContain('<script>');
  });

  it('accepts a bare size (pt implied) and a CSS colour name', () => {
    const rule = ruleOf(renderMarkpageMarkdown('::: style size=18 color=teal\nx\n:::'));
    expect(rule).toContain('font-size:18pt !important');
    expect(rule).toContain('color:teal !important');
  });

  it('nests with more colons on the outer fence (a 3-colon close does not close a 4-colon block)', () => {
    const html = renderMarkpageMarkdown(
      ':::: style color=red\n::: note\ninner callout\n:::\n::::',
    );
    expect(html).toContain('class="mp-style'); // the outer style block
    expect(html).toContain('admonition-note'); // the inner callout survived nesting
    // the inner note is INSIDE the styled block
    const styleIdx = html.indexOf('mp-style');
    const noteIdx = html.indexOf('admonition-note');
    expect(styleIdx).toBeGreaterThanOrEqual(0);
    expect(noteIdx).toBeGreaterThan(styleIdx);
  });

  it('reset form: an empty ::: background tokenizes (no leaked `:::`)', () => {
    const html = renderMarkpageMarkdown('::: background\n:::');
    expect(html).toContain('class="mp-bg"');
    expect(html).not.toMatch(/<p>:::/);
  });
});

describe('::: background — page backdrop sentinel (BACKGROUND-SPEC)', () => {
  const specOf = (html: string): Record<string, unknown> => {
    const raw = /data-bg="([^"]*)"/.exec(html)?.[1] ?? '{}';
    const json = raw
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return JSON.parse(json);
  };

  it('emits a hidden sentinel with the parsed, validated spec', () => {
    const html = renderMarkpageMarkdown(
      '::: background at=0.5,0.4 size=0.7 fill=#0b1f3a\nTitre\n:::',
    );
    expect(html).toContain('class="mp-bg"');
    expect(html).toContain('height:0'); // hidden in flow
    const spec = specOf(html);
    expect(spec.at).toEqual([0.5, 0.4]);
    expect(spec.size).toBe(0.7);
    expect(spec.fill).toBe('#0b1f3a');
    expect(spec.first).toBe(false);
  });

  it('full-page form: no size, fill only', () => {
    const spec = specOf(renderMarkpageMarkdown('::: background fill=#fff first\n:::'));
    expect(spec.size).toBeNull();
    expect(spec.at).toBeNull();
    expect(spec.fill).toBe('#fff');
    expect(spec.first).toBe(true);
  });

  it('clamps over-range coordinates to [0,1] and rejects an invalid fill', () => {
    const spec = specOf(renderMarkpageMarkdown('::: background at=1.5,2 fill=red;}evil\nx\n:::'));
    expect(spec.at).toEqual([1, 1]);
    expect(spec.fill).toBeNull();
  });

  it('renders the body recursively (the minipage content)', () => {
    const html = renderMarkpageMarkdown('::: background at=0.5,0.5 size=0.6\n# Grand titre\n:::');
    expect(html).toContain('<h1');
    expect(html).toContain('Grand titre');
  });
});

describe('footnotes — forward references resolve regardless of nesting', () => {
  it('renders a footnote referenced from inside a definition list', () => {
    // Regression: a def-list inline-parses its body during block tokenisation,
    // before the later `[^id]:` def line is seen — so the ref used to fall
    // through to literal `[^fold]` text with no footnotes section. The
    // preprocess pre-scan of defs fixes it.
    const md = 'Fold\n:   interprets a term[^fold].\n\n[^fold]: A catamorphism.\n';
    const html = renderMarkpageMarkdown(md);
    expect(html).toContain('footnote-ref');
    expect(html).toContain('class="footnotes"');
    expect(html).not.toContain('[^fold]');
  });

  it('still renders a footnote referenced from a plain paragraph', () => {
    const html = renderMarkpageMarkdown('Text with a note[^x].\n\n[^x]: The body.\n');
    expect(html).toContain('footnote-ref');
    expect(html).toContain('class="footnotes"');
  });

  it('numbers notes in source order, a definition-list call included', () => {
    // A def-list inline-parses during block tokenisation, before the paragraphs
    // around it: its note used to take number 1 even when called last.
    const md = [
      'A paragraph with a note[^a], then another[^b].',
      '',
      'Term',
      ':   A definition calling a third note[^c].',
      '',
      'Code `[^c]` and a fence do not count as calls:',
      '',
      '```',
      '[^c] [^b]',
      '```',
      '',
      '[^a]: First.',
      '[^b]: Second.',
      '[^c]: Third.',
      '',
    ].join('\n');
    const html = renderMarkpageMarkdown(md);
    const calls = [...html.matchAll(/<sup class="footnote-ref"><a href="#fn-(\w)"[^>]*>(\d+)<\/a>/g)].map(
      (m) => `${m[1]}${m[2]}`,
    );
    expect(calls).toEqual(['a1', 'b2', 'c3']);
    const section = html.slice(html.indexOf('class="footnotes"'));
    expect([...section.matchAll(/<li id="fn-(\w)"/g)].map((m) => m[1])).toEqual(['a', 'b', 'c']);
  });

  it('emits one notes section when a demo block calls a note', () => {
    const md = 'Avant[^a].\n\n[^a]: Note A.\n\n````demo\nDans la démo[^t].\n\n[^t]: Note T.\n````\n\nAprès.\n';
    const html = renderMarkpageMarkdown(md);
    expect(html.match(/class="footnotes"/g)?.length).toBe(1);
    expect(html.match(/id="fn-a"/g)?.length).toBe(1);
  });

  it('leaves a reference with no matching definition as literal text', () => {
    const html = renderMarkpageMarkdown('A typo[^missing] here.\n');
    expect(html).toContain('[^missing]');
    expect(html).not.toContain('footnote-ref');
  });
});

describe('csv / tsv — the same table as a Markdown pipe table', () => {
  it('renders a tsv block exactly like the equivalent pipe table', () => {
    const tsv = renderMarkpageMarkdown('```tsv\nnom\tvaleur\nhoa_octo\t`pow(2, 3)` vaut *huit*\n```\n');
    const pipe = renderMarkpageMarkdown('| nom | valeur |\n| --- | --- |\n| hoa_octo | `pow(2, 3)` vaut *huit* |\n');
    // data-source maps the rendered block back to its fence (click-to-source):
    // the one attribute the two forms legitimately differ by.
    const table = (h: string) =>
      h.slice(h.indexOf('<table'), h.indexOf('</table>') + 8).replace(/ data-source="[^"]*"/, '');
    expect(table(tsv)).toBe(table(pipe));
    expect(table(tsv)).toContain('<code>pow(2, 3)</code>');
    expect(table(tsv)).toContain('<em>huit</em>');
  });

  it('aligns a header with its column, unless the column says otherwise', () => {
    const css = readFileSync(join(process.cwd(), 'packages/markpage-render/styles/constructs.css'), 'utf8');
    expect(css).toMatch(/table th:not\(\[align\]\) \{\s*text-align: start;/);
    for (const a of ['left', 'center', 'right']) {
      expect(css).toContain(`table :is(th, td)[align="${a}"] {\n  text-align: ${a};`);
    }
  });

  it('keeps every cell of a row longer than the header, and escapes pipes', () => {
    const md = dataTableToMarkdown('a,b\n1,2,3\nx|y,z\n', ',');
    expect(md.split('\n')[0]).toBe('| a | b |   |');
    expect(md).toContain('| 1 | 2 | 3 |');
    expect(md).toContain('| x\\|y | z |   |');
    const html = renderMarkpageMarkdown('```csv\na,b\n1,2,3\n```\n');
    expect(html).toContain('<td>3</td>');
  });
});

describe('paginationCss — the shared fragmentation policy', () => {
  const css = paginationCss();

  it('keeps headings with the content that follows them', () => {
    expect(css).toMatch(/h1, h2, h3, h4, h5, h6 \{ break-after: avoid; \}/);
    expect(css).toContain('h1 + *, h2 + *, h3 + *, h4 + *, h5 + *, h6 + * { break-before: avoid; }');
  });

  it('keeps a table header with its first row and never splits a row', () => {
    expect(css).toMatch(/thead \{[^}]*break-after: avoid/);
    expect(css).toMatch(/tr \{[^}]*break-inside: avoid/);
  });

  it('keeps atomic and boxed blocks whole', () => {
    expect(css).toContain('.mp-atomic { break-inside: avoid; }');
    expect(css).toContain('.mp-atomic .block-rigid { break-inside: auto; }');
    expect(css).toContain('.columns-block, figure.captioned { break-inside: auto; }');
    expect(css).toContain('.mp-atomic-page {');
    expect(css).toContain('break-before: page;');
    expect(css).toContain('break-after: page;');
  });

  it('allows captioned algorithms to split between rows', () => {
    expect(css).toContain('figure.captioned-algorithm { break-inside: auto; }');
    expect(css).toContain(
      'figure.captioned-algorithm .algorithm-body tbody { break-inside: auto; }',
    );
    expect(css).toContain(
      'figure.captioned-algorithm figcaption { break-before: avoid; }',
    );
  });

  it('keeps short admonitions whole and glues a title to its body', () => {
    expect(css).toMatch(/\.admonition,\s*\.admonition-body \{\s*break-inside: auto;/);
    expect(css).toContain('.admonition.mp-keep-together { break-inside: avoid; }');
    expect(css).toContain('.admonition-title { break-inside: avoid; break-after: avoid; }');
    expect(css).toContain('.admonition-body > :first-child { break-before: avoid; }');
    expect(css).toContain('box-decoration-break: clone;');
  });

  it('forbids dangling paragraph/list lines', () => {
    expect(css).toContain('p, li { orphans: 3; widows: 3; }');
  });

  it('keeps a definition term with the start of its definition', () => {
    expect(css).toContain('dt { break-after: avoid; }');
    expect(css).toContain('dt + dd { break-before: avoid; }');
    expect(css).toContain('dd { orphans: 3; widows: 3; }');
  });

  it('wraps over-wide code in paginated output', () => {
    expect(css).toMatch(
      /pre > code \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/,
    );
    // A scrolling box is monolithic for the fragmentation engine: a long
    // listing could not start at a page foot. highlight.js's pre code.hljs
    // must not win, hence the explicit selector and !important.
    expect(css).toContain('pre, pre > code, pre code.hljs { overflow: visible !important; }');
    expect(css).toMatch(
      /\.algorithm-code \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/,
    );
  });
});
