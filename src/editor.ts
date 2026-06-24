/********************************* editor.ts ***********************************
 *
 * Purpose: Build the CodeMirror 6 editor instance: Markdown grammar, custom
 *   highlight, keymap for formatting shortcuts, gutter line selection, ligatures.
 * How: Assemble extensions on top of `basicSetup`, wire `updateListener` for
 *   change notifications, attach DOM listeners for gutter + image handlers.
 *
 *******************************************************************************/

import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentLess, indentMore, insertTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { attachImageHandlers, pickAndInsertImage } from './image';
import {
  insertLink,
  reformatTables,
  renumberHeadings,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  type HeadingLevel,
} from './editor-commands';
import { ligatures } from './editor-ligatures';

/**
 * Purpose: Adapt a `(view) => void` formatter into a CodeMirror keybinding.
 * How: Returns a `run` callback that invokes `fn` then signals "handled".
 */
function runWithView(fn: (v: EditorView) => void) {
  return (view: EditorView): boolean => {
    fn(view);
    return true;
  };
}

// Markdown formatting shortcuts. Bound at high precedence so they win over
// the default keymap when there's overlap. `Mod-` resolves to ⌘ on macOS
// and Ctrl on Windows / Linux.
const formatKeymap = Prec.high(
  keymap.of([
    { key: 'Mod-b', run: runWithView(toggleBold) },
    { key: 'Mod-i', run: runWithView(toggleItalic) },
    { key: 'Mod-e', run: runWithView(toggleInlineCode) },
    { key: 'Mod-k', run: runWithView(insertLink) },
    ...([0, 1, 2, 3, 4] as const).map((n) => ({
      key: `Mod-${n}`,
      run: runWithView((v) => setHeading(v, n as HeadingLevel)),
    })),
    { key: 'Mod-Shift-l', run: runWithView(toggleBulletList) },
    { key: 'Mod-Shift-o', run: runWithView(toggleNumberedList) },
    { key: 'Mod-Shift-q', run: runWithView(toggleBlockquote) },
    { key: 'Mod-Alt-i', run: runWithView(pickAndInsertImage) },
    { key: 'Mod-Shift-n', run: runWithView(renumberHeadings) },
    { key: 'Mod-Shift-t', run: runWithView(reformatTables) },
  ]),
);

/**
 * Purpose: Select whole-line ranges from gutter click/drag, including the
 *   trailing newline so delete / cut leave no empty line behind.
 * How: Convert anchor/head line numbers to `from` / past-EOL offsets,
 *   clamped to doc length (the file's last line has no trailing \n).
 */
// Selecting whole lines from the gutter: clicking a line number selects
// that line; dragging extends the selection. The end of the selection
// (i.e. the higher position in the document) lands at `line.to + 1` —
// just past the trailing newline of the last selected line — so:
//   - Delete / cut remove the line completely; the line below shifts up
//     to fill the gap, no empty line is left behind.
//   - Toggle bold / italic still wrap only the line's text content,
//     because `lineSegment` in editor-commands.ts clamps each per-line
//     wrap segment to `Math.min(line.to, rangeTo)` — the trailing \n is
//     intersected away.
function selectLineRange(
  view: EditorView,
  anchorLine: number,
  headLine: number,
): void {
  const doc = view.state.doc;
  const aLine = doc.line(anchorLine);
  const hLine = doc.line(headLine);
  const pastEol = (line: { to: number }): number =>
    Math.min(line.to + 1, doc.length);
  const anchor = anchorLine <= headLine ? aLine.from : pastEol(aLine);
  const head = anchorLine <= headLine ? pastEol(hLine) : hLine.from;
  view.dispatch({ selection: { anchor, head } });
}

/**
 * Purpose: Wire gutter-line-number clicks to whole-line selection (with drag-to-extend).
 * How: Listen on `view.dom` (the gutter lives outside `contentDOM`); track mousemove/up.
 */
