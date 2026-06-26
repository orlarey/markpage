import { describe, expect, it } from 'vitest';

import { renderMarkpageMarkdown, rewriteImageSrc } from '@orlarey/markpage-render';

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

  it('reset form: an empty block (close right after the opening) is valid', () => {
    const html = renderMarkpageMarkdown('::: background\n:::');
    // background isn't a styled class yet, but the empty block must tokenize
    // (not leak its `:::` as text) — it renders as a (neutral) admonition div.
    expect(html).toContain('admonition');
    expect(html).not.toMatch(/<p>:::/);
  });
});
