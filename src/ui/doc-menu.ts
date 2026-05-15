/********************************* doc-menu.ts *********************************
 *
 * Purpose: Document switcher dropdown — current doc as inline rename input,
 *   "+ New" button, other docs with hover-revealed rename/duplicate/delete.
 * How: One transient `<div>` anchored to the toolbar trigger, dismissed on
 *   outside-click / Escape / resize; helpers handle the per-row actions.
 *
 *******************************************************************************/

import type { DocEntry } from '../docs';
import { t } from '../i18n/strings';

const MENU_ID = 'doc-menu';

/**
 * Purpose: Callbacks driving the doc menu (selection + lifecycle actions).
 * How: Plain interface; one handler per row action, plus list + current uuid.
 */
export interface DocMenuOptions {
  docs: DocEntry[];
  currentUuid: string;
  onSelect(uuid: string): void;
  onCreate(): void;
  onRenameCurrent(name: string): void;
  onRenameOther(uuid: string, name: string): void;
  onDuplicate(uuid: string): void;
  onDelete(uuid: string): void;
}

/**
 * Purpose: Mount the doc-menu dropdown anchored below `anchor`.
 * How: Build header rename input + new button + other-doc rows; defer
 *   dismissal listeners by one tick to avoid the opening click closing us.
 */
// Drops the dropdown menu below `anchor`. Pattern shared with
// style-menu.ts: mount one transient div, dismiss on outside click /
// Escape / window resize. The current doc lives at the top as an
// editable input; the other docs are listed below by mtime desc.
export function openDocMenu(
  anchor: HTMLElement,
  opts: DocMenuOptions,
): void {
  document.getElementById(MENU_ID)?.remove();

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'doc-menu';
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

  // ---- Current doc: editable name input -------------------------------
  const current = opts.docs.find((d) => d.uuid === opts.currentUuid);
  if (current) {
    const row = document.createElement('div');
    row.className = 'doc-menu-current';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current.name;
    input.className = 'doc-menu-current-input';
    input.spellcheck = false;
    // Keep the original around so Esc can revert without us having
    // tracked every keystroke.
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
    // Commit on blur too — clicking away while the input was edited
    // is a reasonable confirm.
    input.addEventListener('blur', () => {
      if (input.value !== original) opts.onRenameCurrent(input.value);
    });
    row.append(input);
    menu.append(row);
    // Focus + select the input when the menu opens so the user can
    // start typing immediately to rename.
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  // ---- "+ Nouveau document" ------------------------------------------
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'doc-menu-new';
  newBtn.textContent = t('doc-menu.new');
  newBtn.addEventListener('click', () => {
    opts.onCreate();
    close();
  });
  menu.append(newBtn);

  // ---- Other docs ----------------------------------------------------
  const others = opts.docs.filter((d) => d.uuid !== opts.currentUuid);
  if (others.length > 0) {
    const sep = document.createElement('div');
    sep.className = 'doc-menu-sep';
    menu.append(sep);

    const list = document.createElement('div');
    list.className = 'doc-menu-list';
    for (const doc of others) list.append(buildOtherRow(doc, opts, close));
    menu.append(list);
  }

  document.body.appendChild(menu);

  // Clamp to viewport.
  const r = menu.getBoundingClientRect();
  if (r.right > globalThis.innerWidth) {
    menu.style.left = `${Math.max(4, globalThis.innerWidth - r.width - 4)}px`;
  }
  if (r.bottom > globalThis.innerHeight) {
    menu.style.top = `${Math.max(4, globalThis.innerHeight - r.height - 4)}px`;
  }

  // Defer dismissal listeners by one tick so the click that opened
  // us doesn't immediately close.
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    globalThis.addEventListener('resize', close);
  }, 0);
}

/**
 * Purpose: One non-current-doc row — name, relative mtime, hover actions.
 * How: Main button calls `onSelect`; rename/duplicate/delete buttons appear on hover.
 */
function buildOtherRow(
  doc: DocEntry,
  opts: DocMenuOptions,
  close: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'doc-menu-row';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'doc-menu-row-main';
  const nameEl = document.createElement('span');
  nameEl.className = 'doc-menu-name';
  nameEl.textContent = doc.name;
  const dateEl = document.createElement('span');
  dateEl.className = 'doc-menu-date';
  dateEl.textContent = relativeTime(doc.mtime);
  main.append(nameEl, dateEl);
  main.addEventListener('click', () => {
    opts.onSelect(doc.uuid);
    close();
  });
  row.append(main);

  // Hover-revealed actions.
  const actions = document.createElement('div');
  actions.className = 'doc-menu-actions';

  const renameBtn = actionBtn(t('doc-menu.rename'), () => {
    enterInlineRename(row, nameEl, doc, opts);
  });
  const dupBtn = actionBtn(t('doc-menu.duplicate'), () => {
    opts.onDuplicate(doc.uuid);
    close();
  });
  const delBtn = actionBtn(t('doc-menu.delete'), () => {
    if (globalThis.confirm(t('doc-menu.delete-confirm', { name: doc.name }))) {
      opts.onDelete(doc.uuid);
      close();
    }
  });
  actions.append(renameBtn, dupBtn, delBtn);
  row.append(actions);

  return row;
}

/**
 * Purpose: Small per-row action button factory.
 * How: `<button class="doc-menu-action">` with stopPropagation on click.
 */
function actionBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'doc-menu-action';
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/**
 * Purpose: Swap a row's name span for an inline rename input.
 * How: Enter / blur commits via `onRenameOther`, Escape reverts to the original.
 */
// Replaces the row's name span with an input so the user can rename
// without leaving the dropdown. Enter commits, Escape cancels, blur
// commits any change.
function enterInlineRename(
  row: HTMLElement,
  nameEl: HTMLElement,
  doc: DocEntry,
  opts: DocMenuOptions,
): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = doc.name;
  input.className = 'doc-menu-rename-input';
  input.spellcheck = false;
  const original = doc.name;
  let committed = false;
  const commit = (name: string): void => {
    if (committed) return;
    committed = true;
    if (name !== original) opts.onRenameOther(doc.uuid, name);
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
  // Replace the name span with the input. The row's hover actions
  // remain in place so the user can still click another action.
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  // Tag so CSS can dim the actions while editing if needed.
  row.classList.add('doc-menu-row-renaming');
}

/**
 * Purpose: Compact FR relative-time label ("il y a 3 j", "il y a 2 sem", …).
 * How: Walk `Date.now() - mtime` through fixed thresholds (sec/min/h/d/w/mo/y).
 */
// "il y a 3 j", "il y a 2 sem", … Lightweight FR formatter — no
// Intl.RelativeTimeFormat dependency, and the output is the kind of
// loose label the dropdown needs.
function relativeTime(mtime: number): string {
  const diffMs = Date.now() - mtime;
  if (diffMs < 0) return 'tout à l’heure';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'à l’instant';
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  const w = Math.floor(d / 7);
  if (w < 5) return `il y a ${w} sem`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  const y = Math.floor(d / 365);
  return `il y a ${y} an${y > 1 ? 's' : ''}`;
}
