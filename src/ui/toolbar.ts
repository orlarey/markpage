/********************************* toolbar.ts **********************************
 *
 * Purpose: Build the app toolbar — brand, File menu, editable doc title,
 *   Style, Help, preview-toggle, present, guides, settings — and return a
 *   small control surface for live label / view-mode / modified updates.
 * How: Static DOM via `document.createElement`, each control wired to one of
 *   the caller's handlers. The File menu consolidates the old Mon doc /
 *   Importer / Exporter controls (Phase 3d); the document name is now an
 *   inline-editable title.
 *
 *******************************************************************************/

import { t } from '../i18n/strings';
import { makeLogo } from './logo';

export type ViewMode = 'editor' | 'preview';

/**
 * Purpose: All callbacks consumed by the toolbar's controls, plus initial state.
 */
export interface ToolbarHandlers {
  initialDocName: string;
  initialViewMode: ViewMode;
  // Click on [File ▾]. Receives the trigger element so the caller can anchor
  // the dropdown to it.
  onFileMenu(anchor: HTMLElement): void;
  // Commit a new name for the current document (inline title edit).
  onRenameCurrent(name: string): void;
  onStyle(anchor: { x: number; y: number }): void;
  onHelp(): void;
  onSettings(): void;
  onTogglePreview(): void;
  // One-shot fullscreen presentation (exit via Esc / fullscreenchange).
  onPresent(): void;
  onToggleGuides(): void;
}

/**
 * Purpose: Post-mount control surface — the labels/state that change at runtime.
 */
export interface ToolbarControl {
  setViewMode(mode: ViewMode): void;
  // Update the editable doc title after a rename / switch / create.
  setDocName(name: string): void;
  setGuidesPressed(pressed: boolean): void;
  // Show / hide the "modified" dot when the current doc has unsaved edits.
  setModified(modified: boolean): void;
}

/**
 * Purpose: Build the toolbar controls and append them under `parent`.
 */
export function mountToolbar(
  parent: HTMLElement,
  handlers: ToolbarHandlers,
): ToolbarControl {
  parent.innerHTML = '';

  // [File ▾] — consolidates document lifecycle + import/export. The caller
  // opens the dropdown anchored on this button.
  const fileBtn = document.createElement('button');
  fileBtn.type = 'button';
  fileBtn.className = 'menu-trigger file-trigger';
  fileBtn.title = t('toolbar.file-title');
  const fileLabel = document.createTextNode(t('toolbar.file'));
  const fileCaret = document.createElement('span');
  fileCaret.className = 'menu-caret';
  fileCaret.textContent = '▾';
  fileBtn.append(fileLabel, fileCaret);
  fileBtn.addEventListener('click', () => handlers.onFileMenu(fileBtn));

  // Editable document title (with a "modified" dot). Enter / blur commit the
  // rename; Escape reverts. `currentName` is the last committed value.
  let currentName = handlers.initialDocName;
  const titleWrap = document.createElement('div');
  titleWrap.className = 'doc-title';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'doc-title-input';
  titleInput.value = currentName;
  titleInput.setAttribute('aria-label', t('toolbar.doc-name-aria'));
  titleInput.spellcheck = false;
  const dot = document.createElement('span');
  dot.className = 'doc-modified-dot';
  dot.textContent = '●';
  dot.hidden = true;
  dot.title = t('toolbar.modified-title');
  titleWrap.append(dot, titleInput);

  const commitTitle = (): void => {
    const next = titleInput.value.trim();
    if (next === '' || next === currentName) {
      titleInput.value = currentName; // revert empty / no-op
      return;
    }
    handlers.onRenameCurrent(next);
  };
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInput.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      titleInput.value = currentName;
      titleInput.blur();
    }
  });
  titleInput.addEventListener('blur', commitTitle);

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

  const presentBtn = document.createElement('button');
  presentBtn.type = 'button';
  presentBtn.className = 'present-toggle';
  presentBtn.textContent = t('toolbar.present');
  presentBtn.title = t('toolbar.present-title');
  presentBtn.addEventListener('click', () => handlers.onPresent());

  const guidesBtn = document.createElement('button');
  guidesBtn.type = 'button';
  guidesBtn.className = 'guides-toggle';
  guidesBtn.textContent = t('toolbar.guides');
  guidesBtn.title = t('toolbar.guides-title');
  guidesBtn.setAttribute('aria-pressed', 'false');
  guidesBtn.addEventListener('click', () => handlers.onToggleGuides());

  const styleBtn = document.createElement('button');
  styleBtn.type = 'button';
  styleBtn.className = 'menu-trigger';
  styleBtn.title = t('toolbar.style-title');
  const styleLabel = document.createTextNode(t('toolbar.style'));
  const styleCaret = document.createElement('span');
  styleCaret.className = 'menu-caret';
  styleCaret.textContent = '▾';
  styleBtn.append(styleLabel, styleCaret);
  // Don't steal focus from the editor — keeps cursor / selection alive.
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

  // Logo links to the showcase (reciprocal home button).
  const logoLink = document.createElement('a');
  logoLink.href = './showcase.html';
  logoLink.className = 'markpage-logo-slot';
  logoLink.title = 'Open the showcase';
  logoLink.setAttribute('aria-label', 'Open the showcase');
  logoLink.append(makeLogo(document, 'full'));

  const version = document.createElement('span');
  version.className = 'toolbar-version';
  version.textContent = `v${__APP_VERSION__}`;

  const brandSlot = document.createElement('div');
  brandSlot.className = 'toolbar-brand';
  brandSlot.append(logoLink, version);

  const left = document.createElement('div');
  left.className = 'toolbar-left';
  left.append(brandSlot, fileBtn, styleBtn);

  const center = document.createElement('div');
  center.className = 'toolbar-center';
  center.append(titleWrap);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  right.append(helpBtn, previewBtn, presentBtn, guidesBtn, settingsBtn);

  parent.append(left, center, right);

  return {
    setViewMode(mode: ViewMode) {
      previewBtn.setAttribute(
        'aria-pressed',
        mode === 'preview' ? 'true' : 'false',
      );
    },
    setDocName(name: string) {
      currentName = name;
      if (document.activeElement !== titleInput) titleInput.value = name;
    },
    setGuidesPressed(pressed: boolean) {
      guidesBtn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    },
    setModified(modified: boolean) {
      dot.hidden = !modified;
    },
  };
}
