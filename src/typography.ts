/********************************* typography.ts ******************************
 *
 * Purpose: Numeric helpers behind the §9.6 live-area canon — average
 *   character width measurement (canvas-based) and the canonical margin
 *   computation that reduces a chosen `measureChars` value to a full
 *   margin quadruple via Van de Graaf's diagonal geometry.
 *
 *   Used by `pagedCss(s)` in `preview-paginated.ts` when
 *   `s.marginMode === 'derived'`, and by future Sub-phase D code that
 *   needs to know where the live area sits on the page (for header /
 *   footer band placement).
 *
 *   Kept side-effect free as much as possible so the formulas are
 *   straightforward to unit-test under vitest / happy-dom — the canvas
 *   measurement gracefully falls back to the typographic heuristic
 *   `0.5 em` when no DOM is available.
 *
 *******************************************************************************/

const PT_TO_MM = 0.3528;
const PX_TO_MM = 25.4 / 96;

/** Sample string used to compute an average glyph width. ASCII lowercase
 *  is a fair proxy for the body-text mean — it includes the narrow
 *  letters (i, l, t) and the wider ones (m, w) in their natural
 *  frequencies. */
const SAMPLE_TEXT = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Purpose: Measure the mean glyph width of `fontFamily` rendered at
 *   `fontSizePt`, returning a value in millimetres.
 * How: Use a hidden `<canvas>` 2D context to measure `SAMPLE_TEXT` and
 *   divide by its length. Falls back to `0.5 × fontSizePt` (the
 *   typographic heuristic for most serif body fonts) when no DOM is
 *   available — happy-dom doesn't ship a canvas, and the formula is a
 *   first-order approximation good to ~5 %.
 *   The font is requested with a `, serif` fallback so the measurement
 *   still returns something useful when the requested family hasn't
 *   loaded yet (the first preview render before web fonts arrive).
 */
export function measureAverageCharWidth(
  fontFamily: string,
  fontSizePt: number,
): number {
  if (typeof document === 'undefined') {
    return 0.5 * fontSizePt * PT_TO_MM;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0.5 * fontSizePt * PT_TO_MM;
  const fontSizePx = fontSizePt * (96 / 72);
  ctx.font = `${fontSizePx}px ${fontFamily}, serif`;
  const widthPx = ctx.measureText(SAMPLE_TEXT).width;
  const meanPx = widthPx / SAMPLE_TEXT.length;
  return meanPx * PX_TO_MM;
}

/**
 * Purpose: Margins of one of the two nested canonical rectangles
 *   introduced by SPEC §9.6, expressed in mm in the spread-aware
 *   `inner / outer` convention.
 * How:
 *   - `top` / `bottom` are physical (page top / bottom margins).
 *   - `inner` is the spine-side margin; on a recto page that is the
 *     LEFT margin, on a verso page it is the RIGHT one.
 *   - `outer` is the trim-side margin (the mirror of `inner`).
 *   - `width` and `height` complete the rectangle so callers can use
 *     them directly without re-doing the subtraction.
 */
export interface CanonicalMargins {
  top: number;
  bottom: number;
  inner: number;
  outer: number;
  width: number;
  height: number;
}

/**
 * Purpose: Compute the canonical Van de Graaf margins for a rectangle
 *   of textual content of width `measureChars × charWidthMm`, placed
 *   on a page of dimensions `pageWidthMm × pageHeightMm`. Returns the
 *   four margins plus the rectangle's own width / height.
 * How: Direct application of the diagonal-derived formulas of §9.6.4 —
 *   text block similar to the page, corners on the spread / page-
 *   internal diagonals. The ratios fall out as inner:outer = 1:2 and
 *   top:bottom = 1:2. Clamps negative margins to zero in the edge
 *   case where `measureChars × charWidthMm >= pageWidthMm` (defensive
 *   only — the settings validator caps `measureChars` well below
 *   this).
 */
export function computeCanonicalMargins(
  pageWidthMm: number,
  pageHeightMm: number,
  measureChars: number,
  charWidthMm: number,
): CanonicalMargins {
  const textWidth = Math.min(measureChars * charWidthMm, pageWidthMm);
  const textHeight = textWidth * (pageHeightMm / pageWidthMm);
  const hMargins = Math.max(0, pageWidthMm - textWidth);
  const vMargins = Math.max(0, pageHeightMm - textHeight);
  return {
    top: vMargins / 3,
    bottom: (2 * vMargins) / 3,
    inner: hMargins / 3,
    outer: (2 * hMargins) / 3,
    width: textWidth,
    height: textHeight,
  };
}

/**
 * The terminal, resolved page geometry — a *fundamental* setting
 * (docs/FUNDAMENTAL-SETTINGS.md §1, "Résolution 2d"). In mm. Produced by the
 * canon (or the manual pass-through) in the prep layer and consumed verbatim by
 * the render, which never sees the production inputs (marginMode / measureChars
 * / liveAreaChars / margins).
 *   text     — the prose rectangle (spine-aware margins + its own width/height)
 *   running  — horizontal anchors of the header/footer band (= live-area sides)
 *   header   — distance from the page TOP to the header band
 *   footer   — distance from the page BOTTOM to the footer band
 *   sidenote — outer-margin note geometry (gap to the text + column width)
 * The render derives the canonical banding from the geometry itself: bands
 * apply iff `header.top < text.top`; the sidenote column exists iff the outer
 * gutter (`text.outer − running.outer`) is positive.
 */
export interface PageGeometry {
  text: CanonicalMargins;
  running: { inner: number; outer: number };
  header: { top: number };
  footer: { bottom: number };
  sidenote: { gap: number; width: number };
}

/**
 * A single-sided document has no spine: its text and live-area rectangles must
 * be horizontally centred. The classical 1:2 inner/outer canon remains
 * meaningful only for facing pages, where it is mirrored on verso. Width and
 * vertical geometry stay unchanged.
 */
export function centerCanonicalHorizontally(
  canon: CanonicalMargins,
  duplex: boolean,
): CanonicalMargins {
  if (duplex) return canon;
  const side = (canon.inner + canon.outer) / 2;
  return { ...canon, inner: side, outer: side };
}
