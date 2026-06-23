/***************************** volume-browser.ts ******************************
 *
 * Purpose: The unified file browser (docs/VOLUMES-SPEC.md §2/§7) — one modal
 *   that drives *Ouvrir* / *Enregistrer sous* across every mounted volume.
 *   Per the spec's thesis, the volumes are mounted at a **common root**: the
 *   browser opens on that root, where each volume (Bibliothèque / Disque /
 *   Dépôt) appears as a top-level folder; entering one browses its tree.
 * How: same overlay/panel + Esc/backdrop dismiss as the other modals; a single
 *   navigable pane with a breadcrumb (root ▸ volume ▸ folders). Listing is
 *   async (volumes can be remote), with loading / empty / error states. The
 *   caller decides what opening means (in-place vs import) from `isMarkdown`.
 *
 *******************************************************************************/

import { t } from '../i18n/strings';
import { TRASH_DIR, type Volume, type VolumeEntry, type VolumeState } from '../volumes';
import { type IconName, makeIcon } from './icons';

const OVERLAY_ID = 'volume-browser-overlay';

export interface VolumeBrowserOptions {
  volumes: Volume[];
  /** `open` (default) picks a file; `save` picks a folder + a name (V5). */
  mode?: 'open' | 'save';
  /** Prefilled file name in save mode. */
  defaultName?: string;
  /** Start navigated into this volume + folder (e.g. a doc's origin on Save As). */
  initial?: { volumeId: string; path: string };
  onOpen?(volume: Volume, entry: VolumeEntry): void;
  /** Save target chosen: a volume, the current folder, and a file name (V5). */
  onSave?(volume: Volume, folderPath: string, name: string): void;
  /** Mount actions, shown in the footer when provided. */
  onMountDisk?(): void;
  onMountRepo?(): void;
  onMountOneDrive?(): void;
  /** Re-grant RW permission on a volume's handle; resolves to whether granted. */
  onReauthorize?(volume: Volume): Promise<boolean>;
  /** Unmount a volume (Disk/Repo) — removes it from the root. */
  onUnmount?(volume: Volume): void;
  // Bibliothèque management (open mode): delete a doc → Corbeille, and the trash
  // lifecycle (the entry's `path` is the doc UUID). Replaces the «Fichiers…» modal.
  onDelete?(entry: VolumeEntry): void | Promise<void>;
  onRestore?(entry: VolumeEntry): void | Promise<void>;
  onPurge?(entry: VolumeEntry): void | Promise<void>;
  onEmptyTrash?(): void | Promise<void>;
}

