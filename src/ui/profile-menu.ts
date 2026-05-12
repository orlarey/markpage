// Dropdown that manages the settings-profile library, anchored to
// the [<nom> ▾] button in the Réglages window header. Cf. SPEC §9.4.4.
//
// Pattern: switch-en-un-clic. Each "other profile" row is a single
// action — clicking switches to that profile. Actions that need a
// confirmed target (Dupliquer / Supprimer / Réinitialiser / Importer /
// Exporter) apply to the **current** profile only and live in a
// footer block. The user-doc-menu pattern (hover-revealed per-row
// actions) is deliberately not reused: profiles are typically a
// handful, primary intent is *switch*, and per-row actions added
// visual noise that didn't pay back.

import type { ProfileEntry } from '../settings-profiles';

const MENU_ID = 'profile-menu';

export interface ProfileMenuOptions {
  profiles: ProfileEntry[];
  currentUuid: string;
  onSelect(uuid: string): void;
  onCreate(): void;
  onRenameCurrent(name: string): void;
  onDuplicateCurrent(): void;
  onDeleteCurrent(): void;
  onResetCurrent(): void;
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

  // ---- Header: editable current-profile name ------------------------
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

  // ---- "+ Nouveau profil" -------------------------------------------
  const newBtn = doc.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'profile-menu-new';
  newBtn.textContent = '+ Nouveau profil';
  newBtn.addEventListener('click', () => {
    opts.onCreate();
    close();
  });
  menu.append(newBtn);

  // ---- Other profiles (switch-on-click) -----------------------------
  const others = opts.profiles.filter((p) => p.uuid !== opts.currentUuid);
  if (others.length > 0) {
    const sep = doc.createElement('div');
    sep.className = 'profile-menu-sep';
    menu.append(sep);

    const list = doc.createElement('div');
    list.className = 'profile-menu-list';
    for (const p of others) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'profile-menu-row';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        opts.onSelect(p.uuid);
        close();
      });
      list.append(btn);
    }
    menu.append(list);
  }

  // ---- Footer: actions on the current profile -----------------------
  const sep1 = doc.createElement('div');
  sep1.className = 'profile-menu-sep';
  menu.append(sep1);

  const footer = doc.createElement('div');
  footer.className = 'profile-menu-footer';

  const allowDelete = opts.profiles.length > 1;
  footer.append(
    footerButton(doc, 'Dupliquer', () => {
      opts.onDuplicateCurrent();
      close();
    }),
    footerButton(
      doc,
      'Supprimer',
      () => {
        const w = doc.defaultView ?? globalThis;
        if (!current) return;
        if (w.confirm(`Supprimer le profil « ${current.name} » ?`)) {
          opts.onDeleteCurrent();
          close();
        }
      },
      !allowDelete,
    ),
    footerButton(doc, 'Réinitialiser', () => {
      const w = doc.defaultView ?? globalThis;
      if (
        w.confirm(
          'Revenir aux réglages par défaut pour ce profil ? Le nom est conservé.',
        )
      ) {
        opts.onResetCurrent();
        close();
      }
    }),
  );
  menu.append(footer);

  const sep2 = doc.createElement('div');
  sep2.className = 'profile-menu-sep';
  menu.append(sep2);

  const io = doc.createElement('div');
  io.className = 'profile-menu-io';
  io.append(
    footerButton(doc, 'Importer…', () => {
      opts.onImport();
      close();
    }),
    footerButton(doc, 'Exporter…', () => {
      opts.onExport();
      close();
    }),
  );
  menu.append(io);

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

function footerButton(
  doc: Document,
  label: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'profile-menu-footer-btn';
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}
