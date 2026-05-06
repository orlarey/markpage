import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Replace CodeMirror's default heading styling: keep the bold weight (matched
// to Roboto Medium 500, the family's "bold" everywhere else in the app), but
// drop the underline that the default highlight style adds.
const headingStyle = { fontWeight: '500', textDecoration: 'none' };
const headingHighlight = HighlightStyle.define([
  { tag: tags.heading, ...headingStyle },
  { tag: tags.heading1, ...headingStyle },
  { tag: tags.heading2, ...headingStyle },
  { tag: tags.heading3, ...headingStyle },
  { tag: tags.heading4, ...headingStyle },
  { tag: tags.heading5, ...headingStyle },
  { tag: tags.heading6, ...headingStyle },
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
        syntaxHighlighting(headingHighlight),
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
