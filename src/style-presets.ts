/********************************* style-presets.ts ****************************
 *
 * Purpose: Curated `PdfSettings` overrides for the showcase's
 *   "compare stylings" segment — addressed by id from `?style=<id>`.
 * How: Each preset is a `Partial<PdfSettings>`; `applyStylePreset`
 *   merges it over `DEFAULT_SETTINGS` one level deep into nested objects.
 *
 *******************************************************************************/

import { DEFAULT_SETTINGS, type PdfSettings } from './settings';

export type StylePresetId = 'classic' | 'manuscript';

/**
 * Purpose: Map of preset id → partial settings overlay.
 * How: Empty object for `classic` (= defaults); explicit override block
 *   for `manuscript` (Roboto, black flat headings, looser leading).
 */
export const STYLE_PRESETS: Record<StylePresetId, Partial<PdfSettings>> = {
  // The current defaults — blue brand accent, condensed family,
  // underlined headings, justified body. Named here only so the
  // compare layout can address it by id.
  classic: {},

  // Clean manuscript look: non-condensed Roboto throughout, black
  // headings without the underline, looser leading and paragraph
  // spacing, ragged-right body. Same source, very different vibe.
  manuscript: {
    fonts: {
      headings: 'Roboto',
      body: 'Roboto',
      code: 'Roboto Mono',
    },
    styles: {
      ...DEFAULT_SETTINGS.styles,
      h1: {
        fontSize: 30,
        color: '#111111',
        underline: false,
        italic: false,
        weight: 700,
        align: 'center',
        marginAbove: 1.8,
        marginBelow: 0.6,
      },
      h2: {
        fontSize: 22,
        color: '#111111',
        underline: false,
        italic: false,
        weight: 600,
        align: 'left',
        marginAbove: 1.8,
        marginBelow: 0.6,
      },
      h3: {
        fontSize: 16,
        color: '#333333',
        underline: false,
        italic: false,
        weight: 600,
        align: 'left',
        marginAbove: 1.8,
        marginBelow: 0.6,
      },
      h4: {
        fontSize: 14,
        color: '#333333',
        underline: false,
        italic: false,
        weight: 500,
        align: 'left',
        marginAbove: 1.8,
        marginBelow: 0.6,
      },
      body: {
        fontSize: 11,
        color: '#1a1a1a',
        align: 'left',
        lineHeight: 1.45,
        marginAbove: 1.3,
        marginBelow: 1.3,
      },
      'code-inline': { fontSize: 10, color: '#1f2328' },
      'code-block': {
        ...DEFAULT_SETTINGS.styles['code-block'],
        fontSize: 10,
        color: '#1f2328',
      },
      quote: {
        ...DEFAULT_SETTINGS.styles.quote,
        fontSize: 11,
        color: '#57606a',
      },
    },
  },
};

/**
 * Purpose: Overlay a preset on top of a base settings object.
 * How: Spread `preset` over `base`, then re-merge each nested record
 *   (margins, fonts, styles) one level deep.
 */
export function applyStylePreset(
  base: PdfSettings,
  presetId: string | null,
): PdfSettings {
  if (!presetId) return base;
  const preset = STYLE_PRESETS[presetId as StylePresetId];
  if (!preset) return base;
  return {
    ...base,
    ...preset,
    margins: { ...base.margins, ...(preset.margins ?? {}) },
    fonts: { ...base.fonts, ...(preset.fonts ?? {}) },
    styles: preset.styles
      ? { ...base.styles, ...preset.styles }
      : base.styles,
  };
}

// Re-export the default for callers that just want it without
// pulling in the `settings` module too.
export { DEFAULT_SETTINGS };
