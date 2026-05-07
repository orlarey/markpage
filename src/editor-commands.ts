import {
  EditorSelection,
  type EditorState,
  type Line,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

const HEADING_PREFIX_RE = /^(#{1,6})\s+/;
const BULLET_PREFIX_RE = /^[-*]\s+/;
const NUMBERED_PREFIX_RE = /^\d+\.\s+/;
const QUOTE_PREFIX_RE = /^>\s+/;

export type HeadingLevel = 0 | 1 | 2 | 3 | 4;

export interface SelectionState {
  heading: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  bold: boolean;
  italic: boolean;
  code: boolean;
  bullet: boolean;
  numbered: boolean;
  quote: boolean;
}

// Inspects the cursor position to report which Markdown formats are
// currently in effect. Block-level marks (heading, list, quote) are read
// from the line's source text; inline marks (bold, italic, inline code) are
// resolved through the Lezer syntax tree, so they're detected even when
// nothing is selected — as long as the cursor sits inside the span.
export function getSelectionState(view: EditorView): SelectionState {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const text = line.text;

  const headingMatch = HEADING_PREFIX_RE.exec(text);
  const heading = (
    headingMatch ? Math.min(headingMatch[1]!.length, 6) : 0
  ) as SelectionState['heading'];

  let bold = false;
  let italic = false;
  let code = false;
  const tree = syntaxTree(state);
  for (
    let node: SyntaxNode | null = tree.resolveInner(pos, -1);
    node !== null;
    node = node.parent
  ) {
    if (node.name === 'StrongEmphasis') bold = true;
    else if (node.name === 'Emphasis') italic = true;
    else if (node.name === 'InlineCode') code = true;
  }

  return {
    heading,
    bold,
    italic,
    code,
    bullet: BULLET_PREFIX_RE.test(text),
    numbered: NUMBERED_PREFIX_RE.test(text),
    quote: QUOTE_PREFIX_RE.test(text),
  };
}

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
  toggleWrap(view, '**');
}

export function toggleItalic(view: EditorView): void {
  toggleWrap(view, '*');
}

export function toggleInlineCode(view: EditorView): void {
  toggleWrap(view, '`');
}

export function insertLink(view: EditorView): void {
  const url = globalThis.prompt('URL du lien :', 'https://');
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

// Markdown structural prefixes we want emphasis to skip over: ATX headings,
// bullet/numbered list markers, and blockquote markers.
const STRUCTURAL_PREFIX_RE =
  /^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/;

interface WrapSegment {
  from: number;
  to: number;
}

const LEADING_WS_RE = /^\s*/;
const TRAILING_WS_RE = /\s*$/;

// Builds a wrap-able segment from the intersection of a single line with the
// active range. Skips empty / whitespace-only intersections, trims leading
// and trailing whitespace, and steps over any Markdown structural prefix on
// the line if (and only if) the segment starts at the beginning of the line.
function lineSegment(
  state: EditorState,
  lineNum: number,
  rangeFrom: number,
  rangeTo: number,
): WrapSegment | null {
  const line = state.doc.line(lineNum);
  const lineFrom = Math.max(line.from, rangeFrom);
  const lineTo = Math.min(line.to, rangeTo);
  if (lineFrom >= lineTo) return null;
  const slice = state.sliceDoc(lineFrom, lineTo);
  const leading = LEADING_WS_RE.exec(slice)?.[0].length ?? 0;
  const trailing = TRAILING_WS_RE.exec(slice)?.[0].length ?? 0;
  let segFrom = lineFrom + leading;
  const segTo = lineTo - trailing;
  if (segFrom >= segTo) return null;
  if (segFrom === line.from) {
    const prefix = STRUCTURAL_PREFIX_RE.exec(line.text);
    if (prefix) {
      const prefixEnd = line.from + prefix[0].length;
      if (prefixEnd < segTo) segFrom = prefixEnd;
    }
  }
  return segFrom < segTo ? { from: segFrom, to: segTo } : null;
}

interface RangeLike {
  from: number;
  to: number;
  empty: boolean;
}

// Decomposes the given ranges into wrap-able segments, one per line that
// each range intersects. Returns segments in document order.
function buildSegments(
  state: EditorState,
  ranges: readonly RangeLike[],
): WrapSegment[] {
  const segments: WrapSegment[] = [];
  for (const range of ranges) {
    if (range.empty) continue;
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n += 1) {
      const seg = lineSegment(state, n, range.from, range.to);
      if (seg) segments.push(seg);
    }
  }
  return segments;
}

// Lezer node names for each emphasis marker in the @codemirror/lang-markdown
// grammar. When a cursor sits inside one of these nodes and the user toggles
// the corresponding format, we expand the cursor to cover the whole span so
// the toggle-off path kicks in.
const NODE_FOR_MARKER: Record<string, string | undefined> = {
  '**': 'StrongEmphasis',
  '*': 'Emphasis',
  '`': 'InlineCode',
};

function findEnclosingNode(
  state: EditorState,
  pos: number,
  nodeName: string,
): SyntaxNode | null {
  const tree = syntaxTree(state);
  for (
    let node: SyntaxNode | null = tree.resolveInner(pos, -1);
    node !== null;
    node = node.parent
  ) {
    if (node.name === nodeName) return node;
  }
  return null;
}

// If a cursor is empty AND sits inside an emphasis node matching `marker`,
// returns a range that covers the whole node (markers included). Otherwise
// returns the range unchanged.
function expandCursor(
  state: EditorState,
  range: RangeLike,
  marker: string,
): RangeLike {
  if (!range.empty) return range;
  const nodeName = NODE_FOR_MARKER[marker];
  if (!nodeName) return range;
  const node = findEnclosingNode(state, range.from, nodeName);
  return node ? { from: node.from, to: node.to, empty: false } : range;
}

// Wraps each selection segment with `marker` (e.g. '**' for bold). Empty
// cursors that happen to be inside a matching emphasis node are first
// expanded to cover the whole node, so toggling Bold while the caret is
// inside **bold** removes the emphasis. The toggle is global: if every
// segment is currently wrapped we unwrap them all, otherwise we wrap them
// all. Truly empty cursors (with no enclosing emphasis) are no-ops.
function toggleWrap(view: EditorView, marker: string): void {
  const { state } = view;
  const ranges = state.selection.ranges.map((r) => expandCursor(state, r, marker));
  const segments = buildSegments(state, ranges);
  if (segments.length === 0) return;

  const allWrapped = segments.every((seg) => {
    const text = state.sliceDoc(seg.from, seg.to);
    return (
      text.length >= marker.length * 2 &&
      text.startsWith(marker) &&
      text.endsWith(marker)
    );
  });

  const changes = segments.map((seg) => {
    const text = state.sliceDoc(seg.from, seg.to);
    return {
      from: seg.from,
      to: seg.to,
      insert: allWrapped
        ? text.slice(marker.length, text.length - marker.length)
        : `${marker}${text}${marker}`,
    };
  });

  view.dispatch({ changes });
  view.focus();
}
