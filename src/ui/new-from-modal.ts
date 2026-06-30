/********************************* new-from-modal.ts ***************************
 *
 * Purpose: Pick a library document to base a new one on — the "Nouveau à
 *   partir de…" gesture (STACK-SPEC §3.4): the new document `extends` the
 *   chosen layer (a style, a letterhead, a template) and inherits its frame +
 *   styles.
 * How: A small centered overlay listing the documents by name; clicking one
 *   resolves the promise with its name, Cancel / Escape / click-outside resolve
 *   with null. Reuses the shared modal styling.
 *
 *******************************************************************************/

import { t } from '../i18n/strings';

const OVERLAY_ID = 'new-from-overlay';

/** Options for reusing the picker as a "Style parent" chooser. */
export interface NewFromModalOptions {
  /** Override the heading (default: the "Nouveau à partir de…" title). */
  title?: string;
  /** When set, a top entry that resolves with `''` (clear / no parent). */
  noneLabel?: string;
  /** Name of the currently-selected document, marked in the list. */
  currentName?: string | null;
}

/**
 * Resolve with the chosen document name, `''` when the "none" entry is picked
 * (only when `noneLabel` is given), or `null` when cancelled.
 */
export function openNewFromModal(
  docs: { uuid: string; name: string }[],
  opts: NewFromModalOptions = {},
): Promise<string | null> {
  document.getElementById(OVERLAY_ID)?.remove();

  return new Promise<string | null>((resolve) => {
    const heading = opts.title ?? t('new-from.title');
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'missing-resources-overlay';

    const panel = document.createElement('div');
    panel.className = 'missing-resources-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', heading);

    const title = document.createElement('h2');
    title.textContent = heading;
    panel.append(title);

    let done = false;
    const finish = (name: string | null): void => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(name);
    };

    const entry = (label: string, value: string, marked: boolean): HTMLElement => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'file-menu-item';
      btn.textContent = marked ? `✓ ${label}` : label;
      btn.addEventListener('click', () => finish(value));
      li.append(btn);
      return li;
    };

    if (docs.length === 0 && opts.noneLabel === undefined) {
      const empty = document.createElement('p');
      empty.className = 'intro';
      empty.textContent = t('new-from.empty');
      panel.append(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'missing-list';
      if (opts.noneLabel !== undefined) {
        list.append(entry(opts.noneLabel, '', !opts.currentName)); // '' = clear
      }
      for (const doc of docs) {
        list.append(entry(doc.name, doc.name, doc.name === opts.currentName));
      }
      panel.append(list);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn-secondary';
    cancel.textContent = t('new-from.cancel');
    cancel.addEventListener('click', () => finish(null));
    actions.append(cancel);
    panel.append(actions);

    overlay.append(panel);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null);
    });
    document.body.append(overlay);

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(null);
    };
    document.addEventListener('keydown', onKey);
  });
}
