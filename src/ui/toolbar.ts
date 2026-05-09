export type ViewMode = 'editor' | 'preview';

export interface ToolbarHandlers {
  onOpen(): void;
  onSave(): void;
  onStyle(anchor: { x: number; y: number }): void;
  onHelp(): void;
  onDownload(): void;
  onFilenameChange(name: string): void;
  onSettings(): void;
  onTogglePreview(): void;
  initialFilename: string;
  initialViewMode: ViewMode;
}

export interface ToolbarControl {
  setViewMode(mode: ViewMode): void;
}

export function mountToolbar(
  parent: HTMLElement,
  handlers: ToolbarHandlers,
): ToolbarControl {
  parent.innerHTML = '';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Ouvrir';
  openBtn.title = 'Ouvrir un document (Ctrl+O / Cmd+O)';
  openBtn.addEventListener('click', () => handlers.onOpen());

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.title = 'Enregistrer le document Markdown (Ctrl+S / Cmd+S)';
  saveBtn.addEventListener('click', () => handlers.onSave());

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

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.textContent = 'Exporter .pdf';
  downloadBtn.title = 'Exporter en PDF (Ctrl+P / Cmd+P)';
  downloadBtn.addEventListener('click', () => handlers.onDownload());

  const filenameLabel = document.createElement('label');
  filenameLabel.textContent = 'Nom : ';

  const filenameInput = document.createElement('input');
  filenameInput.type = 'text';
  filenameInput.value = handlers.initialFilename;
  filenameInput.size = 18;
  filenameInput.addEventListener('input', () => {
    handlers.onFilenameChange(filenameInput.value);
  });
  filenameLabel.appendChild(filenameInput);

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
  left.append(openBtn, saveBtn, styleBtn, previewBtn);

  const center = document.createElement('div');
  center.className = 'toolbar-center';
  center.append(filenameLabel);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  right.append(helpBtn, downloadBtn, settingsBtn);

  parent.append(left, center, right);

  return {
    setViewMode(mode: ViewMode) {
      previewBtn.setAttribute(
        'aria-pressed',
        mode === 'preview' ? 'true' : 'false',
      );
    },
  };
}
