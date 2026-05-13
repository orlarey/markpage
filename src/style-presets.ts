// Curated PdfSettings overrides used by the showcase's "compare
// stylings" segment. `demo.ts` looks up a preset by id (`?style=<id>`
// in the URL) and merges it over `DEFAULT_SETTINGS`, so the iframe
// renders the same markdown source through two visually distinct
// presets side by side.
//
// Each preset is a `Partial<PdfSettings>` — only the fields that
// differ from the default need to be specified. Nested objects
// (`fonts`, `styles`, `margins`, …) are merged one level deep by
// `applyStylePreset` below.

import { DEFAULT_SETTINGS, type PdfSettings } from './settings';

export type StylePresetId = 'classic' | 'manuscript';

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
      h1: {
        fontSize: 30,
        color: '#111111',
        underline: false,
        italic: false,
        weight: 700,
      },
      h2: {
        fontSize: 22,
        color: '#111111',
        underline: false,
        italic: false,
        weight: 600,
      },
      h3: {
        fontSize: 16,
        color: '#333333',
        underline: false,
        italic: false,
        weight: 600,
      },
      h4: {
        fontSize: 14,
        color: '#333333',
        underline: false,
        italic: false,
        weight: 500,
      },
      body: { fontSize: 11, color: '#1a1a1a' },
      code: { fontSize: 10, color: '#1f2328' },
      quote: { fontSize: 11, color: '#57606a', barColor: '#d0d7de' },
    },
    headingSpacing: { above: 1.8, below: 0.6 },
    paragraphSpacing: 1.3,
    lineHeight: 1.45,
    justify: false,
  },
};

// Deep-merges a preset over a base settings, one level into the
// nested objects we know about. Anything the preset doesn't mention
// is taken from `base`.
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
    headingSpacing: {
      ...base.headingSpacing,
      ...(preset.headingSpacing ?? {}),
    },
    pageNumber: {
      ...base.pageNumber,
      ...(preset.pageNumber ?? {}),
    },
  };
}

// Re-export the default for callers that just want it without
// pulling in the `settings` module too.
export { DEFAULT_SETTINGS };
