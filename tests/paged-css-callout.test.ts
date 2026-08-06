import { describe, expect, it } from 'vitest';

import { pagedCss } from '../src/preview-paginated';
import { DEFAULT_SETTINGS, type PdfSettings } from '../src/settings';

/**
 * The callout box is authoritative: markpage's callouts carry a type-based
 * tint + coloured left bar (constructs.css `.admonition-note/-caution/…`). A
 * style with the callout's fond/bordure turned OFF must render a PLAIN callout,
 * not inherit those defaults — so the `.admonition` rule sets an explicit
 * transparent background + `border: none` BEFORE the style's own box.
 */
const withCallout = (callout: Record<string, unknown>): PdfSettings => ({
  ...DEFAULT_SETTINGS,
  styles: { ...DEFAULT_SETTINGS.styles, callout },
});

describe('pagedCss — callout box neutralises type-based defaults', () => {
  it('emits transparent background + border:none ahead of the style box', () => {
    const css = pagedCss(withCallout({ padding: 0.7, borderRadius: 8 }));
    const rule = css.match(/\.admonition \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('background: transparent;');
    expect(rule).toContain('border: none;');
    // the neutralisers come before the style's own declarations
    expect(rule.indexOf('background: transparent;')).toBeLessThan(
      rule.indexOf('padding:'),
    );
  });

  it('the style background, when set, still overrides (comes after)', () => {
    const css = pagedCss(withCallout({ background: '#eef4ff', padding: 0.7 }));
    const rule = css.match(/\.admonition \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('background: transparent;');
    expect(rule).toContain('background: #eef4ff;');
    // same-property cascade: the style colour must be the LAST background decl
    expect(rule.lastIndexOf('background: #eef4ff;')).toBeGreaterThan(
      rule.indexOf('background: transparent;'),
    );
  });
});
