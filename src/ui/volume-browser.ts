/***************************** volume-browser.ts ******************************
 *
 * Purpose: The unified file browser (docs/VOLUMES-SPEC.md §7) — one modal that
 *   drives *Ouvrir* across every mounted volume (Bibliothèque / Disque /
 *   Dépôt). Replaces the per-origin Open / from-disk / from-GitHub / Import
 *   commands with a single Finder-like picker: a volume sidebar, a breadcrumb,
 *   and a navigable folder/file list.
 * How: same overlay/panel + Esc/backdrop dismiss as the other modals; listing
 *   is async (volumes can be remote), with loading / empty / error states. The
 *   caller decides what opening means (in-place vs import) from the entry's
 *   `isMarkdown` flag (V4).
 *
 *******************************************************************************/

import { t } from '../i18n/strings';
import type { Volume, VolumeEntry, VolumeState } from '../volumes';

const OVERLAY_ID = 'volume-browser-overlay';

export interface VolumeBrowserOptions {
  volumes: Volume[];
  /** Volume to select first (defaults to the first, i.e. Bibliothèque). */
  initialVolumeId?: string;
  /** `open` (default) picks a file; `save` picks a folder + a name (V5). */
  mode?: 'open' | 'save';
  /** Prefilled file name in save mode. */
  defaultName?: string;
  onOpen?(volume: Volume, entry: VolumeEntry): void;
  /** Save target chosen: a volume, the current folder, and a file name (V5). */
  onSave?(volume: Volume, folderPath: string, name: string): void;
  /** Optional mount actions, shown in the footer when provided. */
  onMountDisk?(): void;
  onMountRepo?(): void;
  /** Re-grant RW permission on a volume's handle; resolves to whether granted. */
  onReauthorize?(volume: Volume): Promise<boolean>;
  /** Unmount a volume (Disk/Repo) — removes it from the list. */
  onUnmount?(volume: Volume): void;
}