// Listener registered directly on the editor root: EditorView.domEventHandlers
// only sees events on the content DOM, not on the gutters, so we'd never get
// called when clicking a line number.
function attachGutterSelection(view: EditorView): void {
  view.dom.addEventListener('mousedown', (e) => {
    const gutterItem = e
      .composedPath()
      .find(
        (n): n is Element =>
          n instanceof Element && n.classList.contains('cm-gutterElement'),
      );
    if (!gutterItem?.closest('.cm-lineNumbers')) return;

    e.preventDefault();

    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
    if (pos === null) return;
    const startLine = view.state.doc.lineAt(pos).number;

    selectLineRange(view, startLine, startLine);
    view.focus();

    const onMove = (ev: MouseEvent): void => {
      const p = view.posAtCoords({ x: ev.clientX, y: ev.clientY }, false);
      if (p === null) return;
      const line = view.state.doc.lineAt(p).number;
      selectLineRange(view, startLine, line);
    };
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Custom highlight style: render Markdown emphasis the way the prose actually
// looks — bold for **strong**, italic for *emphasis*, with the surrounding
// `*` / `**` markers dimmed so they read as typographic punctuation rather
// than visual noise. Headings keep their weight (matched to Roboto Medium
// 500, our "bold" everywhere else) but drop the default underline.
const headingStyle = { fontWeight: '500', textDecoration: 'none' };
const editorHighlight = HighlightStyle.define([
  { tag: tags.heading, ...headingStyle },
  { tag: tags.heading1, ...headingStyle },
  { tag: tags.heading2, ...headingStyle },
  { tag: tags.heading3, ...headingStyle },
  { tag: tags.heading4, ...headingStyle },
  { tag: tags.heading5, ...headingStyle },
  { tag: tags.heading6, ...headingStyle },
  { tag: tags.strong, fontWeight: '500' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.processingInstruction, opacity: '0.5' },
]);

/**
 * Purpose: Public handle returned by `createEditor` — view + getter/setter.
 * How: Exposes the underlying `EditorView` plus convenience accessors.
 */
export interface Editor {
  view: EditorView;
  getValue(): string;
  setValue(content: string): void;
}

/**
 * App-level actions bound *inside* the editor as well as on `window`. Firefox
 * does not bubble `Ctrl/Cmd`-combos (Enter, S, O, P, …) from CodeMirror's
 * contentEditable up to the window listener the way Chromium does, so the
 * global handler alone left every shortcut dead while the editor had focus.
 * Binding them in the keymap fixes that; the window handler's `defaultPrevented`
 * guard keeps them from firing twice. Fields are optional and read lazily, so
 * the caller can pass a holder it populates after these actions are defined.
 */
export interface EditorShortcuts {
  preview?(): void;
  present?(): void;
  save?(): void;
  open?(): void;
  exportPdf?(): void;
  settings?(): void;
  guides?(): void;
}

// Bind the app shortcuts at high precedence. Each `run` reads its action
// lazily (the holder is filled after the editor is built) and returns `true`
// when wired, so CodeMirror marks the event handled + preventDefault — which
// in turn trips the window handler's `defaultPrevented` early-return.
function appShortcutKeymap(s: EditorShortcuts) {
  const fire = (get: () => (() => void) | undefined) => (): boolean => {
    const fn = get();
    if (!fn) return false;
    fn();
    return true;
  };
  return Prec.high(
    keymap.of([
      { key: 'Mod-Enter', run: fire(() => s.preview) },
      { key: 'Mod-Shift-Enter', run: fire(() => s.present) },
      { key: 'Mod-s', run: fire(() => s.save) },
      { key: 'Mod-o', run: fire(() => s.open) },
      { key: 'Mod-p', run: fire(() => s.exportPdf) },
      { key: 'Mod-,', run: fire(() => s.settings) },
      { key: 'Mod-Shift-g', run: fire(() => s.guides) },
    ]),
  );
}

/**
 * Purpose: Construct a CodeMirror editor in `parent` and notify `onChange` on edits.
 * How: Compose extensions, attach gutter + image handlers, return the `Editor` handle.
 */
export function createEditor(
  parent: HTMLElement,
  initialDoc: string,
  onChange: (doc: string) => void,
  shortcuts?: EditorShortcuts,
): Editor {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        syntaxHighlighting(editorHighlight),
        formatKeymap,
        ...(shortcuts ? [appShortcutKeymap(shortcuts)] : []),
        ligatures,
        // Smart Tab. Without binding, the browser intercepts it for
        // focus traversal; with `indentWithTab` (the standard CM
        // helper), every Tab indents the line — annoying when typing
        // a TSV block. So:
        //   - empty / single-line selection → insert a literal `\t`
        //   - multi-line selection         → indent the lines
        //   - Shift-Tab                    → dedent the lines
        keymap.of([
          {
            key: 'Tab',
            preventDefault: true,
            run: (view) => {
              const state = view.state;
              const multiLine = state.selection.ranges.some(
                (r) =>
                  !r.empty &&
                  state.doc.lineAt(r.from).number !==
                    state.doc.lineAt(r.to).number,
              );
              return multiLine ? indentMore(view) : insertTab(view);
            },
            shift: indentLess,
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
  });

  attachGutterSelection(view);
  attachImageHandlers(view);

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(content: string) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    },
  };
}
