/********************************* font-packs.ts *******************************
 *
 * Purpose: Coordinated quartets (headings + body + code + math font) so the
 *   user can switch to a coherent typography in one click instead of
 *   hand-picking each of the four slots.
 * How: Each pack names a familiar typographic family; the active pack is
 *   computed from the current `PdfSettings` (no extra persisted state), so
 *   editing a single slot just drops the user into the `custom` bucket.
 *
 *******************************************************************************/

import type { MathFontSet } from '@orlarey/markpage-render';
import type { FontTrio, PdfSettings } from './settings';

export type FontPackId = 'roboto-condensed' | 'fira' | 'stix2';

export interface FontPack {
  id: FontPackId;
  fonts: FontTrio;
  mathFontSet: MathFontSet;
}

/**
 * Purpose: Catalogue of pre-paired typography quartets.
 * How: One entry per `FontPackId`. Names must match `google-fonts-catalog.json`
 *   so the existing font-loader pipeline can fetch them on demand.
 */
export const FONT_PACKS: Record<FontPackId, FontPack> = {
  'roboto-condensed': {
    id: 'roboto-condensed',
    fonts: {
      headings: 'Roboto Condensed',
      body: 'Roboto Condensed',
      code: 'Roboto Mono',
    },
    mathFontSet: 'newcm',
  },
  fira: {
    id: 'fira',
    fonts: {
      headings: 'Fira Sans',
      body: 'Fira Sans',
      code: 'Fira Code',
    },
    mathFontSet: 'fira',
  },
  stix2: {
    id: 'stix2',
    fonts: {
      headings: 'STIX Two Text',
      body: 'STIX Two Text',
      code: 'Roboto Mono',
    },
    mathFontSet: 'stix2',
  },
};

export const FONT_PACK_IDS: FontPackId[] = ['roboto-condensed', 'fira', 'stix2'];

/**
 * Purpose: Identify which (if any) pack matches the current settings.
 * How: Linear scan; returns `null` if the user has hand-tweaked any slot
 *   away from every preset (so the dropdown shows "Personnalisé").
 */
export function detectActivePack(s: PdfSettings): FontPackId | null {
  for (const id of FONT_PACK_IDS) {
    const p = FONT_PACKS[id];
    if (
      s.fonts.headings === p.fonts.headings &&
      s.fonts.body === p.fonts.body &&
      s.fonts.code === p.fonts.code &&
      s.mathFontSet === p.mathFontSet
    ) {
      return id;
    }
  }
  return null;
}
