import type { EditorView } from '@codemirror/view';
import {
  insertLink,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
} from '../editor-commands';

const MENU_ID = 'editor-context-menu';

export function attachEditorContextMenu(
  editorEl: HTMLElement,
  view: EditorView,
): void {
  editorEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, view);
  });
}

function openMenu(x: number, y: number, view: EditorView): void {
  document.getElementById(MENU_ID)?.remove();

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'editor-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const close = (): void => {
    menu.remove();
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', close);
  };
  const onDocDown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const item = (label: string, action: () => void): HTMLButtonElement => {
    const it = document.createElement('button');
    it.type = 'button';
    it.className = 'cm-context-item';
    it.textContent = label;
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
    item('Normal', () => setHeading(view, 0)),
    item('Titre 1', () => setHeading(view, 1)),
    item('Titre 2', () => setHeading(view, 2)),
    item('Titre 3', () => setHeading(view, 3)),
    item('Titre 4', () => setHeading(view, 4)),
    sep(),
    item('Gras', () => toggleBold(view)),
    item('Italique', () => toggleItalic(view)),
    item('Code en ligne', () => toggleInlineCode(view)),
    sep(),
    item('Liste à puces', () => toggleBulletList(view)),
    item('Liste numérotée', () => toggleNumberedList(view)),
    item('Citation', () => toggleBlockquote(view)),
    sep(),
    item('Insérer un lien…', () => insertLink(view)),
  );

  document.body.appendChild(menu);

  // Clamp to viewport.
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`;
  }

  // Defer the dismissal listeners by one tick so the contextmenu event
  // that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
  }, 0);
}
