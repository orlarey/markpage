/********************************* files-modal.ts ******************************
 *
 * Purpose: The `Files…` manager — a Finder-like modal over the document
 *   library: list documents with per-row actions (open / rename / duplicate /
 *   move to Trash), plus a Trash section (restore / delete permanently / empty).
 *   (Folders and the per-doc assets view are deferred — SPEC §12.)
 * How: Overlay/panel (same pattern as the help modal). Mutations go through the
 *   injected handlers, then the modal reloads + re-renders in place. Opening a
 *   doc closes the modal (like Open…).
 *
 *******************************************************************************/

import type { DocEntry } from '../docs';
import { isModified } from '../docs';
import { t } from '../i18n/strings';
import { relativeTime } from './doc-menu';

const OVERLAY_ID = 'files-overlay';

export interface FilesModalOptions {
  loadDocs(): Promise<DocEntry[]>;
  loadTrash(): Promise<DocEntry[]>;
  currentUuid: string;
  onOpen(uuid: string): void;
  onNew(): void;
  onImport(): void;
  onRename(uuid: string, name: string): void | Promise<void>;
  onDuplicate(uuid: string): void | Promise<void>;
  onReload(uuid: string): void;
  onDelete(uuid: string): void | Promise<void>;
  onRestore(uuid: string): void | Promise<void>;
  onPurge(uuid: string): void | Promise<void>;
  onEmptyTrash(): void | Promise<void>;
}

/** Open the `Files…` manager (single-instance). */
export function openFilesModal(opts: FilesModalOptions): void {
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'files-overlay';

  const panel = document.createElement('div');
  panel.className = 'files-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('files.title'));

  // --- header ---
  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = t('files.title');
  const headActions = document.createElement('div');
  headActions.className = 'actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'close';
  closeBtn.textContent = t('files.close');
  headActions.append(closeBtn);
  header.append(title, headActions);

  // --- toolbar (New / Import / search) ---
  const bar = document.createElement('div');
  bar.className = 'files-bar';
  const newBtn = button(t('files.new'), 'files-bar-btn');
  const importBtn = button(t('files.import'), 'files-bar-btn');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'files-search';
  search.placeholder = t('files.search');
  search.setAttribute('aria-label', t('files.search'));
  bar.append(newBtn, importBtn, search);

  const body = document.createElement('div');
  body.className = 'files-body';

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  // Run an action, then reload + re-render the lists.
  const run = (fn: () => void | Promise<void>): void => {
    void Promise.resolve(fn()).then(refresh);
  };

  // --- render ---
  async function refresh(): Promise<void> {
    const [docs, trash] = await Promise.all([opts.loadDocs(), opts.loadTrash()]);
    const q = search.value.trim().toLowerCase();
    const shown = q
      ? docs.filter((d) => d.name.toLowerCase().includes(q))
      : docs;
    body.replaceChildren();

    // Documents
    const docList = document.createElement('div');
    docList.className = 'files-list';
    if (shown.length === 0) {
      docList.append(emptyNote(t('files.empty')));
    }
    for (const d of shown) docList.append(docRow(d));
    body.append(docList);

    // Trash
    if (trash.length > 0) {
      const trashHead = document.createElement('div');
      trashHead.className = 'files-trash-head';
      const label = document.createElement('span');
      label.textContent = `${t('files.trash')} (${trash.length})`;
      const emptyBtn = button(t('files.empty-trash'), 'files-row-action files-danger');
      emptyBtn.addEventListener('click', () => {
        if (globalThis.confirm(t('files.empty-confirm'))) run(opts.onEmptyTrash);
      });
      trashHead.append(label, emptyBtn);
      body.append(trashHead);
      const trashList = document.createElement('div');
      trashList.className = 'files-list';
      for (const d of trash) trashList.append(trashRow(d));
      body.append(trashList);
    }
  }

  function docRow(d: DocEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'files-row';
    if (d.uuid === opts.currentUuid) row.classList.add('files-row-current');

    const name = document.createElement('span');
    name.className = 'files-row-name';
    name.textContent = d.name;
    if (isModified(d)) {
      const dot = document.createElement('span');
      dot.className = 'files-row-dot';
      dot.textContent = '●';
      dot.title = t('toolbar.modified-title');
      name.append(' ', dot);
    }
    if (d.link) {
      const link = document.createElement('span');
      link.className = 'files-row-link';
      link.textContent = '🔗';
      link.title = t('toolbar.linked-title');
      name.append(' ', link);
    }
    const date = document.createElement('span');
    date.className = 'files-row-date';
    date.textContent = relativeTime(d.mtime);

    const actions = document.createElement('div');
    actions.className = 'files-row-actions';
    const open = button(t('files.open'), 'files-row-action');
    open.addEventListener('click', () => {
      close();
      opts.onOpen(d.uuid);
    });
    const rename = button(t('doc-menu.rename'), 'files-row-action');
    rename.addEventListener('click', () => {
      const next = globalThis.prompt(t('files.rename-prompt'), d.name);
      if (next != null && next.trim() !== '') run(() => opts.onRename(d.uuid, next));
    });
    const dup = button(t('doc-menu.duplicate'), 'files-row-action');
    dup.addEventListener('click', () => run(() => opts.onDuplicate(d.uuid)));
    const reload = button(t('doc-menu.reload'), 'files-row-action');
    reload.addEventListener('click', () => {
      close();
      opts.onReload(d.uuid);
    });
    const del = button(t('doc-menu.delete'), 'files-row-action files-danger');
    del.addEventListener('click', () => run(() => opts.onDelete(d.uuid)));
    actions.append(open, rename, dup, reload, del);

    row.append(name, date, actions);
    return row;
  }

  function trashRow(d: DocEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'files-row files-row-trashed';
    const name = document.createElement('span');
    name.className = 'files-row-name';
    name.textContent = d.name;
    const date = document.createElement('span');
    date.className = 'files-row-date';
    date.textContent = relativeTime(d.deletedAt ?? d.mtime);
    const actions = document.createElement('div');
    actions.className = 'files-row-actions';
    const restore = button(t('files.restore'), 'files-row-action');
    restore.addEventListener('click', () => run(() => opts.onRestore(d.uuid)));
    const purge = button(t('files.purge'), 'files-row-action files-danger');
    purge.addEventListener('click', () => {
      if (globalThis.confirm(t('files.purge-confirm', { name: d.name }))) {
        run(() => opts.onPurge(d.uuid));
      }
    });
    actions.append(restore, purge);
    row.append(name, date, actions);
    return row;
  }

  // wiring
  newBtn.addEventListener('click', () => {
    close();
    opts.onNew();
  });
  importBtn.addEventListener('click', () => {
    close();
    opts.onImport();
  });
  search.addEventListener('input', () => void refresh());
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  panel.append(header, bar, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  void refresh();
  search.focus();
}

function button(label: string, className: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
}

function emptyNote(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'files-empty';
  el.textContent = text;
  return el;
}
