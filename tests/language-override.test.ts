import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '@orlarey/markpage-render';
import { DEFAULT_SETTINGS, applyLanguageOverride } from '../src/settings';

/**
 * Language left the style (STYLE-ALIGNMENT): it is the ONE content-level
 * front-matter override. A document carries `language:`; it overrides the
 * resolved style's language, and nothing else about appearance.
 */
describe('language — the one content-level override', () => {
  it('front-matter recognises `language:` as a top-level key (not extra)', () => {
    const { meta } = parseFrontmatter('---\ndocument-style: rapport-a4\nlanguage: en\n---\nBody');
    expect(meta.language).toBe('en');
    expect(meta.extra.language).toBeUndefined();
  });

  it('overrides the resolved language with a valid value', () => {
    const base = { ...DEFAULT_SETTINGS, language: 'fr' as const };
    expect(applyLanguageOverride(base, 'en').language).toBe('en');
    expect(applyLanguageOverride(base, 'EN').language).toBe('en'); // case/space tolerant
  });

  it('keeps the base language when the override is absent or invalid', () => {
    const base = { ...DEFAULT_SETTINGS, language: 'fr' as const };
    expect(applyLanguageOverride(base, undefined).language).toBe('fr');
    expect(applyLanguageOverride(base, 'klingon').language).toBe('fr');
    expect(applyLanguageOverride(base, '').language).toBe('fr');
  });

  it('is a no-op object when nothing changes (referential stability)', () => {
    const base = { ...DEFAULT_SETTINGS, language: 'fr' as const };
    expect(applyLanguageOverride(base, 'fr')).toBe(base);
    expect(applyLanguageOverride(base, undefined)).toBe(base);
  });
});
