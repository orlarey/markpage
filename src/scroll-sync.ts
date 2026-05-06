import type { EditorView } from '@codemirror/view';

// Time window during which scroll events on the "target" view are treated as
// programmatic echoes from a previous sync, and so are ignored to avoid the
// editor and the preview fighting each other.
const FEEDBACK_GUARD_MS = 80;

export function setupScrollSync(
  view: EditorView,
  previewEl: HTMLElement,
): void {
  let lastSync = 0;

  const onEditorScroll = (): void => {
    if (Date.now() - lastSync < FEEDBACK_GUARD_MS) return;
    lastSync = Date.now();
    syncEditorToPreview(view, previewEl);
  };

  const onPreviewScroll = (): void => {
    if (Date.now() - lastSync < FEEDBACK_GUARD_MS) return;
    lastSync = Date.now();
    syncPreviewToEditor(previewEl, view);
  };

  view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true });
  previewEl.addEventListener('scroll', onPreviewScroll, { passive: true });
}

interface AnchorPair {
  prev: { line: number; offset: number };
  next: { line: number; offset: number } | null;
}

// Picks the two `[data-line]` anchors in `previewEl` that bracket `line`,
// returning their offsets relative to the preview pane (so the caller can
// interpolate). `next` is null if `line` is past the last anchor.
function anchorsForLine(
  previewEl: HTMLElement,
  line: number,
): AnchorPair | null {
  const anchors = previewEl.querySelectorAll<HTMLElement>('[data-line]');
  if (anchors.length === 0) return null;
  const previewTop = previewEl.getBoundingClientRect().top;
  const scrollTop = previewEl.scrollTop;
  let prev: AnchorPair['prev'] | null = null;
  let next: AnchorPair['next'] = null;
  for (const a of anchors) {
    const elLine = Number(a.dataset.line);
    const offset = a.getBoundingClientRect().top - previewTop + scrollTop;
    if (elLine <= line) prev = { line: elLine, offset };
    else {
      next = { line: elLine, offset };
      break;
    }
  }
  if (!prev) return { prev: { line: 0, offset: 0 }, next };
  return { prev, next };
}

function syncEditorToPreview(view: EditorView, previewEl: HTMLElement): void {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
  const editorLine = view.state.doc.lineAt(block.from).number - 1;

  const pair = anchorsForLine(previewEl, editorLine);
  if (!pair) return;

  if (!pair.next) {
    previewEl.scrollTop = pair.prev.offset;
    return;
  }
  const span = pair.next.line - pair.prev.line;
  const fraction = span <= 0 ? 0 : (editorLine - pair.prev.line) / span;
  const target =
    pair.prev.offset + fraction * (pair.next.offset - pair.prev.offset);
  previewEl.scrollTop = target;
}

function syncPreviewToEditor(previewEl: HTMLElement, view: EditorView): void {
  const anchors = previewEl.querySelectorAll<HTMLElement>('[data-line]');
  if (anchors.length === 0) return;
  const previewTop = previewEl.getBoundingClientRect().top;
  const scrollTop = previewEl.scrollTop;
  let prev: { line: number; offset: number } | null = null;
  let next: { line: number; offset: number } | null = null;
  for (const a of anchors) {
    const offset = a.getBoundingClientRect().top - previewTop + scrollTop;
    const elLine = Number(a.dataset.line);
    if (offset <= scrollTop) prev = { line: elLine, offset };
    else {
      next = { line: elLine, offset };
      break;
    }
  }

  let line: number;
  if (!prev) {
    line = 0;
  } else if (!next) {
    line = prev.line;
  } else {
    const span = next.offset - prev.offset;
    const fraction = span <= 0 ? 0 : (scrollTop - prev.offset) / span;
    line = prev.line + fraction * (next.line - prev.line);
  }

  const totalLines = view.state.doc.lines;
  const target = Math.max(1, Math.min(totalLines, Math.floor(line) + 1));
  const docLine = view.state.doc.line(target);
  view.scrollDOM.scrollTop = view.lineBlockAt(docLine.from).top;
}
