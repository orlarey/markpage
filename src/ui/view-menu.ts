/********************************* view-menu.ts ********************************
 *
 * Purpose: The `Vue ▾` dropdown — the three views (Écrire / Côte à côte /
 *   Lire, the current one checked), how the preview renders (Pages), then
 *   Présenter and Repères.
 * How: Transient dropdown reusing the context-menu styling, same dismiss
 *   pattern as the other menus (outside-click / Escape / resize).
 *
 *******************************************************************************/

import { keyHint } from './menu';
import { t } from '../i18n/strings';

const MENU_ID = 'view-menu';

export type View = 'edit' | 'split' | 'read';

export interface ViewMenuOptions {
  view: View;
  /** A narrow screen has no side-by-side view. */
  narrow: boolean;
  paginated: boolean;
  guides: boolean;
  onSetView(view: View): void;
  onTogglePages(): void;
  onPresent(): void;
  onToggleGuides(): void;
}

/** Mount the View dropdown anchored under `anchor`. */
export function openViewMenu(anchor: HTMLElement, opts: ViewMenuOptions): void {
  document.getElementById(MENU_ID)?.remove();

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'editor-context-menu';
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;

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
    hint: string,
    action: () => void,
    active = false,
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-context-item' + (active ? ' active' : '');

    const check = document.createElement('span');
    check.className = 'cm-context-check';
    check.textContent = '✓';

    const text = document.createElement('span');
    text.className = 'cm-context-label';
    text.textContent = label;

    const kbd = document.createElement('span');
    kbd.className = 'cm-context-hint';
    kbd.textContent = hint;

    btn.append(check, text, kbd);
    btn.addEventListener('click', () => {
      close();
      action();
    });
    return btn;
  };

  const sep = (): HTMLElement => {
    const d = document.createElement('div');
    d.className = 'cm-context-sep';
    return d;
  };
  const view = (v: View, label: Parameters<typeof t>[0]): HTMLButtonElement =>
    item(t(label), '', () => opts.onSetView(v), opts.view === v);

  menu.append(
    view('edit', 'view.edit'),
    ...(opts.narrow ? [] : [view('split', 'view.split')]),
    view('read', 'view.read'),
    sep(),
    item(t('preview-toggle.paginate'), '', opts.onTogglePages, opts.paginated),
    sep(),
    item(t('toolbar.present'), keyHint('Mod-Shift-Enter'), opts.onPresent),
    item(t('toolbar.guides'), keyHint('Mod-Shift-g'), opts.onToggleGuides, opts.guides),
  );

  document.body.appendChild(menu);

  // Clamp to viewport (right / bottom edges).
  const r = menu.getBoundingClientRect();
  if (r.right > globalThis.innerWidth) {
    menu.style.left = `${Math.max(4, globalThis.innerWidth - r.width - 4)}px`;
  }
  if (r.bottom > globalThis.innerHeight) {
    menu.style.top = `${Math.max(4, globalThis.innerHeight - r.height - 4)}px`;
  }

  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    globalThis.addEventListener('resize', close);
  }, 0);
}
