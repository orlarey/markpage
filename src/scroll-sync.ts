import { EditorView } from '@codemirror/view';

// Anchor-based view synchronisation. Used to transit cursor position
// between the editor and the (paginated) preview when the user toggles
// between the two single-pane views.
//
// An "anchor" is a (sourceLine, viewportY) pair: which source-doc line
// to align, and at what vertical position in the target's viewport.
// editor → preview: snapshot the cursor's line and its viewport y;
// applying that anchor to the preview puts the same line at the same y.
// preview → editor: same, but using the click target's data-line and
// the click's y within the preview viewport.

export interface Anchor {
  line: number; // 0-indexed source line
  y: number; // pixels from the top of the target's viewport
}

interface LineEntry {
  line: number;
  previewY: number;
}

// Editor scroller Y at which the given source line starts (0-indexed).
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

// Walks the preview DOM once to build a sorted line→Y table.
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

// Returns the cursor's (line, viewportY) in the editor, or null if the
// view isn't ready (e.g., layout hasn't been measured).
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

// Returns the (line, viewportY) of a click in the preview, looking up
// the closest ancestor with `data-line`. Null if the click landed
// outside any annotated block (e.g., on page padding).
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

// Scrolls the preview so the given line lands at the given viewport y.
// Clamps to the scrollable range. No-op if there's no [data-line] map.
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

// Places the editor cursor at the start of the given line and scrolls
// the editor so that line lands at the given viewport y. Returns true
// on success.
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
