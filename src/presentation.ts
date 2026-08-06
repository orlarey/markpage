/******************************* presentation.ts ******************************
 *
 * Purpose: Pure geometry for the fullscreen presentation (PDF-reader) mode —
 *   deciding single vs double page, pairing pages into book-style spreads, and
 *   placing them in the viewport. Kept DOM-free so it is unit-testable; main.ts
 *   does the actual class-toggling / transform-applying from these results.
 *
 *****************************************************************************/

/** A placed page: where to translate/scale it (px, transform-origin top-left). */
export interface PresentBox {
  pageIndex: number;
  x: number;
  y: number;
  scale: number;
}

/**
 * Purpose: Whether two pages side by side fill the viewport better than one.
 * How: A spread is worth it exactly when the two-wide layout is limited by
 *   HEIGHT, not width — i.e. two pages fit across without being narrower than a
 *   single page would be. Portrait A4 on a widescreen → true; a 16:9 slide →
 *   false (a spread would be squeezed).
 */
export function shouldSpread(
  pw: number,
  ph: number,
  winW: number,
  winH: number,
): boolean {
  if (pw <= 0 || ph <= 0) return false;
  return winW / (2 * pw) >= winH / ph;
}

/**
 * Purpose: Group page indices into the rows shown one at a time.
 * How: Single → one page per row. Double, duplex → the cover (page 1) is a
 *   right-hand page shown alone, then facing pairs 2-3, 4-5…; double, one-sided
 *   → simple pairs 1-2, 3-4… A trailing odd page occupies a row alone.
 */
export function presentRows(
  count: number,
  double: boolean,
  duplex: boolean,
): number[][] {
  if (count <= 0) return [];
  if (!double) return Array.from({ length: count }, (_, i) => [i]);
  const rows: number[][] = [];
  let i = 0;
  if (duplex) {
    rows.push([0]); // cover: right-hand page alone
    i = 1;
  }
  for (; i < count; i += 2) rows.push(i + 1 < count ? [i, i + 1] : [i]);
  return rows;
}

/**
 * Purpose: Which half of a spread a page sits in — 0 = left, 1 = right.
 * How: Duplex → recto pages (even index: the cover + every other) are right,
 *   verso pages (odd index) are left, matching how they face in print.
 *   One-sided → even indices left, odd right (simple 1-2, 3-4 pairing).
 */
export function presentColumn(i: number, duplex: boolean): 0 | 1 {
  if (duplex) return i % 2 === 0 ? 1 : 0;
  return i % 2 === 0 ? 0 : 1;
}

interface LayoutInput {
  pageCount: number;
  pw: number;
  ph: number;
  winW: number;
  winH: number;
  anchor: number; // page index of the current row's first page
  duplex: boolean;
}

/**
 * Purpose: Place the row that contains `anchor` — the visible page(s), scaled to
 *   fill the viewport keeping the aspect ratio (centred single, or two side by
 *   side for a spread).
 * How: Decide single/double from the geometry, build the rows, find the one for
 *   `anchor`, then compute each page's px position + scale. Returns the boxes,
 *   the (normalised) anchor and the total row count.
 */
export function presentLayout(input: LayoutInput): {
  boxes: PresentBox[];
  anchor: number;
  rowCount: number;
} {
  const { pageCount, pw, ph, winW, winH, duplex } = input;
  if (pageCount <= 0 || pw <= 0 || ph <= 0) {
    return { boxes: [], anchor: 0, rowCount: 0 };
  }
  const double = pageCount >= 2 && shouldSpread(pw, ph, winW, winH);
  const rows = presentRows(pageCount, double, duplex);
  let ri = rows.findIndex((r) => r.includes(input.anchor));
  if (ri < 0) ri = Math.max(0, Math.min(rows.length - 1, input.anchor));
  const row = rows[ri];
  if (!row) return { boxes: [], anchor: 0, rowCount: rows.length };

  const cols = double ? 2 : 1;
  const scale = Math.min(winW / (cols * pw), winH / ph);
  const startX = (winW - cols * pw * scale) / 2;
  const y = (winH - ph * scale) / 2;
  const boxes = row.map((pageIndex) => ({
    pageIndex,
    x: double ? startX + presentColumn(pageIndex, duplex) * pw * scale : startX,
    y,
    scale,
  }));
  return { boxes, anchor: row[0] as number, rowCount: rows.length };
}

/**
 * Purpose: The new anchor after moving `delta` rows (clamped to the ends).
 * How: Same row grouping as presentLayout; find the current row and step.
 */
export function presentStep(input: Omit<LayoutInput, 'anchor'> & {
  anchor: number;
  delta: number;
}): number {
  const { pageCount, pw, ph, winW, winH, duplex, anchor, delta } = input;
  if (pageCount <= 0 || pw <= 0 || ph <= 0) return 0;
  const double = pageCount >= 2 && shouldSpread(pw, ph, winW, winH);
  const rows = presentRows(pageCount, double, duplex);
  if (rows.length === 0) return 0;
  let ri = rows.findIndex((r) => r.includes(anchor));
  if (ri < 0) ri = 0;
  ri = Math.max(0, Math.min(rows.length - 1, ri + delta));
  return (rows[ri]?.[0] as number) ?? 0;
}
