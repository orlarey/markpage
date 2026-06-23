/********************************* file-menu.ts ********************************
 *
 * Purpose: The `File ▾` dropdown — consolidates document lifecycle (New /
 *   Open… / Files… / Save / Save As / Revert), Import, and Export/Share into
 *   one menu (Phase 3d). Save / Revert only show when the doc is modified.
 * How: Transient left-anchored `<div>`, same dismiss pattern as the other
 *   menus (outside-click / Escape / resize).
 *
 *******************************************************************************/

import { t } from '../i18n/strings';

const MENU_ID = 'file-menu';

export interface FileMenuOptions {
  modified: boolean;
  // Opening / linking now go through the unified volume browser (Open) and
  // Save As (docs/VOLUMES-SPEC.md). Only the *operations on the doc's origin
  // volume* remain: a single Reload (pull) + a single Unlink (V3, one origin).
  linked: boolean; // has an origin volume (disk or GitHub)
  onReload(): void;
  onUnlink(): void;
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onRevert(): void;
  onDelete(): void;
  onImport(): void;
  onMarkdown(): void;
  onPdf(): void;
  onLatex(): void;
  onOneDrive(): void;
  onShareLink(): void;
  onShareEmail(): void;
}

/** Mount the File dropdown anchored under `anchor`. */
export function openFileMenu(anchor: HTMLElement, opts: FileMenuOptions): void {
  document.getElementById(MENU_ID)?.remove();

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'file-menu';
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
    disabled = false,
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'file-menu-item';
    btn.disabled = disabled; // shown greyed, not removed — more informative
    const main = document.createElement('span');
    main.className = 'file-menu-label';
    main.textContent = label;
    const sub = document.createElement('span');
    sub.className = 'file-menu-hint';
    sub.textContent = hint;
    btn.append(main, sub);
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      close();
      action();
    });
    return btn;
  };
  const sep = (): HTMLElement => {
    const hr = document.createElement('hr');
    hr.className = 'file-menu-sep';
    return hr;
  };

  menu.append(
    item(t('file-menu.new'), '', opts.onNew),
    item(t('file-menu.open'), 'Cmd/Ctrl + O', opts.onOpen),
  );
  // Operations on the doc's origin volume (the link is created via Save As).
  if (opts.linked) {
    menu.append(
      sep(),
      item(t('file-menu.reload'), '', opts.onReload),
      item(t('file-menu.unlink-origin'), '', opts.onUnlink),
    );
  }
  // Save / Revert stay visible but greyed when there's nothing to save —
  // more informative than hiding them.
  menu.append(
    sep(),
    item(t('file-menu.save'), 'Cmd/Ctrl + S', opts.onSave, !opts.modified),
    item(t('file-menu.save-as'), '', opts.onSaveAs),
    item(t('file-menu.revert'), '', opts.onRevert, !opts.modified),
    item(t('file-menu.delete-doc'), '', opts.onDelete),
  );
  menu.append(
    sep(),
    item(t('file-menu.import'), '', opts.onImport),
    sep(),
    item(t('export-menu.markdown'), '', opts.onMarkdown),
    item(t('export-menu.pdf'), 'Cmd/Ctrl + P', opts.onPdf),
    item(t('export-menu.latex'), '', opts.onLatex),
    item(t('export-menu.onedrive'), '', opts.onOneDrive),
    sep(),
    item(t('export-menu.share-link'), '', opts.onShareLink),
    item(t('export-menu.share-email'), '', opts.onShareEmail),
  );

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    globalThis.addEventListener('resize', close);
  }, 0);
}
