/******************************** github-transfer.ts ***************************
 *
 * Purpose: Carry the GitHub token from a device where it is set up to another
 *   one — Mac → iPhone, say — without retyping it and without any server. The
 *   token lives in each browser's IndexedDB (github.ts) and no browser sync
 *   carries it; pasting it on every device was the only way.
 * How: The configured device shows a QR code of
 *   `https://markpage.org/#gh-token=<token>`; the other device scans it with
 *   its camera, which opens markpage. A URL FRAGMENT is never sent to a server:
 *   the token goes from one screen to the other and nowhere else. At boot,
 *   markpage takes the token out of the address at once (history.replaceState,
 *   so it is not left in the history either), checks it against GitHub, asks
 *   the user to confirm the account it belongs to, and stores it.
 *
 *   The confirmation matters: a link carrying SOMEONE ELSE's token would
 *   otherwise silently switch this device to that account.
 *
 ****************************************************************************/

import qrcode from 'qrcode-generator';
import { t } from './i18n/strings';

/** The fragment key that carries a transferred token. */
export const TRANSFER_KEY = 'gh-token';

/** How long the QR code stays on screen. */
export const TRANSFER_SHOW_MS = 60_000;

/**
 * The address that hands `token` to another device: this page's address
 * (origin + path, no query) with the token in the fragment. Pure.
 */
export function transferUrl(token: string, here: { origin: string; pathname: string }): string {
  return `${here.origin}${here.pathname}#${TRANSFER_KEY}=${encodeURIComponent(token)}`;
}

/**
 * Take a transferred token out of the current address: return it, and remove
 * it from the address and the history entry at once (the rest of the fragment
 * is kept). Null when the address carries none.
 */
export function takeTransferredToken(
  loc: { hash: string; pathname: string; search: string },
  history: { replaceState(data: unknown, unused: string, url?: string): void },
): string | null {
  const hash = loc.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get(TRANSFER_KEY);
  if (token === null) return null;
  params.delete(TRANSFER_KEY);
  const rest = params.toString();
  history.replaceState(null, '', `${loc.pathname}${loc.search}${rest ? `#${rest}` : ''}`);
  const clean = token.trim();
  return clean === '' ? null : clean;
}

/** An SVG QR code of `text` (error correction M, quiet zone of 4 modules). */
export function qrSvg(text: string, cellSize = 5): SVGSVGElement {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const markup = qr.createSvgTag({ cellSize, margin: 4 * cellSize, scalable: true });
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('github.transfer-qr-label'));
  return svg;
}

/**
 * Show the QR code that hands `token` to another device, for TRANSFER_SHOW_MS
 * at most. The token itself is never displayed as text.
 */
export function showTokenTransfer(token: string): void {
  const doc = document;
  if (doc.getElementById('mp-token-transfer')) return;
  const overlay = doc.createElement('div');
  overlay.id = 'mp-token-transfer';
  overlay.className = 'vb-overlay';
  const panel = doc.createElement('div');
  panel.className = 'vb-panel mp-token-transfer';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('github.transfer-title'));

  const header = doc.createElement('header');
  const title = doc.createElement('h2');
  title.textContent = t('github.transfer-title');
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'close';
  closeBtn.textContent = t('open.close');
  header.append(title, closeBtn);

  const body = doc.createElement('div');
  body.className = 'mp-token-transfer-body';
  const how = doc.createElement('p');
  how.textContent = t('github.transfer-how');
  const code = doc.createElement('div');
  code.className = 'mp-token-transfer-qr';
  code.append(qrSvg(transferUrl(token, location)));
  const warn = doc.createElement('p');
  warn.className = 'mp-token-transfer-warn';
  warn.textContent = t('github.transfer-warning');
  const timer = doc.createElement('p');
  timer.className = 'mp-token-transfer-timer';
  body.append(how, code, warn, timer);
  panel.append(header, body);
  overlay.append(panel);

  let left = Math.round(TRANSFER_SHOW_MS / 1000);
  const tick = (): void => {
    timer.textContent = t('github.transfer-timer', { s: String(left) });
  };
  tick();
  const interval = setInterval(() => {
    left -= 1;
    if (left <= 0) close();
    else tick();
  }, 1000);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  function close(): void {
    clearInterval(interval);
    doc.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  doc.addEventListener('keydown', onKey);
  doc.body.append(overlay);
}
