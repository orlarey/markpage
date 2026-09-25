/********************************* style-menu.ts *******************************
 *
 * Purpose: The `Format ▾` menu — the look of the text only: paragraph type
 *   (normal / headings), bold / italic / code, lists and quote, each with its
 *   shortcut — and the editor's right-click menu (cut / copy / paste, then
 *   Format ▸ and Insérer ▸). What is ADDED to a document lives in the
 *   Insérer menu (insert-menu.ts).
 * How: Snapshot the selection state on open for the checkmarks, then build
 *   the menu data (menu.ts).
 *
 *******************************************************************************/

import type { EditorView } from '@codemirror/view';
import {
  getSelectionState,
  reformatTables,
  renumberHeadings,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
} from '../editor-commands';
import { t } from '../i18n/strings';
import { insertMenuEntries } from './insert-menu';
import { keyHint, openMenu, SEP, type MenuEntry } from './menu';
import { showNotice } from './notice';

const MENU_ID = 'style-menu';

/** The Format menu's entries (checkmarks from the current selection). */
function formatEntries(view: EditorView): MenuEntry[] {
  const sel = getSelectionState(view);
  const heading = (n: 0 | 1 | 2 | 3 | 4, label: Parameters<typeof t>[0]): MenuEntry => ({
    label: t(label),
    hint: keyHint(`Mod-${n}`),
    checked: sel.heading === n,
    action: () => setHeading(view, n),
  });
  return [
    heading(0, 'style-menu.normal'),
    heading(1, 'style-menu.h1'),
    heading(2, 'style-menu.h2'),
    heading(3, 'style-menu.h3'),
    heading(4, 'style-menu.h4'),
    SEP,
    { label: t('style-menu.bold'), hint: keyHint('Mod-b'), checked: sel.bold, action: () => toggleBold(view) },
    { label: t('style-menu.italic'), hint: keyHint('Mod-i'), checked: sel.italic, action: () => toggleItalic(view) },
    { label: t('style-menu.code'), hint: keyHint('Mod-e'), checked: sel.code, action: () => toggleInlineCode(view) },
    SEP,
    { label: t('style-menu.bullet'), hint: keyHint('Mod-Shift-l'), checked: sel.bullet, action: () => toggleBulletList(view) },
    { label: t('style-menu.numbered'), hint: keyHint('Mod-Shift-o'), checked: sel.numbered, action: () => toggleNumberedList(view) },
    { label: t('style-menu.quote'), hint: keyHint('Mod-Shift-q'), checked: sel.quote, action: () => toggleBlockquote(view) },
    SEP,
    {
      kind: 'submenu',
      label: t('format.group.document'),
      items: [
        { label: t('style-menu.numbering'), hint: keyHint('Mod-Shift-n'), action: () => renumberHeadings(view) },
        { label: t('style-menu.format-tables'), hint: keyHint('Mod-Shift-t'), action: () => reformatTables(view) },
      ],
    },
  ];
}

/** Open the Format menu at `(x, y)`. */
export function openStyleMenu(view: EditorView, x: number, y: number): void {
  openMenu(MENU_ID, { x, y }, formatEntries(view));
}

/**
 * Right-click in the editor: the clipboard, then Format ▸ and Insérer ▸. The
 * caret moves to the click unless it falls inside the selection (asking for
 * the menu must not lose what was selected).
 */
export function attachStyleContextMenu(editorEl: HTMLElement, view: EditorView): void {
  editorEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    const sel = view.state.selection.main;
    const insideSelection = !sel.empty && pos !== null && pos >= sel.from && pos <= sel.to;
    if (pos !== null && !insideSelection) view.dispatch({ selection: { anchor: pos } });
    openMenu(MENU_ID, { x: e.clientX, y: e.clientY }, contextEntries(view));
  });
}

function contextEntries(view: EditorView): MenuEntry[] {
  const selected = (): string => {
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  };
  const empty = view.state.selection.main.empty;
  return [
    {
      label: t('edit.cut'),
      hint: keyHint('Mod-x'),
      disabled: empty,
      action: () => {
        void navigator.clipboard.writeText(selected()).then(() => {
          view.dispatch(view.state.replaceSelection(''));
          view.focus();
        });
      },
    },
    {
      label: t('edit.copy'),
      hint: keyHint('Mod-c'),
      disabled: empty,
      action: () => {
        void navigator.clipboard.writeText(selected());
        view.focus();
      },
    },
    {
      label: t('edit.paste'),
      hint: keyHint('Mod-v'),
      action: () => {
        navigator.clipboard
          .readText()
          .then((text) => {
            view.dispatch(view.state.replaceSelection(text));
            view.focus();
          })
          .catch(() => {
            // Reading the clipboard needs the browser's permission; the
            // keyboard shortcut never does.
            showNotice(t('edit.paste-denied', { key: keyHint('Mod-v') }));
            view.focus();
          });
      },
    },
    SEP,
    { kind: 'submenu', label: t('toolbar.style'), items: formatEntries(view) },
    { kind: 'submenu', label: t('toolbar.insert'), items: insertMenuEntries(view) },
  ];
}
