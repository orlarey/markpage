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

/** Resolve with the chosen document name, or null when cancelled. */
export function openNewFromModal(docs: { uuid: string; name: string }[]): Promise<string | null> {
  document.getElementById(OVERLAY_ID)?.remove();

  return new Promise<string | null>((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'missing-resources-overlay';

    const panel = document.createElement('div');
    panel.className = 'missing-resources-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('new-from.title'));

    const title = document.createElement('h2');
    title.textContent = t('new-from.title');
    panel.append(title);

    let done = false;
    const finish = (name: string | null): void => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(name);
    };

    if (docs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'intro';
      empty.textContent = t('new-from.empty');
      panel.append(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'missing-list';
      for (const doc of docs) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'file-menu-item';
        btn.textContent = doc.name;
        btn.addEventListener('click', () => finish(doc.name));
        li.append(btn);
        list.append(li);
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