/** Open the unified volume browser (single-instance). */
export function openVolumeBrowser(opts: VolumeBrowserOptions): void {
  if (document.getElementById(OVERLAY_ID)) return;

  const doc = document;
  const mode = opts.mode ?? 'open';
  const overlay = doc.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'vb-overlay';

  const panel = doc.createElement('div');
  panel.className = 'vb-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('volume.browser-title'));

  // Header
  const header = doc.createElement('header');
  const title = doc.createElement('h2');
  title.textContent = t(mode === 'save' ? 'volume.save-title' : 'volume.browser-title');
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'close';
  closeBtn.textContent = t('open.close');
  header.append(title, closeBtn);

  // Body = sidebar + main
  const body = doc.createElement('div');
  body.className = 'vb-body';
  const sidebar = doc.createElement('div');
  sidebar.className = 'vb-sidebar';
  const main = doc.createElement('div');
  main.className = 'vb-main';
  const crumbs = doc.createElement('div');
  crumbs.className = 'vb-crumbs';
  const listEl = doc.createElement('div');
  listEl.className = 'vb-list';
  main.append(crumbs, listEl);
  body.append(sidebar, main);

  // Footer (mount actions)
  const footer = doc.createElement('footer');
  footer.className = 'vb-footer';
  if (opts.onMountDisk) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = t('volume.mount-disk');
    b.addEventListener('click', () => opts.onMountDisk?.());
    footer.append(b);
  }
  if (opts.onMountRepo) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = t('volume.mount-repo');
    b.addEventListener('click', () => opts.onMountRepo?.());
    footer.append(b);
  }

  const close = (): void => {
    overlay.remove();
    doc.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  // ---- navigation state ----
  let current: Volume =
    opts.volumes.find((v) => v.id === opts.initialVolumeId) ?? opts.volumes[0];
  let path = '';

  // Save bar (save mode only): file-name input + confirm button (V5).
  const saveBar = doc.createElement('div');
  saveBar.className = 'vb-savebar';
  const nameInput = doc.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'vb-name';
  nameInput.value = opts.defaultName ?? '';
  nameInput.placeholder = t('volume.name-placeholder');
  const saveBtn = doc.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'vb-save';
  saveBtn.textContent = t('volume.save-here');
  const confirmSave = (): void => {
    const name = nameInput.value.trim();
    if (name === '') return;
    close();
    opts.onSave?.(current, path, name);
  };
  saveBtn.addEventListener('click', confirmSave);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSave();
  });
  saveBar.append(nameInput, saveBtn);

  const stateLabel = (s: VolumeState): string => t(`volume.state.${s}`);

  const renderSidebar = (): void => {
    sidebar.replaceChildren();
    for (const v of opts.volumes) {
      // A row is a div (not a button) so it can hold action buttons.
      const row = doc.createElement('div');
      row.className = 'vb-vol';
      if (v.id === current.id) row.classList.add('vb-vol-current');
      row.dataset.kind = v.kind;
      const name = doc.createElement('button');
      name.type = 'button';
      name.className = 'vb-vol-name';
      name.textContent = v.label;
      name.addEventListener('click', () => {
        current = v;
        path = '';
        void render();
      });
      const st = doc.createElement('span');
      st.className = 'vb-vol-state';
      const actions = doc.createElement('span');
      actions.className = 'vb-vol-actions';
      row.append(name, st, actions);

      // Unmount (Disk/Repo only — Bibliothèque is permanent).
      if (v.kind !== 'library' && opts.onUnmount) {
        const x = doc.createElement('button');
        x.type = 'button';
        x.className = 'vb-vol-unmount';
        x.title = t('volume.unmount');
        x.textContent = '×';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onUnmount?.(v);
        });
        actions.append(x);
      }

      void v.state().then((s) => {
        if (s === 'ready') return;
        st.textContent = stateLabel(s);
        // A permission-lapsed disk volume gets an in-place "Autoriser" action.
        if (s === 'needs-permission' && opts.onReauthorize) {
          const auth = doc.createElement('button');
          auth.type = 'button';
          auth.className = 'vb-vol-auth';
          auth.textContent = t('volume.authorize');
          auth.addEventListener('click', (e) => {
            e.stopPropagation();
            void opts.onReauthorize?.(v).then((ok) => {
              if (ok) {
                current = v;
                path = '';
                void render();
              }
            });
          });
          actions.prepend(auth);
        }
      });
      sidebar.append(row);
    }
  };

  const renderCrumbs = (): void => {
    crumbs.replaceChildren();
    const make = (label: string, target: string): HTMLElement => {
      const c = doc.createElement('button');
      c.type = 'button';
      c.className = 'vb-crumb';
      c.textContent = label;
      c.addEventListener('click', () => {
        path = target;
        void render();
      });
      return c;
    };
    crumbs.append(make(current.label, ''));
    let acc = '';
    for (const seg of path.split('/').filter((s) => s !== '')) {
      acc = acc === '' ? seg : `${acc}/${seg}`;
      const sep = doc.createElement('span');
      sep.className = 'vb-crumb-sep';
      sep.textContent = '›';
      crumbs.append(sep, make(seg, acc));
    }
  };

  const renderList = async (): Promise<void> => {
    listEl.replaceChildren();
    const loading = doc.createElement('div');
    loading.className = 'vb-loading';
    loading.textContent = t('volume.loading');
    listEl.append(loading);
    let entries: VolumeEntry[];
    try {
      entries = await current.list(path);
    } catch (err) {
      console.error('volume list failed', err);
      listEl.replaceChildren();
      const e = doc.createElement('div');
      e.className = 'vb-error';
      e.textContent = t('volume.list-failed');
      listEl.append(e);
      return;
    }
    listEl.replaceChildren();
    if (entries.length === 0) {
      const empty = doc.createElement('div');
      empty.className = 'vb-empty';
      empty.textContent = t('volume.empty');
      listEl.append(empty);
      return;
    }
    for (const entry of entries) {
      const row = doc.createElement('button');
      row.type = 'button';
      row.className = 'vb-row';
      row.dataset.type = entry.type;
      if (entry.type === 'file' && !entry.isMarkdown) row.classList.add('vb-row-foreign');
      const icon = doc.createElement('span');
      icon.className = 'vb-row-icon';
      icon.textContent = entry.type === 'dir' ? '📁' : entry.isMarkdown ? '📄' : '⎙';
      const name = doc.createElement('span');
      name.className = 'vb-row-name';
      name.textContent = entry.name;
      row.append(icon, name);
      row.addEventListener('click', () => {
        if (entry.type === 'dir') {
          path = entry.path;
          void render();
        } else if (mode === 'save') {
          nameInput.value = entry.name; // pick a name to overwrite
        } else {
          close();
          opts.onOpen?.(current, entry);
        }
      });
      listEl.append(row);
    }
  };

  const render = async (): Promise<void> => {
    renderSidebar();
    renderCrumbs();
    await renderList();
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  doc.addEventListener('keydown', onKey);

  if (mode === 'save') panel.append(header, body, saveBar, footer);
  else panel.append(header, body, footer);
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);
  void render();
  if (mode === 'save') nameInput.focus();
}
