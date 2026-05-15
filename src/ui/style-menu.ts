/********************************* style-menu.ts *******************************
 *
 * Purpose: Editor formatting menu — heading / bold / italic / list / quote /
 *   link / image / renumber / reformat — opened by toolbar click or right-click.
 * How: Snapshot the selection state once on open, render checkmarks based on it,
 *   then dispatch one of the `editor-commands` mutations on click.
 *
 *******************************************************************************/

import type { EditorView } from '@codemirror/view';
import {
  getSelectionState,
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
} from '../editor-commands';
import { t } from '../i18n/strings';
import { pickAndInsertImage } from '../image';

const MENU_ID = 'style-menu';

/**
 * Purpose: Wire right-click in the editor pane to open the style menu at the click.
 * How: Reposition the cursor (unless the click is inside an existing selection),
 *   then call `openStyleMenu` with the click's screen coords.
 */
// Right-click anywhere in the editor pane to open the same menu, anchored at
// the click position. We reposition the cursor so the menu reflects the
// click's context — but only if the click falls *outside* any existing
// non-empty selection, otherwise the user's selection would be lost just by
// asking for the menu (e.g. selecting a line via the gutter then right
// clicking on it to format).
export function attachStyleContextMenu(
  editorEl: HTMLElement,
  view: EditorView,
): void {
  editorEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    const sel = view.state.selection.main;
    const insideSelection = !sel.empty && pos !== null && pos >= sel.from && pos <= sel.to;
    if (pos !== null && !insideSelection) {
      view.dispatch({ selection: { anchor: pos } });
    }
    openStyleMenu(view, e.clientX, e.clientY);
  });
}

/**
 * Purpose: Mount the style menu at `(x, y)`, with checkmarks reflecting selection state.
 * How: Snapshot `getSelectionState(view)` once, build the item list, defer dismiss listeners.
 */
// Opens the style menu anchored at the given screen coordinates. Reflects the
// current selection's format state via checkmarks; commands operate on the
// editor's saved selection (so it works whether or not the editor has focus).
export function openStyleMenu(
  view: EditorView,
  x: number,
  y: number,
): void {
  document.getElementById(MENU_ID)?.remove();

  // Snapshot the selection state once when the menu opens; the menu is
  // ephemeral, so we don't need to react to live edits.
  const sel = getSelectionState(view);

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'editor-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const close = (): void => {
    menu.remove();
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey);
    globalThis.removeEventListener('resize', close);
  };
  const onDocDown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const item = (
    label: string,
    action: () => void,
    active = false,
  ): HTMLButtonElement => {
    const it = document.createElement('button');
    it.type = 'button';
    it.className = 'cm-context-item' + (active ? ' active' : '');

    const check = document.createElement('span');
    check.className = 'cm-context-check';
    check.textContent = '✓';

    const text = document.createElement('span');
    text.className = 'cm-context-label';
    text.textContent = label;

    it.append(check, text);
    it.addEventListener('mousedown', (e) => e.preventDefault());
    it.addEventListener('click', () => {
      close();
      action();
    });
    return it;
  };

  const sep = (): HTMLElement => {
    const s = document.createElement('div');
    s.className = 'cm-context-sep';
    return s;
  };

  menu.append(
    item(t('style-menu.normal'), () => setHeading(view, 0), sel.heading === 0),
    item(t('style-menu.h1'), () => setHeading(view, 1), sel.heading === 1),
    item(t('style-menu.h2'), () => setHeading(view, 2), sel.heading === 2),
    item(t('style-menu.h3'), () => setHeading(view, 3), sel.heading === 3),
    item(t('style-menu.h4'), () => setHeading(view, 4), sel.heading === 4),
    sep(),
    item(t('style-menu.bold'), () => toggleBold(view), sel.bold),
    item(t('style-menu.italic'), () => toggleItalic(view), sel.italic),
    item(t('style-menu.code'), () => toggleInlineCode(view), sel.code),
    sep(),
    item(t('style-menu.bullet'), () => toggleBulletList(view), sel.bullet),
    item(t('style-menu.numbered'), () => toggleNumberedList(view), sel.numbered),
    item(t('style-menu.quote'), () => toggleBlockquote(view), sel.quote),
    sep(),
    item(t('style-menu.link'), () => insertLink(view)),
    item(t('style-menu.image'), () => pickAndInsertImage(view)),
    sep(),
    item(t('style-menu.numbering'), () => renumberHeadings(view)),
    item(t('style-menu.format-tables'), () => reformatTables(view)),
  );

  document.body.appendChild(menu);

  // Clamp to viewport.
  const rect = menu.getBoundingClientRect();
  if (rect.right > globalThis.innerWidth) {
    menu.style.left = `${Math.max(4, globalThis.innerWidth - rect.width - 4)}px`;
  }
  if (rect.bottom > globalThis.innerHeight) {
    menu.style.top = `${Math.max(4, globalThis.innerHeight - rect.height - 4)}px`;
  }

  // Defer the dismissal listeners by one tick so the contextmenu event
  // that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    globalThis.addEventListener('resize', close);
  }, 0);
}
