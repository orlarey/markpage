// Dropdown that manages the settings-profile library, anchored to
// the [Mon profil ▾] button in the Réglages window header. Mirrors
// the doc-menu pattern (transient div, dismiss on outside click /
// Escape / window resize) — the menu lives inside the Réglages
// popup (or the modal), so we use the *anchor's* owner document
// when mounting and listening, rather than the global `document`.

import type { ProfileEntry } from '../settings-profiles';

const MENU_ID = 'profile-menu';

export interface ProfileMenuOptions {
  profiles: ProfileEntry[];
  currentUuid: string;
  onSelect(uuid: string): void;
  onCreate(): void;
  onRenameCurrent(name: string): void;
  onRenameOther(uuid: string, name: string): void;
  onDuplicate(uuid: string): void;
  onDelete(uuid: string): void;
  onImport(): void;
  onExport(): void;
}

export function openProfileMenu(
  anchor: HTMLElement,
  opts: ProfileMenuOptions,
): void {
  const doc = anchor.ownerDocument;
  const win = doc.defaultView ?? globalThis;
  doc.getElementById(MENU_ID)?.remove();

  const rect = anchor.getBoundingClientRect();
  const menu = doc.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'profile-menu';
  menu.style.right = `${(win.innerWidth ?? 0) - rect.right}px`;
  menu.style.top = `${rect.bottom + 4}px`;

  const close = (): void => {
    menu.remove();
    doc.removeEventListener('mousedown', onDocDown, true);
    doc.removeEventListener('keydown', onKey);
    win.removeEventListener('resize', close);
  };
  const onDocDown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  // ---- Current profile: editable name input --------------------------
  const current = opts.profiles.find((p) => p.uuid === opts.currentUuid);
  if (current) {
    const row = doc.createElement('div');
    row.className = 'profile-menu-current';
    const input = doc.createElement('input');
    input.type = 'text';
    input.value = current.name;
    input.className = 'profile-menu-current-input';
    input.spellcheck = false;
    const original = current.name;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        opts.onRenameCurrent(input.value);
        close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = original;
        close();
      }
    });
    input.addEventListener('blur', () => {
      if (input.value !== original) opts.onRenameCurrent(input.value);
    });
    row.append(input);
    menu.append(row);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  // ---- "+ Nouveau profil" --------------------------------------------
  const newBtn = doc.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'profile-menu-new';
  newBtn.textContent = '+ Nouveau profil';
  newBtn.addEventListener('click', () => {
    opts.onCreate();
    close();
  });
  menu.append(newBtn);

  // ---- Other profiles ------------------------------------------------
  const others = opts.profiles.filter((p) => p.uuid !== opts.currentUuid);
  if (others.length > 0) {
    const sep = doc.createElement('div');
    sep.className = 'profile-menu-sep';
    menu.append(sep);

    const list = doc.createElement('div');
    list.className = 'profile-menu-list';
    const allowDelete = opts.profiles.length > 1;
    for (const p of others) {
      list.append(buildOtherRow(doc, p, opts, close, allowDelete));
    }
    menu.append(list);
  }

  // ---- Import / Export footer ---------------------------------------
  const footerSep = doc.createElement('div');
  footerSep.className = 'profile-menu-sep';
  menu.append(footerSep);

  const ioRow = doc.createElement('div');
  ioRow.className = 'profile-menu-io';
  ioRow.append(
    ioButton(doc, 'Importer…', () => {
      opts.onImport();
      close();
    }),
    ioButton(doc, 'Exporter…', () => {
      opts.onExport();
      close();
    }),
  );
  menu.append(ioRow);

  doc.body.appendChild(menu);

  // Clamp to viewport.
  const r = menu.getBoundingClientRect();
  if (r.left < 0) menu.style.left = '4px';
  if (r.bottom > (win.innerHeight ?? r.bottom)) {
    menu.style.top = `${Math.max(4, (win.innerHeight ?? 0) - r.height - 4)}px`;
  }

  setTimeout(() => {
    doc.addEventListener('mousedown', onDocDown, true);
    doc.addEventListener('keydown', onKey);
    win.addEventListener('resize', close);
  }, 0);
}

function buildOtherRow(
  doc: Document,
  profile: ProfileEntry,
  opts: ProfileMenuOptions,
  close: () => void,
  allowDelete: boolean,
): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'profile-menu-row';

  const main = doc.createElement('button');
  main.type = 'button';
  main.className = 'profile-menu-row-main';
  const nameEl = doc.createElement('span');
  nameEl.className = 'profile-menu-name';
  nameEl.textContent = profile.name;
  main.append(nameEl);
  main.addEventListener('click', () => {
    opts.onSelect(profile.uuid);
    close();
  });
  row.append(main);

  const actions = doc.createElement('div');
  actions.className = 'profile-menu-actions';

  const renameBtn = actionBtn(doc, 'Renommer', () => {
    enterInlineRename(row, nameEl, profile, opts);
  });
  const dupBtn = actionBtn(doc, 'Dupliquer', () => {
    opts.onDuplicate(profile.uuid);
    close();
  });
  const delBtn = actionBtn(doc, 'Supprimer', () => {
    const win = doc.defaultView ?? globalThis;
    if (win.confirm(`Supprimer le profil « ${profile.name} » ?`)) {
      opts.onDelete(profile.uuid);
      close();
    }
  });
  if (!allowDelete) delBtn.disabled = true;
  actions.append(renameBtn, dupBtn, delBtn);
  row.append(actions);

  return row;
}

function actionBtn(
  doc: Document,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'profile-menu-action';
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function ioButton(
  doc: Document,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'profile-menu-io-btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function enterInlineRename(
  row: HTMLElement,
  nameEl: HTMLElement,
  profile: ProfileEntry,
  opts: ProfileMenuOptions,
): void {
  const doc = row.ownerDocument;
  const input = doc.createElement('input');
  input.type = 'text';
  input.value = profile.name;
  input.className = 'profile-menu-rename-input';
  input.spellcheck = false;
  const original = profile.name;
  let committed = false;
  const commit = (name: string): void => {
    if (committed) return;
    committed = true;
    if (name !== original) opts.onRenameOther(profile.uuid, name);
    nameEl.textContent = name || original;
    input.replaceWith(nameEl);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(input.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commit(original);
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => commit(input.value));
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  row.classList.add('profile-menu-row-renaming');
}
