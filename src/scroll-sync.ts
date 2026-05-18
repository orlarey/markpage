/******************************** scroll-sync.ts *******************************
 *
 * Purpose: Anchor-based view synchronisation between the editor and the preview
 *   so toggling single-pane views preserves the user's reading position.
 * How: An "anchor" is a (sourceLine, viewportY) pair captured from one side
 *   and re-applied on the other via a sorted DOM line-map + linear interpolation.
 *
 *******************************************************************************/

import { EditorView } from '@codemirror/view';

/**
 * Purpose: A (sourceLine, viewportY) pair — what line lands at what y.
 * How: `line` is 0-indexed; `y` is pixels from the top of the target's viewport.
 */
export interface Anchor {
  line: number; // 0-indexed source line
  y: number; // pixels from the top of the target's viewport
}

interface LineEntry {
  line: number;
  previewY: number;
}

/**
 * Purpose: Editor scroller Y at which the given source line starts.
 * How: Clamp the 1-based line number, then `view.lineBlockAt(...).top`.
 */
function editorYForLine(view: EditorView, line: number): number | null {
  const docLines = view.state.doc.lines;
  const lineNum = Math.max(1, Math.min(docLines, Math.floor(line) + 1));
  try {
    const docLine = view.state.doc.line(lineNum);
    return view.lineBlockAt(docLine.from).top;
  } catch {
    return null;
  }
}

/**
 * Purpose: Walk the preview DOM once and build a sorted (line → Y) table.
 * How: Query `[data-line]`, compute Y relative to the preview's scroll origin.
 */
function readLineMap(previewEl: HTMLElement): LineEntry[] {
  const out: LineEntry[] = [];
  const previewRect = previewEl.getBoundingClientRect();
  const scrollTop = previewEl.scrollTop;
  for (const el of previewEl.querySelectorAll<HTMLElement>('[data-line]')) {
    const line = Number(el.dataset['line']);
    if (Number.isNaN(line)) continue;
    const previewY =
      el.getBoundingClientRect().top - previewRect.top + scrollTop;
    out.push({ line, previewY });
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}

/**
 * Purpose: Linearly interpolate a preview Y for an arbitrary source line.
 * How: `upperBoundLine` to bracket, then `t = (line - before)/(after - before)`.
 */
function lineToPreviewY(line: number, map: LineEntry[]): number {
  const idx = upperBoundLine(line, map);
  if (idx === 0) return map[0]?.previewY ?? 0;
  if (idx === map.length) return map.at(-1)?.previewY ?? 0;
  const before = map[idx - 1];
  const after = map[idx];
  if (!before || !after) return 0;
  if (after.line === before.line) return before.previewY;
  const t = (line - before.line) / (after.line - before.line);
  return before.previewY + t * (after.previewY - before.previewY);
}

/**
 * Purpose: First index whose `line` strictly exceeds `target`.
 * How: Standard binary upper-bound on the sorted line-map.
 */
function upperBoundLine(target: number, map: LineEntry[]): number {
  let lo = 0;
  let hi = map.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const entry = map[mid];
    if (entry && entry.line <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// --- Anchor reading -----------------------------------------------------

/**
 * Purpose: Snapshot the editor cursor's (line, viewportY).
 * How: Read `selection.main.head`, derive line + block top minus scrollTop.
 */
export function editorCursorAnchor(view: EditorView): Anchor | null {
  try {
    const head = view.state.selection.main.head;
    const block = view.lineBlockAt(head);
    const y = block.top - view.scrollDOM.scrollTop;
    const line = view.state.doc.lineAt(head).number - 1;
    return { line, y };
  } catch {
    return null;
  }
}

/**
 * Purpose: Snapshot the topmost line currently visible in the preview viewport.
 * How: First `[data-line]` whose top is at or below the viewport top, returned
 *   with its current y so the post-reflow restore lands it at the same spot.
 *   Used to preserve reading position across settings-driven re-renders.
 */
export function currentPreviewAnchor(previewEl: HTMLElement): Anchor | null {
  const previewRect = previewEl.getBoundingClientRect();
  let best: { line: number; y: number } | null = null;
  for (const el of previewEl.querySelectorAll<HTMLElement>('[data-line]')) {
    const line = Number(el.dataset['line']);
    if (Number.isNaN(line)) continue;
    const y = el.getBoundingClientRect().top - previewRect.top;
    if (y < 0) continue;
    if (best === null || y < best.y) best = { line, y };
  }
  return best;
}

/**
 * Purpose: Snapshot a preview click as (line, viewportY).
 * How: `closest('[data-line]')` then `clientY` relative to the preview rect.
 */
export function previewClickAnchor(
  e: MouseEvent,
  previewEl: HTMLElement,
): Anchor | null {
  const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
    '[data-line]',
  );
  if (!target) return null;
  const line = Number(target.dataset['line']);
  if (Number.isNaN(line)) return null;
  const previewRect = previewEl.getBoundingClientRect();
  const y = e.clientY - previewRect.top;
  return { line, y };
}

// --- Anchor application -------------------------------------------------

/**
 * Purpose: Scroll the preview so `anchor.line` lands at `anchor.y`.
 * How: Build the line-map, interpolate the target Y, clamp `scrollTop`.
 */
export function applyAnchorToPreview(
  previewEl: HTMLElement,
  anchor: Anchor,
): void {
  const map = readLineMap(previewEl);
  if (map.length === 0) return;
  const previewY = lineToPreviewY(anchor.line, map);
  const max = previewEl.scrollHeight - previewEl.clientHeight;
  previewEl.scrollTop = Math.max(0, Math.min(max, previewY - anchor.y));
}

/**
 * Purpose: Place the editor caret at `anchor.line` and scroll it to `anchor.y`.
 * How: Dispatch a selection, then offset `scrollDOM.scrollTop` by `editorY - y`.
 */
export function applyAnchorToEditor(
  view: EditorView,
  anchor: Anchor,
): boolean {
  const docLines = view.state.doc.lines;
  const lineNum = Math.max(1, Math.min(docLines, Math.floor(anchor.line) + 1));
  let docLine;
  try {
    docLine = view.state.doc.line(lineNum);
  } catch {
    return false;
  }
  view.dispatch({ selection: { anchor: docLine.from } });
  const editorY = editorYForLine(view, anchor.line);
  if (editorY === null) return false;
  const scroller = view.scrollDOM;
  const max = scroller.scrollHeight - scroller.clientHeight;
  scroller.scrollTop = Math.max(0, Math.min(max, editorY - anchor.y));
  return true;
}
