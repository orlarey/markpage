// Detached-window surface for Réglages, modelled on help-window.ts.
// The user can place this window beside the editor / preview and
// see the effect of every change in real time without the modal
// covering the page.
//
// Falls back to the in-app overlay (settings-panel.ts) when the
// popup is blocked.

import { buildSettingsForm } from './settings-form';
import { openSettingsPanel } from './settings-panel';
import type { PdfSettings } from '../settings';
// Bundling the whole app stylesheet keeps the popup visually
// consistent with the parent — same colours, same field layout.
import appCss from '../style.css?inline';

export interface SettingsWindowHandlers {
  getSettings(): PdfSettings;
  onChange(s: PdfSettings): void;
}

let currentWindow: Window | null = null;

export function openSettingsWindow(handlers: SettingsWindowHandlers): void {
  // Refocus an already-open window instead of spawning a second.
  if (currentWindow && !currentWindow.closed) {
    currentWindow.focus();
    return;
  }

  // Opening at a width that comfortably fits two columns of the
  // settings grid (minmax 26rem ≈ 416px each, plus gaps + padding).
  // The user can shrink to a single column if they want; resizing
  // wider triggers a third column on very wide displays.
  const win = globalThis.open(
    '',
    'md2pdf-settings',
    'width=920,height=820,scrollbars=yes,resizable=yes',
  );
  if (!win) {
    // Popup blocked — fall back to the modal so the user still has
    // access to the settings.
    openSettingsPanel(handlers);
    return;
  }
  currentWindow = win;

  win.document.title = 'Réglages md2pdf';
  win.document.documentElement.lang = 'fr';
  win.document.head.innerHTML = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${appCss}</style>
    <style>${windowSpecificCss()}</style>
  `;
  win.document.body.innerHTML = '';
  win.document.body.classList.add('settings-window-body');

  const { root } = buildSettingsForm(win.document, handlers);
  // The form's own header carries the title; the popup chrome
  // handles closing, so we don't add a Close button here.
  win.document.body.appendChild(root);

  // Forward Escape to close the window so the keystroke matches the
  // modal's behaviour.
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      win.close();
    }
  });

  // Clear our reference if the user closes the popup so the next
  // click re-opens cleanly.
  const checkClosed = setInterval(() => {
    if (win.closed) {
      currentWindow = null;
      clearInterval(checkClosed);
    }
  }, 1000);
}

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
      max-width: none;
      max-height: none;
      box-shadow: none;
      border: none;
      padding: 0;
      background: transparent;
    }
  `;
}
