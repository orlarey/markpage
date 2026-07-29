/****************************** fundamental-style.ts **************************
 *
 * Export / import of the COMPLETE fundamental style (docs/FUNDAMENTAL-SETTINGS.md)
 * as a `markpage-style: |` YAML block-scalar in the document's front-matter.
 *
 * Unlike `markpage-profile` (a partial subset kept for the VS Code interop, read
 * back through the stack's explode machinery), this carries EVERY style field
 * and is applied DIRECTLY onto settings — so a round-trip is loss-free
 * (verified by tests/fundamental-style.test.ts). It's the self-contained,
 * engine-independent "style file", embedded in the doc.
 *
 *****************************************************************************/

import { embedBlockInFrontmatter, parseStackDoc } from '@orlarey/markpage-render';
import {
  serializeFundamentalStyle,
  applyFundamentalStyle,
  type FundamentalStyle,
  type PdfSettings,
} from './settings';

export const STYLE_KEY = 'markpage-style';

/** Write the complete fundamental style into `source`'s front-matter. */
export function exportFundamentalStyle(source: string, settings: PdfSettings): string {
  const json = JSON.stringify(serializeFundamentalStyle(settings));
  return embedBlockInFrontmatter(source, STYLE_KEY, json);
}

/** Read an embedded `markpage-style` block, if any. Tolerant: malformed → null. */
export function readFundamentalStyle(source: string): FundamentalStyle | null {
  const raw = parseStackDoc(source, '__leaf__').frontmatter.get(STYLE_KEY);
  if (raw === undefined) return null;
  try {
    const v: unknown = JSON.parse(raw.trim());
    return v !== null && typeof v === 'object' ? (v as FundamentalStyle) : null;
  } catch {
    return null;
  }
}

/** Apply the document's embedded fundamental style onto `base`; null if none. */
export function importFundamentalStyle(
  source: string,
  base: PdfSettings,
): PdfSettings | null {
  const fs = readFundamentalStyle(source);
  return fs ? applyFundamentalStyle(base, fs) : null;
}
