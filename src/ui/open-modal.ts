/********************************* open-modal.ts *******************************
 *
 * Purpose: The `Open…` picker — a lightweight modal to choose a document to
 *   *edit*. Pure selector: no management verbs (those live in `Files…`).
 * How: Single overlay/panel (same pattern as help-modal); a search box filters
 *   the doc list; clicking a row (or Enter on the search) opens it; Esc /
 *   backdrop dismiss.
 *
 *******************************************************************************/

import type { DocEntry } from '../docs';
import { isModified } from '../docs';
import { t } from '../i18n/strings';
import { relativeTime } from './doc-menu';

const OVERLAY_ID = 'open-overlay';

export interface OpenModalOptions {
  docs: DocEntry[]; // active docs, mtime desc
  currentUuid: string;
  onOpen(uuid: string): void;
}

/** Open the `Open…` document picker (single-instance). */
export function openOpenModal(opts: OpenModalOptions): void {
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'open-overlay';

  const panel = document.createElement('div');
  panel.className = 'open-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('open.title'));

  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = t('open.title');
  const actions = document.createElement('div');
  actions.className = 'actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'close';
  closeBtn.textContent = t('open.close');
  actions.append(closeBtn);
  header.append(title, actions);

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'open-search';
  search.placeholder = t('open.search');
  search.setAttribute('aria-label', t('open.search'));

  const list = document.createElement('div');
  list.className = 'open-list';

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const open = (uuid: string): void => {
    close();
    opts.onOpen(uuid);
  };

  const matching = (): DocEntry[] => {
    const q = search.value.trim().toLowerCase();
    return q === ''
      ? opts.docs
      : opts.docs.filter((d) => d.name.toLowerCase().includes(q));
  };

  const render = (): void => {
    const matches = matching();
    list.replaceChildren();
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'open-empty';
      empty.textContent = t('open.empty');
      list.append(empty);
      return;
    }
    for (const d of matches) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'open-row';
      if (d.uuid === opts.currentUuid) row.classList.add('open-row-current');
      const name = document.createElement('span');
      name.className = 'open-row-name';
      name.textContent = d.name;
      if (isModified(d)) {
        const dot = document.createElement('span');
        dot.className = 'open-row-dot';
        dot.textContent = '●';
        dot.title = t('toolbar.modified-title');
        name.append(' ', dot);
      }
      const date = document.createElement('span');
      date.className = 'open-row-date';
      date.textContent = relativeTime(d.mtime);
      row.append(name, date);
      row.addEventListener('click', () => open(d.uuid));
      list.append(row);
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = matching()[0];
      if (first) open(first.uuid);
    }
  });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  panel.append(header, search, list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  render();
  search.focus();
}
