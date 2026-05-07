import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { attachImageHandlers } from './image';

// Selecting whole lines from the gutter: clicking a line number selects that
// line's content; dragging extends the selection over the range. We
// deliberately stop at the end of the line content (NOT including the
// trailing newline) so wrap commands like italic don't sandwich the line
// break, and so line-level commands don't accidentally also touch the next
// line via lineAt(range.to).
function selectLineRange(
  view: EditorView,
  anchorLine: number,
  headLine: number,
): void {
  const doc = view.state.doc;
  const aLine = doc.line(anchorLine);
  const hLine = doc.line(headLine);
  const anchor = anchorLine <= headLine ? aLine.from : aLine.to;
  const head = anchorLine <= headLine ? hLine.to : hLine.from;
  view.dispatch({ selection: { anchor, head } });
}

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

export interface Editor {
  view: EditorView;
  getValue(): string;
  setValue(content: string): void;
}

export function createEditor(
  parent: HTMLElement,
  initialDoc: string,
  onChange: (doc: string) => void,
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
