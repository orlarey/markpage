/********************************* settings-panel.ts ***************************
 *
 * Purpose: Modal fallback for the Réglages dialog when popup windows are blocked.
 * How: Wrap `buildSettingsForm` in an overlay, append a Close button to its
 *   header, and dismiss on backdrop click / Escape.
 *
 *******************************************************************************/

// Modal fallback for the Réglages dialog. The preferred surface is
// the detached browser window in settings-window.ts, which lets the
// user keep the preview visible side-by-side and tweak settings in
// real time. We only fall back here when the popup is blocked.

import { buildSettingsForm, type SettingsFormHandlers } from './settings-form';

/** Modal-form callback set — the full settings-form handler set. */
export type SettingsPanelHandlers = SettingsFormHandlers;

/**
 * Purpose: Mount the in-app Réglages overlay, single-instance.
 * How: Build the shared form into a `.settings-overlay`, attach a Close button + Escape handler.
 */
export function openSettingsPanel(handlers: SettingsPanelHandlers): void {
  // Single instance.
  if (document.getElementById('settings-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.className = 'settings-overlay';

  const { root } = buildSettingsForm(document, handlers);

  // Attach a Close button at the top of the panel — buildSettingsForm
  // doesn't ship one because the detached-window variant uses the
  // browser's own window controls.
  const header = root.querySelector('header');
  if (header) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Fermer';
    closeBtn.classList.add('close');
    closeBtn.addEventListener('click', () => close());
    header.append(closeBtn);
  }

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  overlay.appendChild(root);
  document.body.appendChild(overlay);
}
