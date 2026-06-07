import { describe, expect, it } from 'vitest';

import { marked } from 'marked';

import '../src/marked-config';

/**
 * Purpose: Verify the §9.7.5 Pandoc-style trailing-attrs tokenizer
 *   on images: `![alt](url){.class}` renders as
 *   `<img alt="..." src="..." class="...">`, NOT as a standard image
 *   followed by `{.class}` plain text.
 */

describe('marked image extension — Pandoc `{.classes}` suffix', () => {
  it('attaches a single class from {.margin}', () => {
    const html = marked.parse('![Galileo](galileo.png){.margin}', {
      async: false,
    }) as string;
    expect(html).toContain('class="margin"');
    expect(html).toContain('src="galileo.png"');
    expect(html).toContain('alt="Galileo"');
    expect(html).not.toContain('{.margin}');
  });

  it('handles an empty alt (drag-dropped image case)', () => {
    const html = marked.parse('![](image.png){.margin}', {
      async: false,
    }) as string;
    expect(html).toContain('class="margin"');
    expect(html).toContain('alt=""');
  });

  it('joins multiple classes with whitespace', () => {
    const html = marked.parse('![alt](u.png){.margin .small}', {
      async: false,
    }) as string;
    expect(html).toContain('class="margin small"');
  });

  it("ignores `{.…}` that doesn't follow an image syntax (regular text)", () => {
    const html = marked.parse('A line {.fake} of prose.', {
      async: false,
    }) as string;
    // The plain text `{.fake}` is preserved verbatim — no class
    // attribute injected on the paragraph.
    expect(html).toContain('{.fake}');
    expect(html).not.toContain('class="fake"');
  });

  it('falls through to the default image rendering when no {…} suffix is present', () => {
    const html = marked.parse('![Galileo](galileo.png)', {
      async: false,
    }) as string;
    expect(html).toContain('src="galileo.png"');
    expect(html).toContain('alt="Galileo"');
    expect(html).not.toContain('class=');
  });

  it('escapes special characters in alt / src / classes', () => {
    const html = marked.parse('![<i>](u".png){.weird-class}', {
      async: false,
    }) as string;
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;i&gt;');
    expect(html).toContain('&quot;.png');
  });
});
