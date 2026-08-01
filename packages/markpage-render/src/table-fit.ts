/******************************** table-fit.ts ********************************
 *
 * Purpose: Keep over-dense tables readable. A table with several prose columns
 *   squeezed into the text column wraps word-by-word into an unreadable mess.
 *   Instead of fragmenting or clipping, we let the table lay out at the wider
 *   width it naturally wants, then shrink the whole thing (CSS `zoom`, which
 *   reflows) so it fits the column again — an automatic "zoom out", per table.
 * How: Measure each table's max-content width at the final text width; if it
 *   overflows, render it at `min(natural, textWidth / minScale)` and zoom it
 *   down to fit. `minScale` is a readability floor: below it we stop shrinking
 *   and let the table wrap a little rather than becoming microscopic. Uniform
 *   scaling preserves the column proportions the author intended.
 *
 ****************************************************************************/

/** Readability floor — a table is never zoomed smaller than this. */
export const DEFAULT_MIN_TABLE_SCALE = 0.6;

export interface TableFitResult {
  element: HTMLTableElement;
  /** Applied zoom factor (1 = untouched). */
  scale: number;
  /** The table's natural (max-content) width in px, at the text width. */
  natural: number;
}

export interface TableFitOptions {
  minScale?: number;
  onWarning?: (result: TableFitResult) => void;
}

/**
 * Zoom factor for a table of `natural` width to fit `textWidthPx`, clamped to
 * `[minScale, 1]`. 1 means it already fits (no zoom); the floor caps how small
 * a very dense table is allowed to get. Pure — the unit-testable core.
 */
export function tableFitScale(
  natural: number,
  textWidthPx: number,
  minScale = DEFAULT_MIN_TABLE_SCALE,
): number {
  if (!(natural > 0) || !(textWidthPx > 0)) return 1;
  if (natural <= textWidthPx) return 1;
  return Math.max(minScale, Math.min(1, textWidthPx / natural));
}

/** Clear any fit this pass applied before (keeps the pass idempotent). */
function resetTable(table: HTMLTableElement): void {
  table.style.removeProperty('width');
  table.style.removeProperty('max-width');
  table.style.removeProperty('zoom');
  delete table.dataset.mpTableScale;
}

/**
 * Zoom-out over-wide tables so they fit `textWidthPx`, down to a floor.
 * `root` must be mounted and styled at the final text width when called.
 */
export function fitWideTables(
  root: HTMLElement,
  textWidthPx: number,
  options: TableFitOptions = {},
): TableFitResult[] {
  const minScale = options.minScale ?? DEFAULT_MIN_TABLE_SCALE;
  const results: TableFitResult[] = [];
  if (!(textWidthPx > 0)) return results;

  for (const table of root.querySelectorAll<HTMLTableElement>('table')) {
    // A table living inside an already-scaled atomic block (or a nested table
    // we just fitted) is handled by that outer scale — don't compound it.
    if (
      table.parentElement?.closest('.mp-atomic-fitted, [data-mp-table-scale]')
    ) {
      continue;
    }
    resetTable(table);

    // Natural width = what the table wants with cells free to size to content.
    table.style.width = 'max-content';
    table.style.maxWidth = 'none';
    const natural = table.getBoundingClientRect().width;
    // A ~1px slack avoids re-fitting a table that already fits exactly.
    if (!(natural > textWidthPx + 1)) {
      resetTable(table);
      continue;
    }

    const scale = tableFitScale(natural, textWidthPx, minScale);
    // Render width the table lays out at BEFORE the zoom; the zoom then brings
    // it back to the text column. `min(natural, textWidth/minScale)` means: use
    // the true natural width when the fit stays above the floor, otherwise cap
    // the expansion at the floor and let the extra density wrap.
    const renderWidth = textWidthPx / scale;
    table.style.width = `${renderWidth}px`;
    table.style.maxWidth = 'none';
    table.style.zoom = String(scale);
    table.dataset.mpTableScale = scale.toFixed(4);

    const result: TableFitResult = { element: table, scale, natural };
    results.push(result);
    options.onWarning?.(result);
  }
  return results;
}