const KIND_ICON: Record<Volume['kind'], IconName> = {
  library: 'library',
  disk: 'hard-drive',
  repo: 'github',
  onedrive: 'cloud',
};

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

  // Body = one navigable pane (breadcrumb + list)
  const body = doc.createElement('div');
  body.className = 'vb-body';
  const crumbs = doc.createElement('div');
  crumbs.className = 'vb-crumbs';
  const listEl = doc.createElement('div');
  listEl.className = 'vb-list';
  body.append(crumbs, listEl);

  // Footer (mount actions)
  const footer = doc.createElement('footer');
  footer.className = 'vb-footer';
  const mountBtn = (label: string, run: () => void): void => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', run);
    footer.append(b);
  };
  if (opts.onMountDisk) mountBtn(t('volume.mount-disk'), () => opts.onMountDisk?.());
  if (opts.onMountRepo) mountBtn(t('volume.mount-repo'), () => opts.onMountRepo?.());
  if (opts.onMountOneDrive) mountBtn(t('volume.mount-onedrive'), () => opts.onMountOneDrive?.());

  const close = (): void => {
    overlay.remove();
    doc.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  // ---- navigation state: null = the common root (lists the volumes) ----
  let current: Volume | null = null;
  let path = '';
  // Start inside a volume when asked (Save As → the doc's origin folder).
  if (opts.initial) {
    const v = opts.volumes.find((vv) => vv.id === opts.initial?.volumeId);
    if (v) {
      current = v;
      path = opts.initial.path;
    }
  }

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
    if (name === '' || !current) return; // can't save at the root
    close();
    opts.onSave?.(current, path, name);
  };
  saveBtn.addEventListener('click', confirmSave);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSave();
  });
  saveBar.append(nameInput, saveBtn);

  const stateLabel = (s: VolumeState): string => t(`volume.state.${s}`);

  // Enter a volume from the root; a permission-lapsed disk volume is
  // re-authorized first (the click is the required user gesture).
  const enterVolume = (v: Volume, st: VolumeState): void => {
    if (st === 'needs-permission' && opts.onReauthorize) {
      void opts.onReauthorize(v).then((ok) => {
        if (ok) {
          current = v;
          path = '';
          void render();
        }
      });
      return;
    }
    current = v;
    path = '';
    void render();
  };

  const renderCrumbs = (): void => {
    crumbs.replaceChildren();
    const crumb = (label: string, go: () => void): HTMLElement => {
      const c = doc.createElement('button');
      c.type = 'button';
      c.className = 'vb-crumb';
      c.textContent = label;
      c.addEventListener('click', go);
      return c;
    };
    const sep = (): HTMLElement => {
      const s = doc.createElement('span');
      s.className = 'vb-crumb-sep';
      s.textContent = '›';
      return s;
    };
    crumbs.append(
      crumb(t('volume.root'), () => {
        current = null;
        path = '';
        void render();
      }),
    );
    if (current) {
      const vol = current;
      crumbs.append(
        sep(),
        crumb(vol.label, () => {
          path = '';
          void render();
        }),
      );
      let acc = '';
      for (const seg of path.split('/').filter((s) => s !== '')) {
        acc = acc === '' ? seg : `${acc}/${seg}`;
        const target = acc;
        crumbs.append(
          sep(),
          crumb(seg, () => {
            path = target;
            void render();
          }),
        );
      }
    }
  };

  // The root: each mounted volume shown as a top-level folder (SPEC §2).
  const renderRoot = (): void => {
    listEl.replaceChildren();
    for (const v of opts.volumes) {
      const row = doc.createElement('div');
      row.className = 'vb-row vb-vol-row';
      row.dataset.kind = v.kind;
      let st: VolumeState = 'ready';

      const nameBtn = doc.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'vb-row-name-btn';
      const icon = doc.createElement('span');
      icon.className = 'vb-row-icon';
      icon.append(makeIcon(KIND_ICON[v.kind]));
      const name = doc.createElement('span');
      name.className = 'vb-row-name';
      name.textContent = v.label;
      const stEl = doc.createElement('span');
      stEl.className = 'vb-vol-state';
      nameBtn.append(icon, name, stEl);
      nameBtn.addEventListener('click', () => enterVolume(v, st));

      const actions = doc.createElement('span');
      actions.className = 'vb-row-actions';
      if (v.kind !== 'library' && opts.onUnmount) {
        const x = doc.createElement('button');
        x.type = 'button';
        x.className = 'vb-row-action vb-vol-unmount';
        x.title = t('volume.unmount');
        x.textContent = '⏏';
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onUnmount?.(v);
        });
        actions.append(x);
      }

      void v.state().then((s) => {
        st = s;
        if (s === 'ready') return;
        stEl.textContent = stateLabel(s);
        if (s === 'needs-permission' && opts.onReauthorize) {
          const auth = doc.createElement('button');
          auth.type = 'button';
          auth.className = 'vb-vol-auth';
          auth.textContent = t('volume.authorize');
          auth.addEventListener('click', (e) => {
            e.stopPropagation();
            enterVolume(v, s);
          });
          actions.prepend(auth);
        }
      });

      row.append(nameBtn, actions);
      listEl.append(row);
    }
  };

  const renderList = async (): Promise<void> => {
    const vol = current;
    if (!vol) {
      renderRoot();
      return;
    }
    listEl.replaceChildren();
    const loading = doc.createElement('div');
    loading.className = 'vb-loading';
    loading.textContent = t('volume.loading');
    listEl.append(loading);
    let entries: VolumeEntry[];
    try {
      entries = await vol.list(path);
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

    // Management context (Bibliothèque only, open mode): delete at the root of
    // the volume, restore/purge in the Corbeille.
    const inTrash = vol.kind === 'library' && path === TRASH_DIR;
    const inLibRoot = vol.kind === 'library' && path === '';
    const canManage = mode === 'open';

    const actionBtn = (
      cls: string,
      glyph: string,
      btnTitle: string,
      run: () => void | Promise<void>,
    ): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `vb-row-action ${cls}`;
      b.textContent = glyph;
      b.title = btnTitle;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        void Promise.resolve(run()).then(() => render());
      });
      return b;
    };

    if (entries.length === 0) {
      const empty = doc.createElement('div');
      empty.className = 'vb-empty';
      empty.textContent = t('volume.empty');
      listEl.append(empty);
    }

    for (const entry of entries) {
      const row = doc.createElement('div');
      row.className = 'vb-row';
      row.dataset.type = entry.type;
      if (entry.type === 'file' && !entry.isMarkdown) row.classList.add('vb-row-foreign');
      const nameBtn = doc.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'vb-row-name-btn';
      const icon = doc.createElement('span');
      icon.className = 'vb-row-icon';
      icon.append(
        makeIcon(entry.type === 'dir' ? 'folder' : entry.isMarkdown ? 'file-text' : 'file'),
      );
      const name = doc.createElement('span');
      name.className = 'vb-row-name';
      name.textContent = entry.name;
      nameBtn.append(icon, name);
      nameBtn.addEventListener('click', () => {
        if (entry.type === 'dir') {
          path = entry.path;
          void render();
        } else if (inTrash && canManage && opts.onRestore) {
          void Promise.resolve(opts.onRestore(entry)).then(() => render());
        } else if (mode === 'save') {
          nameInput.value = entry.name; // pick a name to overwrite
        } else {
          close();
          opts.onOpen?.(vol, entry);
        }
      });

      const actions = doc.createElement('span');
      actions.className = 'vb-row-actions';
      if (canManage && entry.type === 'file') {
        if (inTrash) {
          if (opts.onRestore) {
            actions.append(actionBtn('restore', '↩', t('volume.restore'), () => opts.onRestore?.(entry)));
          }
          if (opts.onPurge) {
            actions.append(actionBtn('purge', '×', t('volume.purge'), () => opts.onPurge?.(entry)));
          }
        } else if (inLibRoot && opts.onDelete) {
          actions.append(actionBtn('delete', '×', t('volume.delete'), () => opts.onDelete?.(entry)));
        }
      }
      row.append(nameBtn, actions);
      listEl.append(row);
    }

    if (canManage && inTrash && entries.length > 0 && opts.onEmptyTrash) {
      const empty = doc.createElement('button');
      empty.type = 'button';
      empty.className = 'vb-empty-trash';
      empty.textContent = t('volume.empty-trash');
      empty.addEventListener('click', () => {
        void Promise.resolve(opts.onEmptyTrash?.()).then(() => render());
      });
      listEl.append(empty);
    }
  };

  const render = async (): Promise<void> => {
    renderCrumbs();
    // Save bar only makes sense inside a volume's folder (not at the root).
    saveBar.hidden = current === null;
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
