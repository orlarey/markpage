import { ACCEPT_ATTRIBUTE } from '../import';

export interface ToolbarHandlers {
  onOpen(file: File): void;
  onSave(): void;
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

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = ACCEPT_ATTRIBUTE;
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handlers.onOpen(file);
    fileInput.value = '';
  });

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Ouvrir';
  openBtn.title = 'Ouvrir un document (.md, .txt, .html, .docx)';
  openBtn.addEventListener('click', () => fileInput.click());

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Enregistrer';
  saveBtn.title = 'Enregistrer le document Markdown (.md)';
  saveBtn.addEventListener('click', () => handlers.onSave());

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
  left.append(openBtn, saveBtn);

  const center = document.createElement('div');
  center.className = 'toolbar-center';
  center.append(filenameLabel);

  const right = document.createElement('div');
  right.className = 'toolbar-right';
  right.append(downloadBtn, settingsBtn);

  parent.append(left, center, right, fileInput);
}
