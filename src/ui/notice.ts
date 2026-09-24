/********************************* notice.ts ***********************************
 *
 * Purpose: A small non-blocking message at the top of the window — a passing
 *   notice ("already open in another tab") or a persistent banner with one
 *   action ("read-only here — edit it here").
 * How: One element per `id` (re-showing replaces it); transient notices fade
 *   after a few seconds, sticky ones stay until `hideNotice(id)`.
 *
 *******************************************************************************/

export interface NoticeOptions {
  /** Stable id: showing the same id again replaces the message. */
  id?: string;
  /** Stay until hideNotice(id) instead of fading after a few seconds. */
  sticky?: boolean;
  /** One button next to the text. */
  action?: { label: string; run: () => void };
}

export function showNotice(text: string, opts: NoticeOptions = {}): void {
  const id = opts.id ?? 'mp-notice';
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'mp-notice';
  el.setAttribute('role', 'status');
  const msg = document.createElement('span');
  msg.textContent = text;
  el.append(msg);
  if (opts.action) {
    const { label, run } = opts.action;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', run);
    el.append(btn);
  }
  document.body.append(el);
  if (!opts.sticky) setTimeout(() => el.remove(), 5000);
}

export function hideNotice(id: string): void {
  document.getElementById(id)?.remove();
}
