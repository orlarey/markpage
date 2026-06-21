/********************************* toolbar.ts **********************************
 *
 * Purpose: Build the app toolbar — brand, the Fichier / Format / Vue menus,
 *   editable doc title, Réglages, and a Help (?) icon — and return a small
 *   control surface for live label / view-mode / modified updates.
 * How: Static DOM via `document.createElement`, each control wired to one of
 *   the caller's handlers. Below ~600px the menu triggers collapse into a
 *   single hamburger (☰) that re-lists them. The Vue menu groups the view
 *   actions (Aperçu / Présenter / Repères) that used to be separate buttons.
 *
 *******************************************************************************/

import { t } from '../i18n/strings';
import { makeLogo } from './logo';
import { openViewMenu } from './view-menu';

export type ViewMode = 'editor' | 'preview';

/**
 * Purpose: All callbacks consumed by the toolbar's controls, plus initial state.
 */
export interface ToolbarHandlers {
  initialDocName: string;
  initialViewMode: ViewMode;
  // Click on [Fichier ▾]. Receives the trigger element so the caller can
  // anchor the dropdown to it.
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
  // Click the conflict badge (⛓️‍💥) → open the keep-mine / take-disk menu,
  // anchored on the badge (Phase 4 two-way sync).
  onResolveConflict(anchor: HTMLElement): void;
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
  // Show / hide the "linked to disk" badge (Phase 4).
  setLinked(linked: boolean): void;
  // Turn the link badge into a clickable conflict (⛓️‍💥) affordance.
  setConflict(conflict: boolean): void;
}

/**
 * Purpose: Build the toolbar controls and append them under `parent`.
 */
