import { EditorSelection, type Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const HEADING_PREFIX_RE = /^(#{1,6})\s+/;
const BULLET_PREFIX_RE = /^[-*]\s+/;
const NUMBERED_PREFIX_RE = /^\d+\.\s+/;
const QUOTE_PREFIX_RE = /^>\s+/;

export type HeadingLevel = 0 | 1 | 2 | 3 | 4;

export function setHeading(view: EditorView, level: HeadingLevel): void {
  transformLines(view, (line) => {
    const stripped = line.replace(HEADING_PREFIX_RE, '');
    return level === 0 ? stripped : `${'#'.repeat(level)} ${stripped}`;
  });
}

export function toggleBulletList(view: EditorView): void {
  transformLines(view, (line) => {
    if (BULLET_PREFIX_RE.test(line)) return line.replace(BULLET_PREFIX_RE, '');
    const stripped = line.replace(NUMBERED_PREFIX_RE, '');
    return `- ${stripped}`;
  });
}

export function toggleNumberedList(view: EditorView): void {
  transformLinesIndexed(view, (line, idx) => {
    if (NUMBERED_PREFIX_RE.test(line)) {
      return line.replace(NUMBERED_PREFIX_RE, '');
    }
    const stripped = line.replace(BULLET_PREFIX_RE, '');
    return `${idx + 1}. ${stripped}`;
  });
}

export function toggleBlockquote(view: EditorView): void {
  transformLines(view, (line) => {
    if (QUOTE_PREFIX_RE.test(line)) return line.replace(QUOTE_PREFIX_RE, '');
    return line === '' ? '> ' : `> ${line}`;
  });
}

export function toggleBold(view: EditorView): void {
  toggleWrap(view, '**', 'gras');
}

export function toggleItalic(view: EditorView): void {
  toggleWrap(view, '*', 'italique');
}

export function toggleInlineCode(view: EditorView): void {
  toggleWrap(view, '`', 'code');
}

export function insertLink(view: EditorView): void {
  const url = window.prompt('URL du lien :', 'https://');
  if (url === null || url.trim() === '') return;
  const { state } = view;
  const range = state.selection.main;
  const selectedText = state.sliceDoc(range.from, range.to);
  const text = selectedText === '' ? 'texte' : selectedText;
  const insert = `[${text}](${url})`;

  // After the change, place the caret/selection on the part the user is most
  // likely to want to edit next: the placeholder text if it was empty,
  // otherwise the URL portion.
  const textStart = range.from + 1;
  const textEnd = textStart + text.length;
  const urlStart = textEnd + 2;
  const urlEnd = urlStart + url.length;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection:
      selectedText === ''
        ? EditorSelection.range(textStart, textEnd)
        : EditorSelection.range(urlStart, urlEnd),
  });
  view.focus();
}

// ---- helpers ------------------------------------------------------------

function transformLines(view: EditorView, fn: (line: string) => string): void {
  const lines = uniqueLines(view);
  if (lines.length === 0) return;
  const changes = lines.map((line) => ({
    from: line.from,
    to: line.to,
    insert: fn(line.text),
  }));
  view.dispatch({ changes });
  view.focus();
}

function transformLinesIndexed(
  view: EditorView,
  fn: (line: string, index: number) => string,
): void {
  const lines = uniqueLines(view);
  if (lines.length === 0) return;
  const changes = lines.map((line, idx) => ({
    from: line.from,
    to: line.to,
    insert: fn(line.text, idx),
  }));
  view.dispatch({ changes });
  view.focus();
}

// All distinct lines covered by the current selection ranges, in document order.
function uniqueLines(view: EditorView): Line[] {
  const { state } = view;
  const seen = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    for (let n = startLine.number; n <= endLine.number; n++) {
      const line = state.doc.line(n);
      if (!seen.has(line.from)) seen.set(line.from, line);
    }
  }
  return [...seen.values()].sort((a, b) => a.from - b.from);
}

// Wraps each selection range with `marker` (e.g. '**' for bold). On empty
// ranges, inserts `marker + placeholder + marker` and selects the
// placeholder so the user can type to replace it. On already-wrapped text,
// removes the wrapping (toggle off).
function toggleWrap(
  view: EditorView,
  marker: string,
  placeholder: string,
): void {
  const { state } = view;
  const transaction = state.changeByRange((range) => {
    if (range.empty) {
      const insert = `${marker}${placeholder}${marker}`;
      const selStart = range.from + marker.length;
      return {
        changes: { from: range.from, insert },
        range: EditorSelection.range(selStart, selStart + placeholder.length),
      };
    }
    const text = state.sliceDoc(range.from, range.to);
    if (
      text.length >= marker.length * 2 &&
      text.startsWith(marker) &&
      text.endsWith(marker)
    ) {
      const inner = text.slice(marker.length, text.length - marker.length);
      return {
        changes: { from: range.from, to: range.to, insert: inner },
        range: EditorSelection.range(range.from, range.from + inner.length),
      };
    }
    return {
      changes: {
        from: range.from,
        to: range.to,
        insert: `${marker}${text}${marker}`,
      },
      range: EditorSelection.range(
        range.from + marker.length,
        range.from + marker.length + text.length,
      ),
    };
  });
  view.dispatch(transaction);
  view.focus();
}
