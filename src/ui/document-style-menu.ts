/**************************** document-style-menu.ts **************************
 *
 * Purpose: The `Style ▾` dropdown — pick the document's named style from the
 *   library (built-in + user), plus export the current style / import a style.
 *   The document only ever references a style by NAME; picking one writes
 *   `document-style: <key>` into the front-matter.
 * How: Transient dropdown reusing the context-menu styling and dismiss pattern
 *   of the other toolbar menus.
 *
 *****************************************************************************/

import { t } from '../i18n/strings';
import type { NamedStyle } from '../style-library';

export interface DocumentStyleMenuOptions {
  /** Current `document-style` front-matter value (key or name), if any. */
  current?: string;
  /** All library styles, user first. */
  styles: NamedStyle[];
  /** Keys belonging to the user library (shown with a subtle marker). */
  userKeys: Set<string>;
  onPick(style: NamedStyle): void;
  onExport(): void;
  onImport(): void;
}

const MENU_ID = 'document-style-menu';

export function openDocumentStyleMenu(
  anchor: HTMLElement,
  opts: DocumentStyleMenuOptions,
): void {
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

  const cur = (opts.current ?? '').trim().toLowerCase();
  const isCurrent = (s: NamedStyle): boolean =>
    cur !== '' && (s.key.toLowerCase() === cur || s.name.toLowerCase() === cur);

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
    d.style.cssText = 'height:1px;margin:4px 6px;background:var(--line,#e4e7ee);';
    return d;
  };

  for (const s of opts.styles) {
    menu.append(
      item(
        s.name,
        opts.userKeys.has(s.key) ? t('docstyle.user-tag') : '',
        () => opts.onPick(s),
        isCurrent(s),
      ),
    );
  }
  menu.append(
    sep(),
    item(t('docstyle.export'), '', opts.onExport),
    item(t('docstyle.import'), '', opts.onImport),
  );

  document.body.appendChild(menu);

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
