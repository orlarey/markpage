const KEY_DOC = 'md2pdf:doc';
const KEY_FILENAME = 'md2pdf:filename';

export function loadDoc(): string | null {
  return localStorage.getItem(KEY_DOC);
}

export function saveDoc(content: string): void {
  localStorage.setItem(KEY_DOC, content);
}

export function loadFilename(): string | null {
  return localStorage.getItem(KEY_FILENAME);
}

export function saveFilename(name: string): void {
  localStorage.setItem(KEY_FILENAME, name);
}
