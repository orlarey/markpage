import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';

// Implements the editor ↔ preview synchronisation specified in SPEC §14.
// Core idea: any sync resolves to an "anchor" — a source line L paired
// with a viewport Y position y. The follower is scrolled so the same L
// appears at the same y.
//
//   • Click in either view at vertical y → anchor = clicked line, at y.
//   • Scroll downward → anchor = bottom-visible line, at viewportH.
//   • Scroll upward   → anchor = top-visible line, at 0.
//
// Edges fall out for free (top of doc → both at scrollTop=0; bottom of
// doc → both at scrollMax) without dedicated branches.

// Time the echo guard stays armed after a programmatic scroll, in ms.
// Long enough to swallow the immediate scroll event the browser fires,
// short enough that a quick user scroll right after isn't dropped.
const ECHO_GUARD_MS = 80;

interface LineEntry {
  line: number;
  previewY: number; // top of the data-line block in the preview scroller
}

type Direction = 'up' | 'down';

export function setupScrollSync(
  view: EditorView,
  previewEl: HTMLElement,
): void {
  let lastEditorTop = view.scrollDOM.scrollTop;
  let lastPreviewTop = previewEl.scrollTop;
  let editorEcho = 0;
  let previewEcho = 0;
  // Suppresses the cursor-change → preview-scroll path while we are
  // handling a click in the preview. Without it, dispatching a cursor
  // move from the preview-click handler would trigger the update
  // listener, which would scroll the preview right back — defeating
  // the rule "the clicked view stays still".
  let suppressCursorSync = 0;

  const setPreviewScroll = (top: number): void => {
    const max = previewEl.scrollHeight - previewEl.clientHeight;
    const clamped = Math.max(0, Math.min(max, top));
    if (Math.abs(clamped - previewEl.scrollTop) < 0.5) return;
    previewEcho = Date.now() + ECHO_GUARD_MS;
    previewEl.scrollTop = clamped;
    lastPreviewTop = clamped;
  };

  const setEditorScroll = (top: number): void => {
    const scroller = view.scrollDOM;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const clamped = Math.max(0, Math.min(max, top));
    if (Math.abs(clamped - scroller.scrollTop) < 0.5) return;
    editorEcho = Date.now() + ECHO_GUARD_MS;
    scroller.scrollTop = clamped;
    lastEditorTop = clamped;
  };

  // --- anchor reading -------------------------------------------------

  // Reads (line, y) from the editor's viewport. The probe Y is at the
  // top of the viewport for an upward scroll, at the bottom for a
  // downward one — but the anchor y returned is the *actual* y where
  // that line sits in the viewport, NOT the probe y. That matters
  // near the end of the document, where the bottom-most visible line
  // doesn't extend all the way to viewportH (there's trailing content
  // — page padding, page numbers, blank tail lines). Using the line's
  // actual position is what makes "scroll down" line up with "click on
  // the bottom line": the algorithm is the same in both cases.
  const editorScrollAnchor = (
    direction: Direction,
  ): { line: number; y: number } | null => {
    const scroller = view.scrollDOM;
    const probeY = direction === 'up' ? 0 : scroller.clientHeight;
    try {
      const block = view.lineBlockAtHeight(scroller.scrollTop + probeY);
      const line = view.state.doc.lineAt(block.from).number - 1;
      return { line, y: block.top - scroller.scrollTop };
    } catch {
      return null;
    }
  };

  // Same idea for the preview, using the data-line map.
  const previewScrollAnchor = (
    direction: Direction,
  ): { line: number; y: number } | null => {
    const map = readLineMap(previewEl);
    if (map.length === 0) return null;
    const probeY = direction === 'up' ? 0 : previewEl.clientHeight;
    const targetY = previewEl.scrollTop + probeY;
    const line = previewYToLine(targetY, map);
    const lineY = lineToPreviewY(line, map);
    return { line, y: lineY - previewEl.scrollTop };
  };

  // --- anchor application ---------------------------------------------

  const applyAnchorToPreview = (anchor: {
    line: number;
    y: number;
  }): void => {
    const map = readLineMap(previewEl);
    if (map.length === 0) return;
    const previewY = lineToPreviewY(anchor.line, map);
    setPreviewScroll(previewY - anchor.y);
  };

  const applyAnchorToEditor = (anchor: {
    line: number;
    y: number;
  }): void => {
    const editorY = editorYForLine(view, anchor.line);
    if (editorY === null) return;
    setEditorScroll(editorY - anchor.y);
  };

  // --- handlers -------------------------------------------------------

  const onEditorScroll = (): void => {
    if (Date.now() < editorEcho) return;
    const newTop = view.scrollDOM.scrollTop;
    if (newTop === lastEditorTop) return;
    const direction: Direction = newTop > lastEditorTop ? 'down' : 'up';
    lastEditorTop = newTop;
    // Edge snap: at scrollTop = 0, the user wants the preview's top.
    // At scrollTop = scrollMax, they want the preview's bottom. The
    // anchor-line + viewport-y formula doesn't reach the bottom by
    // itself because the preview has trailing content (page padding,
    // page numbers) that lives past the last data-line block.
    const editorMax =
      view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
    if (newTop <= 0) {
      setPreviewScroll(0);
      return;
    }
    if (newTop >= editorMax) {
      setPreviewScroll(previewEl.scrollHeight - previewEl.clientHeight);
      return;
    }
    const anchor = editorScrollAnchor(direction);
    if (anchor) applyAnchorToPreview(anchor);
  };

  const onPreviewScroll = (): void => {
    if (Date.now() < previewEcho) return;
    const newTop = previewEl.scrollTop;
    if (newTop === lastPreviewTop) return;
    const direction: Direction = newTop > lastPreviewTop ? 'down' : 'up';
    lastPreviewTop = newTop;
    const previewMax = previewEl.scrollHeight - previewEl.clientHeight;
    if (newTop <= 0) {
      setEditorScroll(0);
      return;
    }
    if (newTop >= previewMax) {
      setEditorScroll(
        view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight,
      );
      return;
    }
    const anchor = previewScrollAnchor(direction);
    if (anchor) applyAnchorToEditor(anchor);
  };

  // Click in the preview: place the editor cursor on the matching line
  // and align the editor so the line lands at the click's y.
  const onPreviewClick = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-line]',
    );
    if (!target) return;
    const line = Number(target.dataset['line']);
    if (Number.isNaN(line)) return;
    const previewRect = previewEl.getBoundingClientRect();
    const clickY = e.clientY - previewRect.top;
    const lineNum = Math.max(
      1,
      Math.min(view.state.doc.lines, Math.floor(line) + 1),
    );
    try {
      const docLine = view.state.doc.line(lineNum);
      // Block the cursor-change listener for this dispatch so the
      // preview doesn't scroll itself while we're aligning the editor.
      suppressCursorSync = Date.now() + ECHO_GUARD_MS;
      view.dispatch({ selection: { anchor: docLine.from } });
    } catch {
      return;
    }
    applyAnchorToEditor({ line, y: clickY });
  };

  // --- editor cursor → preview (via CM update listener) --------------
  //
  // We add the listener after the EditorView is already running by
  // dispatching a `StateEffect.appendConfig.of(...)` transaction; this
  // is the supported CM6 way of extending a live view.
  view.dispatch({
    effects: StateEffect.appendConfig.of([
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet) return;
        if (Date.now() < editorEcho) return;
        if (Date.now() < suppressCursorSync) return;
        const head = update.state.selection.main.head;
        try {
          const block = view.lineBlockAt(head);
          const editorScrollerY = block.top;
          const editorScrollTop = view.scrollDOM.scrollTop;
          const cursorViewportY = editorScrollerY - editorScrollTop;
          const line = update.state.doc.lineAt(head).number - 1;
          applyAnchorToPreview({ line, y: cursorViewportY });
        } catch {
          /* doc may be reflowing; skip this tick */
        }
      }),
    ]),
  });

  view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true });
  previewEl.addEventListener('scroll', onPreviewScroll, { passive: true });
  previewEl.addEventListener('click', onPreviewClick);
}

// --- helpers ----------------------------------------------------------

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

// Walks the preview DOM once to build a sorted line→Y table. Cheap on
// typical doc sizes (a few hundred entries); we recompute on every
// scroll event rather than maintain a cached version.
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

function previewYToLine(previewY: number, map: LineEntry[]): number {
  const idx = upperBoundY(previewY, map);
  if (idx === 0) return map[0]?.line ?? 0;
  if (idx === map.length) return map.at(-1)?.line ?? 0;
  const before = map[idx - 1];
  const after = map[idx];
  if (!before || !after) return 0;
  if (after.previewY === before.previewY) return before.line;
  const t = (previewY - before.previewY) / (after.previewY - before.previewY);
  return before.line + t * (after.line - before.line);
}

// First index whose `line` is strictly greater than `target`.
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

// First index whose `previewY` is strictly greater than `target`.
function upperBoundY(target: number, map: LineEntry[]): number {
  let lo = 0;
  let hi = map.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const entry = map[mid];
    if (entry && entry.previewY <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
