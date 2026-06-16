/****************************** conflict-menu.ts ******************************
 *
 * Purpose: The tiny two-choice menu shown when a linked doc is in conflict
 *   (edited both in markpage and on disk). Anchored under the ⛓️‍💥 badge:
 *   "keep my version" (push, overwrite disk) or "take the disk" (pull,
 *   discard local edits).
 * How: Transient left-anchored `<div>`, same dismiss pattern as file-menu.ts
 *   (outside-click / Escape / resize).
 *
 *******************************************************************************/

import { t } from '../i18n/strings';

const MENU_ID = 'conflict-menu';

export interface ConflictMenuOptions {
  onKeepMine(): void;
  onTakeDisk(): void;
}

/** Mount the conflict-resolution dropdown anchored under `anchor`. */
export function openConflictMenu(
  anchor: HTMLElement,
  opts: ConflictMenuOptions,
): void {
  document.getElementById(MENU_ID)?.remove();

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'file-menu'; // reuse the file-menu styling
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

  const item = (label: string, action: () => void): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'file-menu-item';
    const main = document.createElement('span');
    main.className = 'file-menu-label';
    main.textContent = label;
    btn.append(main);
    btn.addEventListener('click', () => {
      close();
      action();
    });
    return btn;
  };

  menu.append(
    item(t('conflict.keep-mine'), opts.onKeepMine),
    item(t('conflict.take-disk'), opts.onTakeDisk),
  );

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    globalThis.addEventListener('resize', close);
  }, 0);
}
