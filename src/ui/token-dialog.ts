/******************************** token-dialog.ts ******************************
 *
 * Purpose: Ask for the GitHub token in a real dialog. It used to be a native
 *   `prompt()`, whose text can be neither clicked nor selected: the address of
 *   GitHub's token page had to be retyped by hand.
 * How: A modal with the three steps, a CLICKABLE link to GitHub's token form
 *   — pre-filled through GitHub's documented URL parameters (name,
 *   description, `contents=write`), so only the repositories remain to be
 *   chosen —, a password field to paste the token into, and inline validation:
 *   `validate` (getUser) runs before the dialog closes, an invalid token says
 *   so and lets the user try again. Resolves with the token, or null when
 *   cancelled. The token is never echoed. With `reason: 'refused'` it first
 *   says that GitHub rejects the stored token (expired or revoked) — the
 *   dialog then REPLACES it.
 *
 ****************************************************************************/

import { t } from '../i18n/strings';

/** GitHub's fine-grained token form, pre-filled for markpage. */
export const TOKEN_FORM_URL =
  'https://github.com/settings/personal-access-tokens/new' +
  '?name=markpage&description=markpage.org+%E2%80%94+documents&contents=write';

const DIALOG_ID = 'mp-token-dialog';

/**
 * Ask for a GitHub token. `validate` rejects an invalid one (its message is
 * not shown: the dialog says "invalid or expired").
 */
export function askGithubToken(
  validate: (token: string) => Promise<unknown>,
  opts: { reason?: 'refused' } = {},
): Promise<string | null> {
  const doc = document;
  if (doc.getElementById(DIALOG_ID)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const overlay = doc.createElement('div');
    overlay.id = DIALOG_ID;
    overlay.className = 'vb-overlay';
    const panel = doc.createElement('form');
    panel.className = 'vb-panel mp-token-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', t('github.token-title'));

    const header = doc.createElement('header');
    const title = doc.createElement('h2');
    title.textContent = t('github.token-title');
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'close';
    closeBtn.textContent = t('open.close');
    header.append(title, closeBtn);

    const body = doc.createElement('div');
    body.className = 'mp-token-dialog-body';
    const intro = doc.createElement('p');
    intro.textContent = t('github.token-intro');
    if (opts.reason === 'refused') {
      // The stored token no longer works: say so first, it is why we ask.
      const refused = doc.createElement('p');
      refused.className = 'mp-token-refused';
      refused.setAttribute('role', 'alert');
      refused.textContent = t('github.token-refused');
      body.append(refused);
    }
    const steps = doc.createElement('ol');
    const step1 = doc.createElement('li');
    const link = doc.createElement('a');
    link.href = TOKEN_FORM_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('github.token-link');
    step1.append(link, doc.createTextNode(` ${t('github.token-step1')}`));
    const step2 = doc.createElement('li');
    step2.textContent = t('github.token-step2');
    const step3 = doc.createElement('li');
    step3.textContent = t('github.token-step3');
    steps.append(step1, step2, step3);

    const input = doc.createElement('input');
    input.type = 'password';
    input.className = 'mp-token-input';
    input.placeholder = 'github_pat_…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', t('github.token-field'));
    const error = doc.createElement('p');
    error.className = 'mp-token-error';
    error.setAttribute('role', 'alert');
    body.append(intro, steps, input, error);

    const footer = doc.createElement('footer');
    footer.className = 'vb-footer';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t('github.token-cancel');
    const save = doc.createElement('button');
    save.type = 'submit';
    save.className = 'mp-token-save';
    save.textContent = t('github.token-save');
    footer.append(cancel, save);

    panel.append(header, body, footer);
    overlay.append(panel);

    const finish = (token: string | null): void => {
      doc.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(token);
    };
    // Captured, and stopped: Escape closes THIS dialog, not the Open browser
    // it was asked from, which listens for it too.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish(null);
    };
    closeBtn.addEventListener('click', () => finish(null));
    cancel.addEventListener('click', () => finish(null));
    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      const token = input.value.trim();
      if (token === '') {
        input.focus();
        return;
      }
      error.textContent = '';
      save.disabled = true;
      save.textContent = t('github.token-checking');
      validate(token).then(
        () => finish(token),
        () => {
          save.disabled = false;
          save.textContent = t('github.token-save');
          error.textContent = t('settings.github.invalid');
          input.select();
        },
      );
    });
    doc.addEventListener('keydown', onKey, true);
    doc.body.append(overlay);
    input.focus();
  });
}