export function mountToolbar(
  parent: HTMLElement,
  handlers: ToolbarHandlers,
): ToolbarControl {
  parent.innerHTML = '';

  // View state mirrored here so the Vue menu shows the right checkmarks when
  // it opens (the menu itself is ephemeral, rebuilt on each open).
  let currentViewMode: ViewMode = handlers.initialViewMode;
  let currentGuides = false;

  // ---- a labelled menu trigger ("Label ▾") -----------------------------
  const trigger = (label: string, title: string): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-trigger';
    btn.title = title;
    const caret = document.createElement('span');
    caret.className = 'menu-caret';
    caret.textContent = '▾';
    btn.append(document.createTextNode(label), caret);
    return btn;
  };

  // [Fichier ▾] — document lifecycle + import/export.
  const fileBtn = trigger(t('toolbar.file'), t('toolbar.file-title'));
  fileBtn.classList.add('file-trigger');
  fileBtn.addEventListener('click', () => handlers.onFileMenu(fileBtn));

  // [Format ▾] — Markdown formatting. Don't steal focus from the editor.
  const styleBtn = trigger(t('toolbar.style'), t('toolbar.style-title'));
  styleBtn.addEventListener('mousedown', (e) => e.preventDefault());
  styleBtn.addEventListener('click', () => {
    const r = styleBtn.getBoundingClientRect();
    handlers.onStyle({ x: r.left, y: r.bottom + 4 });
  });

  // [Vue ▾] — view actions (Aperçu / Présenter / Repères).
  const viewBtn = trigger(t('toolbar.view'), t('toolbar.view-title'));
  const openView = (anchor: HTMLElement): void =>
    openViewMenu(anchor, {
      viewMode: currentViewMode,
      guides: currentGuides,
      onTogglePreview: handlers.onTogglePreview,
      onPresent: handlers.onPresent,
      onToggleGuides: handlers.onToggleGuides,
    });
  viewBtn.addEventListener('click', () => openView(viewBtn));

  // [Réglages ▾] — settings / profiles panel.
  const settingsBtn = trigger(t('toolbar.settings'), t('toolbar.settings-title'));
  settingsBtn.addEventListener('click', () => handlers.onSettings());

  // [?] — Help, a compact icon at the end of the bar.
  const helpBtn = document.createElement('button');
  helpBtn.type = 'button';
  helpBtn.className = 'help-btn help-icon';
  helpBtn.textContent = '?';
  helpBtn.title = t('toolbar.help-title');
  helpBtn.setAttribute('aria-label', t('toolbar.help'));
  helpBtn.addEventListener('click', () => handlers.onHelp());

  // [☰] — collapses every menu on narrow screens (shown via CSS only).
  const hamburger = document.createElement('button');
  hamburger.type = 'button';
  hamburger.className = 'toolbar-hamburger';
  hamburger.textContent = '☰';
  hamburger.title = t('toolbar.menu-title');
  hamburger.setAttribute('aria-label', t('toolbar.menu'));
  hamburger.addEventListener('click', () => openMobileSheet());

  // The mobile sheet re-lists the menus; each entry routes to the same
  // handler the desktop trigger uses, anchored under the hamburger.
  const openMobileSheet = (): void => {
    document.getElementById('mobile-menu')?.remove();
    const rect = hamburger.getBoundingClientRect();
    const sheet = document.createElement('div');
    sheet.id = 'mobile-menu';
    sheet.className = 'file-menu';
    sheet.style.right = `${Math.max(4, globalThis.innerWidth - rect.right)}px`;
    sheet.style.top = `${rect.bottom + 4}px`;

    const close = (): void => {
      sheet.remove();
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('resize', close);
    };
    const onDown = (e: MouseEvent): void => {
      if (!sheet.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    const entry = (label: string, action: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'file-menu-item';
      const main = document.createElement('span');
      main.className = 'file-menu-label';
      main.textContent = label;
      b.append(main);
      b.addEventListener('click', () => {
        close();
        action();
      });
      return b;
    };

    sheet.append(
      entry(t('toolbar.file'), () => handlers.onFileMenu(hamburger)),
      entry(t('toolbar.style'), () => {
        const r = hamburger.getBoundingClientRect();
        handlers.onStyle({ x: Math.max(4, r.right - 220), y: r.bottom + 4 });
      }),
      entry(t('toolbar.view'), () => openView(hamburger)),
      entry(t('toolbar.settings'), () => handlers.onSettings()),
      entry(t('toolbar.help'), () => handlers.onHelp()),
    );
    document.body.appendChild(sheet);
    setTimeout(() => {
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('keydown', onKey);
      globalThis.addEventListener('resize', close);
    }, 0);
  };

  // ---- editable document title (modified dot + disk-link badge) ----------
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
  // "Linked to disk" badge (Phase 4): 🔗 = linked & auto-syncing; on
  // divergence it gains `.conflict`, becomes a pulsing ⛓️‍💥, and opens the
  // resolution menu on click.
  const linkBadge = document.createElement('span');
  linkBadge.className = 'doc-link-badge';
  linkBadge.textContent = '🔗';
  linkBadge.hidden = true;
  linkBadge.title = t('toolbar.linked-title');
  linkBadge.addEventListener('click', () => {
    if (linkBadge.classList.contains('conflict')) {
      handlers.onResolveConflict(linkBadge);
    }
  });
  titleWrap.append(dot, titleInput, linkBadge);

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

  // ---- brand --------------------------------------------------------------
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

  // ---- assemble -----------------------------------------------------------
  const menusLeft = document.createElement('div');
  menusLeft.className = 'toolbar-menus-left';
  menusLeft.append(fileBtn, styleBtn, viewBtn);

  const left = document.createElement('div');
  left.className = 'toolbar-left';
  left.append(brandSlot, menusLeft);

  const center = document.createElement('div');
  center.className = 'toolbar-center';
  center.append(titleWrap);

  const menusRight = document.createElement('div');
  menusRight.className = 'toolbar-menus-right';
  menusRight.append(settingsBtn, helpBtn);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  right.append(menusRight, hamburger);

  parent.append(left, center, right);

  return {
    setViewMode(mode: ViewMode) {
      currentViewMode = mode;
    },
    setDocName(name: string) {
      currentName = name;
      if (document.activeElement !== titleInput) titleInput.value = name;
    },
    setGuidesPressed(pressed: boolean) {
      currentGuides = pressed;
    },
    setModified(modified: boolean) {
      dot.hidden = !modified;
    },
    setLinked(linked: boolean) {
      linkBadge.hidden = !linked;
      if (!linked) {
        linkBadge.classList.remove('conflict');
        linkBadge.textContent = '🔗';
        linkBadge.title = t('toolbar.linked-title');
      }
    },
    setConflict(conflict: boolean) {
      linkBadge.classList.toggle('conflict', conflict);
      linkBadge.textContent = conflict ? '⛓️‍💥' : '🔗';
      linkBadge.title = conflict
        ? t('toolbar.conflict-title')
        : t('toolbar.linked-title');
    },
  };
}
