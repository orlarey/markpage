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
  // Disk interop (Phase 4) — only shown when the File System Access API is
  // available (Chromium). Reload/Unlink only when the doc is linked.
  diskAvailable: boolean;
  linked: boolean;
  onOpenFromDisk(): void;
  onLinkFolder(): void;
  onReloadDisk(): void;
  onUnlink(): void;
  onNew(): void;
  onOpen(): void;
  onFiles(): void;
  onSave(): void;
  onSaveAs(): void;
  onRevert(): void;
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
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'file-menu-item';
    const main = document.createElement('span');
    main.className = 'file-menu-label';
    main.textContent = label;
    const sub = document.createElement('span');
    sub.className = 'file-menu-hint';
    sub.textContent = hint;
    btn.append(main, sub);
    btn.addEventListener('click', () => {
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
    item(t('file-menu.files'), 'Cmd/Ctrl + ⇧ + O', opts.onFiles),
  );
  if (opts.diskAvailable) {
    menu.append(
      sep(),
      item(t('file-menu.open-disk'), '', opts.onOpenFromDisk),
      item(t('file-menu.link-folder'), '', opts.onLinkFolder),
    );
    if (opts.linked) {
      menu.append(
        item(t('file-menu.reload-disk'), '', opts.onReloadDisk),
        item(t('file-menu.unlink'), '', opts.onUnlink),
      );
    }
  }
  menu.append(sep());
  if (opts.modified) {
    menu.append(item(t('file-menu.save'), 'Cmd/Ctrl + S', opts.onSave));
  }
  menu.append(item(t('file-menu.save-as'), '', opts.onSaveAs));
  if (opts.modified) {
    menu.append(item(t('file-menu.revert'), '', opts.onRevert));
  }
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
