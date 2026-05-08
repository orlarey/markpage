const KEY_DOC = 'md2pdf:doc';
const KEY_FILENAME = 'md2pdf:filename';
const KEY_PAGINATED = 'md2pdf:paginated';

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

// Whether the paginated preview mode (SPEC §13) is currently on. Sticky
// across sessions: a user who turned it on yesterday gets it on today.
export function loadPaginated(): boolean {
  return localStorage.getItem(KEY_PAGINATED) === '1';
}

export function savePaginated(value: boolean): void {
  localStorage.setItem(KEY_PAGINATED, value ? '1' : '0');
}
