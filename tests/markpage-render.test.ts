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
