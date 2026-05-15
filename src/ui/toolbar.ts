/********************************* toolbar.ts **********************************
 *
 * Purpose: Build the app toolbar — brand, doc trigger, import, style, help,
 *   preview-toggle, export, settings — and return a small control surface for
 *   live label / view-mode updates.
 * How: Static DOM via `document.createElement`, each button wired to one of the
 *   caller's handlers; `mountToolbar` returns `{ setViewMode, setDocName }`.
 *
 *******************************************************************************/

import { t } from '../i18n/strings';
import { makeLogo } from './logo';

export type ViewMode = 'editor' | 'preview';

/**
 * Purpose: All callbacks consumed by the toolbar's buttons, plus the initial state.
 * How: Plain interface; dropdown handlers receive the trigger element / coords to anchor on.
 */
export interface ToolbarHandlers {
  initialDocName: string;
  initialViewMode: ViewMode;
  // Click on the [Mon doc ▾] button. Receives the trigger element so
  // the caller can anchor the dropdown to it without re-querying.
  onDocMenu(anchor: HTMLElement): void;
  onImport(): void;
  onStyle(anchor: { x: number; y: number }): void;
  onHelp(): void;
  // Click on [Exporter ▾]. Receives the trigger element so the
  // dropdown anchors to it.
  onExport(anchor: HTMLElement): void;
  onSettings(): void;
  onTogglePreview(): void;
}

/**
 * Purpose: Post-mount control surface — exposes the few labels that change at runtime.
 * How: Just two setters: view-mode (preview toggle aria-state) and doc-name.
 */
export interface ToolbarControl {
  setViewMode(mode: ViewMode): void;
  // Update the label shown on [Mon doc ▾] after a rename / switch /
  // create. The trailing caret stays.
  setDocName(name: string): void;
}

/**
 * Purpose: Build all toolbar buttons and append them under `parent`.
 * How: Mint each control sequentially, wire to the matching handler,
 *   and return setters for the post-mount mutable labels.
 */
export function mountToolbar(
  parent: HTMLElement,
  handlers: ToolbarHandlers,
): ToolbarControl {
  parent.innerHTML = '';

  // [Mon doc ▾] — fused doc selector + current-name display. Click
  // delegates to the caller, which opens the doc-menu dropdown
  // anchored on this button.
  const docBtn = document.createElement('button');
  docBtn.type = 'button';
  docBtn.className = 'menu-trigger doc-trigger';
  docBtn.title = t('toolbar.docs-title');
  const docLabel = document.createElement('span');
  docLabel.className = 'doc-trigger-label';
  docLabel.textContent = handlers.initialDocName;
  const docCaret = document.createElement('span');
  docCaret.className = 'menu-caret';
  docCaret.textContent = '▾';
  docBtn.append(docLabel, docCaret);
  docBtn.addEventListener('click', () => handlers.onDocMenu(docBtn));

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = t('toolbar.import');
  importBtn.title = t('toolbar.import-title');
  importBtn.addEventListener('click', () => handlers.onImport());

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'preview-toggle';
  previewBtn.textContent = t('toolbar.preview');
  previewBtn.title = t('toolbar.preview-title');
  previewBtn.setAttribute(
    'aria-pressed',
    handlers.initialViewMode === 'preview' ? 'true' : 'false',
  );
  previewBtn.addEventListener('click', () => handlers.onTogglePreview());

  const styleBtn = document.createElement('button');
  styleBtn.type = 'button';
  styleBtn.className = 'menu-trigger';
  styleBtn.title = t('toolbar.style-title');
  const styleLabel = document.createTextNode(t('toolbar.style'));
  const styleCaret = document.createElement('span');
  styleCaret.className = 'menu-caret';
  styleCaret.textContent = '▾';
  styleBtn.append(styleLabel, styleCaret);
  // Don't steal focus from the editor — keeps the cursor / selection alive
  // so the menu commands operate on the user's intended target.
  styleBtn.addEventListener('mousedown', (e) => e.preventDefault());
  styleBtn.addEventListener('click', () => {
    const rect = styleBtn.getBoundingClientRect();
    handlers.onStyle({ x: rect.left, y: rect.bottom + 4 });
  });

  const helpBtn = document.createElement('button');
  helpBtn.type = 'button';
  helpBtn.className = 'help-btn';
  helpBtn.textContent = t('toolbar.help');
  helpBtn.title = t('toolbar.help-title');
  helpBtn.addEventListener('click', () => handlers.onHelp());

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'menu-trigger';
  exportBtn.title = t('toolbar.export-title');
  const exportLabel = document.createTextNode(t('toolbar.export'));
  const exportCaret = document.createElement('span');
  exportCaret.className = 'menu-caret';
  exportCaret.textContent = '▾';
  exportBtn.append(exportLabel, exportCaret);
  exportBtn.addEventListener('click', () => handlers.onExport(exportBtn));

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'menu-trigger';
  settingsBtn.title = t('toolbar.settings-title');
  const settingsLabel = document.createTextNode(t('toolbar.settings'));
  const settingsCaret = document.createElement('span');
  settingsCaret.className = 'menu-caret';
  settingsCaret.textContent = '▾';
  settingsBtn.append(settingsLabel, settingsCaret);
  settingsBtn.addEventListener('click', () => handlers.onSettings());

  // Logo wraps in an <a> linking to the showcase so the toolbar and
  // showcase are reciprocal home buttons: showcase has a logo top-
  // left linking to ./index.html, editor has one linking back to
  // ./showcase.html.
  const logoLink = document.createElement('a');
  logoLink.href = './showcase.html';
  logoLink.className = 'markpage-logo-slot';
  logoLink.title = 'Open the showcase';
  logoLink.setAttribute('aria-label', 'Open the showcase');
  logoLink.append(makeLogo(document, 'full'));

  // Version stamp — Vite swaps `__APP_VERSION__` for the
  // package.json version at build time. Muted styling so it reads
  // as a metadata annotation, not a control.
  const version = document.createElement('span');
  version.className = 'toolbar-version';
  version.textContent = `v${__APP_VERSION__}`;

  // Logo + version are wrapped in a baseline-aligned sub-flex so
  // their typography sits on the same line (the toolbar's own flex
  // is `align-items: center`, which puts the small version text
  // visually higher than the bigger logo).
  const brandSlot = document.createElement('div');
  brandSlot.className = 'toolbar-brand';
  brandSlot.append(logoLink, version);

  const left = document.createElement('div');
  left.className = 'toolbar-left';
  left.append(brandSlot, docBtn, importBtn, styleBtn);

  const center = document.createElement('div');
  center.className = 'toolbar-center';
  center.append(helpBtn);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  right.append(previewBtn, exportBtn, settingsBtn);

  parent.append(left, center, right);

  return {
    setViewMode(mode: ViewMode) {
      previewBtn.setAttribute(
        'aria-pressed',
        mode === 'preview' ? 'true' : 'false',
      );
    },
    setDocName(name: string) {
      docLabel.textContent = name;
    },
  };
}
