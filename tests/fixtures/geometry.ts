import { DEFAULT_SETTINGS, type PageGeometry, type PdfSettings } from '../../src/settings';

/**
 * Resolved A4 page geometries with header/footer BANDS (the header/footer lines
 * sit outside the text block) and gutters (the text block is inset from the
 * band anchors) — the shape a style editor produces for a book-like layout.
 * Round numbers so the emitted CSS can be asserted exactly.
 */

/** Single-sided: centred text block (inner = outer), 18 mm gutters. */
export const BANDED_SIMPLEX: PageGeometry = {
  text: { top: 40, bottom: 76, inner: 42, outer: 42, width: 126, height: 181 },
  running: { inner: 24, outer: 24 },
  header: { top: 22 },
  footer: { bottom: 44 },
  sidenote: { gap: 3, width: 15 },
};

/** Facing pages: narrow inner / wide outer, gutters 12 mm (inner) and 24 mm
 *  (outer) — room for a sidenote column. */
export const BANDED_DUPLEX: PageGeometry = {
  text: { top: 40, bottom: 76, inner: 28, outer: 56, width: 126, height: 181 },
  running: { inner: 16, outer: 32 },
  header: { top: 22 },
  footer: { bottom: 44 },
  sidenote: { gap: 3, width: 21 },
};

/** DEFAULT_SETTINGS on a given geometry. */
export function withGeometry(
  pageGeometry: PageGeometry,
  over: Partial<PdfSettings> = {},
): PdfSettings {
  return { ...DEFAULT_SETTINGS, pageGeometry, ...over };
}
