export interface ToolbarHandlers {
  onLoad(content: string, filename: string): void;
  onDownload(): void;
  onFilenameChange(name: string): void;
  onSettings(): void;
  initialFilename: string;
}

export function mountToolbar(
  parent: HTMLElement,
  handlers: ToolbarHandlers,
): void {
  parent.innerHTML = '';

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.textContent = 'Ouvrir .md';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.md,.markdown,text/markdown';
  fileInput.style.display = 'none';

  loadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    const baseName = file.name.replace(/\.(md|markdown)$/i, '');
    handlers.onLoad(text, baseName);
    fileInput.value = '';
  });

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.textContent = 'Exporter .pdf';
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
  settingsBtn.textContent = 'Réglages';
  settingsBtn.addEventListener('click', () => handlers.onSettings());

  const left = document.createElement('div');
  left.className = 'toolbar-left';
  left.append(loadBtn);

  const center = document.createElement('div');
  center.className = 'toolbar-center';
  center.append(filenameLabel);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  right.append(downloadBtn, settingsBtn);

  parent.append(left, center, right, fileInput);
}
