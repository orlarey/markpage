import { describe, expect, it } from 'vitest';

import { renderMarkpageMarkdown, rewriteImageSrc, paginationCss } from '@orlarey/markpage-render';

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

  it('leaves a reference with no matching definition as literal text', () => {
    const html = renderMarkpageMarkdown('A typo[^missing] here.\n');
    expect(html).toContain('[^missing]');
    expect(html).not.toContain('footnote-ref');
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
    expect(css).toContain('.math-block, .mermaid-block, img { break-inside: avoid; }');
    expect(css).toContain('.admonition, .columns-block, figure.captioned { break-inside: avoid; }');
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

  it('forbids dangling paragraph/list lines', () => {
    expect(css).toContain('p, li { orphans: 3; widows: 3; }');
  });
});
