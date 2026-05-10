export type ViewMode = 'editor' | 'preview';

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

export interface ToolbarControl {
  setViewMode(mode: ViewMode): void;
  // Update the label shown on [Mon doc ▾] after a rename / switch /
  // create. The trailing caret stays.
  setDocName(name: string): void;
}

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
  docBtn.title = 'Documents';
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
  importBtn.textContent = 'Importer';
  importBtn.title =
    'Importer un fichier (.md / .docx / .html / .txt) comme nouveau document (Ctrl+O / Cmd+O)';
  importBtn.addEventListener('click', () => handlers.onImport());

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'preview-toggle';
  previewBtn.textContent = 'Aperçu';
  previewBtn.title = 'Basculer entre éditeur et aperçu (Ctrl+Enter / Cmd+Enter)';
  previewBtn.setAttribute(
    'aria-pressed',
    handlers.initialViewMode === 'preview' ? 'true' : 'false',
  );
  previewBtn.addEventListener('click', () => handlers.onTogglePreview());

  const styleBtn = document.createElement('button');
  styleBtn.type = 'button';
  styleBtn.className = 'menu-trigger';
  styleBtn.title = 'Mise en forme (titres, gras, listes…)';
  const styleLabel = document.createTextNode('Style');
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
  helpBtn.textContent = 'Aide';
  helpBtn.title = 'Ouvrir le tutoriel';
  helpBtn.addEventListener('click', () => handlers.onHelp());

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'menu-trigger';
  exportBtn.title = 'Exporter le document (Markdown ou PDF)';
  const exportLabel = document.createTextNode('Exporter');
  const exportCaret = document.createElement('span');
  exportCaret.className = 'menu-caret';
  exportCaret.textContent = '▾';
  exportBtn.append(exportLabel, exportCaret);
  exportBtn.addEventListener('click', () => handlers.onExport(exportBtn));

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'menu-trigger';
  settingsBtn.title = 'Ouvrir le panneau de réglages (Ctrl+, / Cmd+,)';
  const settingsLabel = document.createTextNode('Réglages');
  const settingsCaret = document.createElement('span');
  settingsCaret.className = 'menu-caret';
  settingsCaret.textContent = '▾';
  settingsBtn.append(settingsLabel, settingsCaret);
  settingsBtn.addEventListener('click', () => handlers.onSettings());

  const left = document.createElement('div');
  left.className = 'toolbar-left';
  left.append(docBtn, importBtn, styleBtn);

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
