/********************************* settings-window.ts **************************
 *
 * Purpose: Detached-window surface for Réglages, lets the user keep preview
 *   visible while tweaking settings live.
 * How: `window.open()` for a stable secondary window (modal fallback when blocked),
 *   bundle the app CSS via `?inline`, mount the shared `buildSettingsForm`.
 *
 *******************************************************************************/

// Detached-window surface for Réglages, modelled on help-window.ts.
// The user can place this window beside the editor / preview and
// see the effect of every change in real time without the modal
// covering the page.
//
// Falls back to the in-app overlay (settings-panel.ts) when the
// popup is blocked.

import { buildSettingsForm, type SettingsFormHandlers } from './settings-form';
import { openSettingsPanel } from './settings-panel';
import { t } from '../i18n/strings';
// Bundling the whole app stylesheet keeps the popup visually
// consistent with the parent — same colours, same field layout.
import appCss from '../style.css?inline';

/** Detached-window callback set — the full settings-form handler set. */
export type SettingsWindowHandlers = SettingsFormHandlers;

let currentWindow: Window | null = null;
let currentRefresh: (() => void) | null = null;

/**
 * Purpose: Open (or refocus) the Réglages popup window; fall back to the modal if blocked.
 * How: `window.open` then mount the shared form; returns a `{ refresh }` handle for
 *   external repaints, or null when the caller doesn't own the form.
 */
// Returns a handle the caller can use to repaint the form when the
// underlying state moves under its feet (e.g. after a profile
// switch from outside the form itself). Returns null when the window
// is already open or when the popup is blocked and we fell back to
// the modal — in both cases the caller doesn't own the form.
export function openSettingsWindow(
  handlers: SettingsWindowHandlers,
): { refresh: () => void } | null {
  // Refocus an already-open window instead of spawning a second.
  if (currentWindow && !currentWindow.closed) {
    currentWindow.focus();
    return currentRefresh ? { refresh: currentRefresh } : null;
  }

  // Opening at a width that comfortably fits two columns of the
  // settings grid (minmax 30rem ≈ 480px each, plus gaps + padding).
  // The user can shrink to a single column if they want; resizing
  // wider triggers a third column on very wide displays.
  const win = globalThis.open(
    '',
    'markpage-settings',
    'width=1080,height=820,scrollbars=yes,resizable=yes',
  );
  if (!win) {
    // Popup blocked — fall back to the modal so the user still has
    // access to the settings.
    return openSettingsPanel(handlers);
  }
  currentWindow = win;

  win.document.title = t('settings.window-title');
  win.document.documentElement.lang = 'fr';
  win.document.head.innerHTML = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${appCss}</style>
    <style>${windowSpecificCss()}</style>
  `;
  win.document.body.innerHTML = '';
  win.document.body.classList.add('settings-window-body');

  const { root, refresh } = buildSettingsForm(win.document, handlers);
  currentRefresh = refresh;
  // The form's own header carries the title; the popup chrome
  // handles closing, so we don't add a Close button here.
  win.document.body.appendChild(root);

  // Forward Escape to close the window so the keystroke matches the
  // modal's behaviour.
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      win.close();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) handlers.onRedo();
      else handlers.onUndo();
    }
  });

  // Clear our reference if the user closes the popup so the next
  // click re-opens cleanly.
  const checkClosed = setInterval(() => {
    if (win.closed) {
      currentWindow = null;
      currentRefresh = null;
      clearInterval(checkClosed);
    }
  }, 1000);

  return { refresh };
}

/**
 * Purpose: Window-only CSS that neutralises the modal overlay framing.
 * How: Returns a CSS string concatenated after the bundled app stylesheet.
 */
// Strips the modal-overlay framing and lays the form out as the
// window's full content. The .settings-panel rules already control
// the inner layout; we just neutralise the overlay box-shadow /
// max-height that the modal version uses.
function windowSpecificCss(): string {
  return `
    body.settings-window-body {
      margin: 0;
      padding: 1rem 1.25rem;
      background: #fff;
      font-family: var(--font-sans, system-ui);
    }
    body.settings-window-body .settings-panel {
      /* The base rule pins .settings-panel at min(560px, 92vw) for
         the modal overlay. In the detached window we want it to
         fill the popup so the inner grid can actually use the
         horizontal space — without this override, widening the
         window just adds empty space to the right of a 560px panel. */
      width: 100%;
      max-width: none;
      max-height: none;
      box-shadow: none;
      border: none;
      padding: 0;
      background: transparent;
    }
  `;
}
