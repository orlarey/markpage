import { describe, expect, it } from 'vitest';

import { pagedCss } from '../src/preview-paginated';
import { DEFAULT_SETTINGS } from '../src/settings';

/**
 * Display type is never hyphenated. The justified body needs `hyphens: auto`
 * (set on the container), but that must not cascade to titles, subtitles and
 * headings — a hyphen mid-word in a heading ("chan-tier") reads as a typo.
 */
describe('pagedCss — hyphenation of display type', () => {
  const css = pagedCss(DEFAULT_SETTINGS);

  it('turns hyphenation OFF for headings + subtitle', () => {
    const rule = css.match(
      /:is\(h1, h2, h3, h4, h5, h6\)[^{]*\.doc-subtitle \{[^}]*\}/,
    )?.[0];
    expect(rule).toBeTruthy();
    expect(rule).toContain('hyphens: none;');
    expect(rule).toContain('-webkit-hyphens: none;');
  });

  it('keeps hyphenation ON for the justified body container', () => {
    // The container still opts the body into auto-hyphenation.
    expect(css).toContain('hyphens: auto;');
  });
});
