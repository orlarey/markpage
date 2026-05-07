import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

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
