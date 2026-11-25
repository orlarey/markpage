/******************************** table-fit.ts ********************************
 *
 * Purpose: Keep over-dense tables readable. A table with several prose columns
 *   squeezed into the text column wraps word-by-word into an unreadable mess;
 *   shrunk too far, it becomes microscopic. Between the two, a table is zoomed
 *   out (CSS `zoom`, which reflows) only as much as it needs to give each
 *   column a comfortable width, and never below a readability floor.
 * How: Measure each table at the final text width, twice: cells free to size
 *   to content (max-content) and as narrow as their longest word allows
 *   (min-content). The comfortable width gives every column its natural width
 *   up to `comfortEm` em, and never less than its longest word: prose columns
 *   are expected to wrap, short columns keep their natural width. If the
 *   comfortable width fits the column, the table is left alone (it wraps);
 *   otherwise it is rendered at `textWidth / scale` and zoomed by `scale`,
 *   clamped to `minScale`. Uniform scaling preserves the column proportions.
 *
 *   The old criterion compared the max-content width — a prose cell on a
 *   single line — with the text width, so nearly every table holding prose
 *   fell to the floor (0.6, i.e. ~5.7 pt for a 10 pt body) even when wrapping
 *   would have fit it at full size.
 *
 *   Numeric cells (digits, units, percentages) never wrap, and cells are not
 *   hyphenated: a number cut in two, or "lis-seurs" in a header, reads worse
 *   than a slightly taller table. See paginationCss (.mp-num, td/th hyphens).
 *
 ****************************************************************************/

/** Readability floor — a table is never zoomed smaller than this. */
export const DEFAULT_MIN_TABLE_SCALE = 0.8;

/** Comfortable width of a prose column, in em of the table's own font. */
export const DEFAULT_TABLE_COMFORT_EM = 12;

export interface TableFitResult {
  element: HTMLTableElement;
  /** Applied zoom factor (1 = untouched). */
  scale: number;
  /** The table's natural (max-content) width in px, at the text width. */
  natural: number;
  /** The table's comfortable width in px (see comfortableTableWidth). */
  comfortable: number;
}

export interface TableFitOptions {
  minScale?: number;
  comfortEm?: number;
  onWarning?: (result: TableFitResult) => void;
}

/**
 * Zoom factor for a table of comfortable width `comfortable` to fit
 * `textWidthPx`, clamped to `[minScale, 1]`. 1 means it fits (no zoom); the
 * floor caps how small a very dense table is allowed to get. Pure — the
 * unit-testable core.
 */
export function tableFitScale(
  comfortable: number,
  textWidthPx: number,
  minScale = DEFAULT_MIN_TABLE_SCALE,
): number {
  if (!(comfortable > 0) || !(textWidthPx > 0)) return 1;
  if (comfortable <= textWidthPx) return 1;
  return Math.max(minScale, Math.min(1, textWidthPx / comfortable));
}

/**
 * Comfortable width of a table: each column gets its max-content width up to
 * `capPx`, and never less than its min-content width (its longest word);
 * `chromePx` (borders, spacing) is added once. Pure.
 */
export function comfortableTableWidth(
  maxCols: readonly number[],
  minCols: readonly number[],
  capPx: number,
  chromePx = 0,
): number {
  let sum = 0;
  maxCols.forEach((mx, j) => {
    sum += Math.max(minCols[j] ?? 0, Math.min(mx, capPx));
  });
  return sum + Math.max(0, chromePx);
}

/** A cell holding only a number, a percentage, a ratio or a short range. */
const NUMERIC_CELL = /^(?=.*\d)[\d\s.,%()×:/≈~<>±+\-−–]+$/;

/** A cell kept on one line: a number, or a short quantity ("0,6 s", "3 sur 7"). */
export function isNumericCell(text: string): boolean {
  const t = text.trim();
  return NUMERIC_CELL.test(t) || (t.length <= 12 && /\d/.test(t));
}

/** Clear any fit this pass applied before (keeps the pass idempotent). */
function resetTable(table: HTMLTableElement): void {
  table.style.removeProperty('width');
  table.style.removeProperty('max-width');
  table.style.removeProperty('zoom');
  delete table.dataset.mpTableScale;
}

/** The row with the most cells: its cells' widths are the column widths. */
function widestRow(table: HTMLTableElement): HTMLTableRowElement | undefined {
  let best: HTMLTableRowElement | undefined;
  for (const row of table.rows) {
    if (!best || row.cells.length > best.cells.length) best = row;
  }
  return best;
}

/** Table and column widths with the table laid out at `mode`. */
function measure(
  table: HTMLTableElement,
  mode: 'max-content' | 'min-content',
): { width: number; cols: number[] } {
  table.style.width = mode;
  table.style.maxWidth = 'none';
  const row = widestRow(table);
  return {
    width: table.getBoundingClientRect().width,
    cols: row ? [...row.cells].map((c) => c.getBoundingClientRect().width) : [],
  };
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
  const comfortEm = options.comfortEm ?? DEFAULT_TABLE_COMFORT_EM;
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
    for (const cell of table.querySelectorAll('td')) {
      cell.classList.toggle('mp-num', isNumericCell(cell.textContent ?? ''));
    }

    const max = measure(table, 'max-content');
    // A ~1px slack avoids re-fitting a table that already fits exactly.
    if (!(max.width > textWidthPx + 1)) {
      resetTable(table);
      continue;
    }
    const min = measure(table, 'min-content');
    const sample = table.querySelector('td, th') ?? table;
    const view = table.ownerDocument.defaultView;
    const em = Number.parseFloat(view?.getComputedStyle(sample).fontSize ?? '') || 16;
    const chrome = max.width - max.cols.reduce((s, w) => s + w, 0);
    const comfortable = comfortableTableWidth(max.cols, min.cols, comfortEm * em, chrome);

    const scale = tableFitScale(comfortable, textWidthPx, minScale);
    if (scale >= 0.999) {
      // Fits once its prose columns wrap: leave it at full size.
      resetTable(table);
      continue;
    }
    // Lay out at the width the zoom brings back to the text column.
    table.style.width = `${textWidthPx / scale}px`;
    table.style.maxWidth = 'none';
    table.style.zoom = String(scale);
    table.dataset.mpTableScale = scale.toFixed(4);

    const result: TableFitResult = {
      element: table,
      scale,
      natural: max.width,
      comfortable,
    };
    results.push(result);
    options.onWarning?.(result);
  }
  return results;
}
